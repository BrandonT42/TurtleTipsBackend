import * as https from "https";
import * as http from "http";
import * as TurtleCoin from "./turtlecoin";
import * as QueryString from "querystring";
import * as Constants from "./constants";
import { KeyPair } from "turtlecoin-utils";
import { StringToHex, Hash } from "./utils";
import { Response } from "./types";

// Handles HTTP API requests
export class Http {
    private Host:string;
    private Port?:number;
    private Https:boolean;

    // Creates a new connection instance
    constructor(Host:string, Port?:number, Https?:boolean) {
        this.Host = Host;
        this.Port = Port;
        this.Https = Https ?? false;
    }

    // Sign an HTTP/S request
    private async SignRequest(Date:string, Payload:string, Path:string, Keys:KeyPair):Promise<string> {
        // Create a seed for us to sign
        let Seed = StringToHex(Date + Payload + Path);
        Seed = Hash(Seed);

        // Generate signature and convert it to base64
        let Signature = await TurtleCoin.Utils.signMessage(Seed, Keys.privateKey);
        let SignatureBuffer = Buffer.alloc(Signature.length, Signature);
        Signature  = SignatureBuffer.toString("base64");

        // Return authorization header
        return `keyId="${Keys.publicKey}",algorithm="ed25519",signature="${Signature}"`;
    }

    // Verify the signature of an HTTP/S response
    private async VerifyResponse(Response:http.IncomingMessage, RequestBody:string):Promise<boolean> {
        try {
            // Verify date header and time delta
            if (!Response.headers["X-Request-Date"]) return false;
            const RequestDate = Response.headers["X-Request-Date"] as string;
            const Timestamp = Date.now();
            const ForeignTimestamp = Date.parse(RequestDate);
            if (Timestamp - ForeignTimestamp > Constants.SIGNATURE_TIME_DELTA) return false;

            // Verify authentication header
            if (!Response.headers["X-Request-Auth"]) return false;
            const Authentication = Response.headers["X-Request-Auth"] as string;

            // Verify algorithm type exists and is ed25519
            let Index = Authentication.indexOf(`algorithm="`);
            if (Index < 0) return;
            Index += `algorithm="`.length;
            const Algorithm = Authentication.substr(Index, Authentication.indexOf(`"`, Index) - Index);
            if (Algorithm.toLowerCase() !== "ed25519") return false;

            // Verify public key exists and is valid
            Index = Authentication.indexOf(`keyId="`);
            if (Index < 0) return;
            Index += `keyId="`.length;
            const PublicKey = Authentication.substr(Index, Authentication.indexOf(`"`, Index) - Index);
            if (!TurtleCoin.Crypto.checkKey(PublicKey)) return false;

            // Verify signature exists
            Index = Authentication.indexOf(`signature="`);
            if (Index < 0) return;
            Index += `signature="`.length;
            let Signature = Authentication.substr(Index, Authentication.indexOf(`"`, Index) - Index);
            let SignatureBuffer = Buffer.from(Signature, "base64");
            Signature = SignatureBuffer.toString();
    
            // Create seed hash
            let Seed = "";
            Seed += StringToHex(RequestDate);
            Seed += StringToHex(RequestBody);
            Seed += StringToHex(Response.headers.host + Response.url);
            let RequestHash = Hash(Seed);
    
            // Verify signature
            return TurtleCoin.Crypto.checkSignature(RequestHash, PublicKey, Signature);
        }
        catch {
            return false;
        }
    }
    
    // Sends a request using the given method and verb
    private async Request(Method:string, Verb:string, Params:any, Keys?:KeyPair):Promise<Response> {
        return new Promise(async (Resolve, Reject) => {
            let Data:string = JSON.stringify(Params);
            let RequestDate = new Date().toUTCString();

            // Create an authorization header if required
            let Authorization = Keys ? await this.SignRequest(RequestDate, Data, Method, Keys) : "";

            // Form path
            let Path = Method;
            Path += Verb === "GET" ? `?${QueryString.encode(Params)}` : "";

            // Assign request options
            let Options = {
                hostname: this.Host,
                port: this.Port,
                path: Path,
                method: Verb,
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Data.length,
                    "X-Request-Date": RequestDate,
                    "X-Request-Auth": Authorization,
                    "X-Hello-From": "TurtleTips ;)"
                },
                timeout: 15000
            };
    
            // Define how request response is handled
            let Request = (this.Https ? https : http).request(Options, Result => {
                // Assemble response packet
                let Body:any[] = [];
                Result.on("data", Chunk => {
                    Body.push(Chunk);
                });
                Result.on("end", async () => {
                    // If status code does not return OK, reject request
                    if (Result.statusCode != 200) {
                        Reject(Error("Status code " + Result.statusCode));
                        return;
                    }

                    // Attempt to parse JSON reply
                    try {
                        let RequestBody = Buffer.concat(Body).toString();
                        Resolve({
                            Value: JSON.parse(RequestBody),
                            Authenticated: await this.VerifyResponse(Result, RequestBody)
                        });
                    }
                    catch (e) {
                        Reject(Error("Invalid JSON response"));
                    }
                });
                Result.on("error", Err => {
                    Reject(Error(Err.message));
                })
            });

            // Connection errored
            Request.on("error", Err => {
                Reject(Error(Err.message));
            });

            // Connection was closed
            Request.on("close", () => {
                Reject(Error("Request connection closed"));
            });

            // Connection timed out
            Request.on("timeout", () => {
                Reject(Error("Request timed out"));
            });
    
            // Write request to host then end connection
            Request.write(Data);
            Request.end();
        });
    }
    
    // Sends a post request to the host
    public async Post(Method:string, Params:any, Keys?:KeyPair):Promise<Response> {
        return new Promise(Resolve => {
            this.Request(Method, "POST", Params, Keys)
            .then(
                Success => {
                    Resolve(Success);
                },
                _ => {
                    Resolve(undefined);
                }
            )
        });
    }
    
    // Sends a get request to the host
    public async Get(Method:string, Params?:any, Keys?:KeyPair):Promise<Response> {
        return new Promise(Resolve => {
            this.Request(Method, "GET", Params ?? {}, Keys)
            .then(
                Success => {
                    Resolve(Success);
                },
                _ => {
                    Resolve(undefined);
                }
            )
        });
    }
}