import * as http from "http";
import * as Crypto from "turtlecoin-crypto";
import * as Config from "../config.json"
import { Output, CryptoNote } from "turtlecoin-utils"
import { Request } from 'express';

// 300 seconds
const SignatureTimeDelta = 300000;
const CryptoUtils = new CryptoNote();

function ToHex(Value:string) {
    var Hex:string = "";
    for (let i = 0; i < Value.length; i++) {
        let Char = Value.charCodeAt(i).toString(16);
        Hex += ("000" + Char).slice(-4);
    }
    return Hex
}

export function SignRequest(Request:http.ClientRequest, Payload:string) {
    // Add UTC formatted date header
    let RequestDate = new Date().toUTCString();
    Request.setHeader("Date", RequestDate);

    // Seed hash for signing
    let Seed = "";
    Seed += ToHex(RequestDate);
    Seed += ToHex(Payload);
    Seed += ToHex(Request.getHeader("host") + Request.path);
    let RequestHash = CryptoUtils.cnFastHash(Seed);

    // Generate signature
    let Signature = CryptoUtils.generateSignaturePrimitive(RequestHash,
        Config.PublicViewKey, Config.PrivateViewKey);
    let SignatureBuffer = Buffer.alloc(Signature.length, Signature);
    Signature  = SignatureBuffer.toString("base64");

    // Assign authorization header
    let Header = "";
    Header += `keyId="${Config.PublicViewKey}",`;
    Header += `algorithm="ed25519",`;
    Header += `signature="${Signature}"`;
    Request.setHeader("Authorization", Header);
}

export function VerifyRequest(Request:Request):boolean {
    try {
        // Get raw request body
        let RawBody = Request.rawTrailers.pop();

        // Get date header
        let DateIndex = Request.rawHeaders.indexOf("X-Request-Date");
        if (DateIndex < 0) return false;
        let RequestDate = Request.rawHeaders[DateIndex + 1];

        // Verify time delta
        let Timestamp = Date.now();
        let ForeignTimestamp = Date.parse(RequestDate);
        if (Timestamp - ForeignTimestamp > SignatureTimeDelta) return false;

        // Get auth header
        let AuthIndex = Request.rawHeaders.indexOf("X-Request-Auth");
        if (AuthIndex < 0) return false;
        let Header = Request.rawHeaders[AuthIndex + 1];

        // Verify algorithm type
        let AlgorithmIndex = Header.indexOf(`algorithm="`) + `algorithm="`.length;
        let Algorithm = Header.substr(AlgorithmIndex, Header.indexOf(`"`, AlgorithmIndex) - AlgorithmIndex);
        if (Algorithm.toLowerCase() !== "ed25519") return false;

        // Verify public key
        let PublicKeyIndex = Header.indexOf(`keyId="`) + 7;
        let PublicKey = Header.substr(PublicKeyIndex, Header.indexOf(`"`, PublicKeyIndex) - PublicKeyIndex);
        if (!Crypto.checkKey(PublicKey)) return false;

        // Get request signature
        let SignatureIndex = Header.indexOf(`signature="`) + 11;
        let Signature = Header.substr(SignatureIndex, Header.indexOf(`"`, SignatureIndex) - SignatureIndex);
        let SignatureBuffer = Buffer.from(Signature, "base64");
        Signature = SignatureBuffer.toString();

        // Seed hash for verification
        let Seed = "";
        Seed += ToHex(RequestDate);
        Seed += ToHex(RawBody);
        Seed += ToHex(Request.headers.host + Request.url);
        let RequestHash = CryptoUtils.cnFastHash(Seed);

        // Verify request signature
        return CryptoUtils.verifySignaturePrimitive(RequestHash, PublicKey, Signature);
    }
    catch {
        return false;
    }
}

export class OwnedOutput {
    public TransactionHash:string;
    public Owner:string; // (Public Spend Key)
    public Amount:number;
    public GlobalIndex:number;
    public TransactionIndex:number; // (Output Index)
    public PublicEphemeral:string; // (Output Key)
    public DerivedKey:string; // (Instead of TX PubKey)
}

export async function ScanTransaction(Transaction:any, PublicSpendKeys:string[]) {
    // Create a list of outputs
    let Outputs:OwnedOutput[] = [];

    // Generate derived key
    let Derivation = Crypto.generateKeyDerivation(Transaction.publicKey,
        Config.PrivateViewKey)[1] as string;

    // Loop through transaction outputs
    for (let OutputIndex = 0; OutputIndex < Transaction.outputs.length; OutputIndex++) {
        // Get current output
        let Output:Output = Transaction.outputs[OutputIndex];

        // Derive public spend key for this output
        let DerivedSpendKey = Crypto.underivePublicKey(Derivation, OutputIndex, Output.key)[1] as string;

        // Check if this output is meant for us
        if (PublicSpendKeys.includes(DerivedSpendKey)) {
            Outputs.push({
                TransactionHash: Transaction.hash,
                Owner: DerivedSpendKey,
                Amount: Output.amount,
                GlobalIndex: Output.globalIndex,
                TransactionIndex: OutputIndex,
                PublicEphemeral: Output.key,
                DerivedKey: Derivation
            });
        }

        /*
        // Check each public spend key in our list for ownership
        for (let KeyIndex = 0; KeyIndex < PublicSpendKeys.length; KeyIndex++) {
            let PublicSpendKey = PublicSpendKeys[KeyIndex];
            let PublicEphemeral = Crypto.derivePublicKey(Derivation, OutputIndex,
                PublicSpendKey)[1] as string;
            if (Output.key == PublicEphemeral) {
                // Add to output array
                Outputs.push({
                    TransactionHash: Transaction.hash,
                    Owner: PublicSpendKey,
                    Amount: Output.amount,
                    GlobalIndex: Output.globalIndex,
                    TransactionIndex: OutputIndex,
                    PublicEphemeral: PublicEphemeral,
                    DerivedKey: Derivation
                });
            }
        }
        */
    }

    // Return owned outputs
    return Outputs;
}

export class DecryptedOutput extends OwnedOutput {
    public PrivateEphemeral:string;
    public KeyImage:string;
}

export async function ConvertOwnedOutput(OwnedOutput:OwnedOutput, PrivateSpendKey:string) {
    // Derive private ephemeral key from the information we know
    let PrivateEphemeral:string = Crypto.deriveSecretKey(OwnedOutput.DerivedKey,
        OwnedOutput.TransactionIndex, PrivateSpendKey)[1] as string;

    // Generate key image
    let KeyImage:string = Crypto.generateKeyImage(OwnedOutput.PublicEphemeral, PrivateEphemeral)[1] as string;

    // Convert and return output object
    let DecryptedOutput = OwnedOutput as DecryptedOutput;
    DecryptedOutput.PrivateEphemeral = PrivateEphemeral;
    DecryptedOutput.KeyImage = KeyImage;
    return DecryptedOutput;
}