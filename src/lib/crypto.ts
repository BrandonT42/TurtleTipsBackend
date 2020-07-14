import * as http from "http";
import * as Crypto from "turtlecoin-crypto";
import * as Config from "../config.json"
import { CryptoNote } from "turtlecoin-utils"
import { Request } from 'express';
import { Constants } from "../Constants";

const CryptoUtils = new CryptoNote();

// Converts a string into a hex representation
function ToHex(Value:string) {
    var Hex:string = "";
    for (let i = 0; i < Value.length; i++) {
        let Char = Value.charCodeAt(i).toString(16);
        Hex += ("000" + Char).slice(-4);
    }
    return Hex
}

// Signs an HTTP request
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

// Verifies the signature of an HTTP request
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
        if (Timestamp - ForeignTimestamp > Constants.SIGNATURE_TIME_DELTA) return false;

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
