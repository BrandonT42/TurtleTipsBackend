import * as bodyParser from "body-parser";
import * as Controllers from "../controllers";
import { Server } from "@overnightjs/core";
import { Log, LogLevel } from "./logger";
import * as Constants from "./constants";
import * as TurtleCoin from "./turtlecoin";
import { StringToHex, Hash } from "./utils";
import { Request, Response } from "express";
import * as Config from "../config.json";
import { OK } from "http-status-codes";

// Express server to handle api calls
const ApiServer = new Server();
let ServerInstance:any;

// Verifies a request to ensure it is coming from a valid pubkey
export async function VerifyRequest(Request:Request) {
    // Verify date header and time delta
    if (!Request.headers["x-request-date"]) return false;
    const RequestDate = Request.headers["x-request-date"] as string;
    const Timestamp = Date.now();
    const ForeignTimestamp = Date.parse(RequestDate);
    if (Timestamp - ForeignTimestamp > Constants.SIGNATURE_TIME_DELTA) return false;

    // Verify authentication header
    if (!Request.headers["x-request-auth"]) return false;
    const Authentication = Request.headers["x-request-auth"] as string;

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
    let RequestBody = Request.rawTrailers.pop() ?? "{}";
    let Seed = RequestDate + RequestBody + Request.url;
    if (Seed.endsWith("?")) Seed = Seed.substr(0, Seed.length - 1);
    Seed = StringToHex(Seed);
    Seed = Hash(Seed);

    // Verify signature
    try {
        await TurtleCoin.Utils.verifyMessageSignature(Seed, PublicKey, Signature);
        return true;
    }
    catch {
        return false;
    }
}

// Responds to a request with a signed reply
export async function Respond(Request:Request, Response:Response, Payload:string, StatusCode?:number) {
    // Get current date string
    const ResponseDate = new Date().toUTCString();
    
    // Create a seed for us to sign
    let Seed = ResponseDate + Payload + Request.protocol + "://" + Request.hostname + ":" + Config.ApiPort + Request.url;
    if (Seed.endsWith("?")) Seed = Seed.substr(0, Seed.length - 1);
    Seed = StringToHex(Seed);
    Seed = Hash(Seed);

    // Generate signature and convert it to base64
    let Signature = await TurtleCoin.Utils.signMessage(Seed, Config.PrivateViewKey);
    const SignatureBuffer = Buffer.alloc(Signature.length, Signature);
    Signature  = SignatureBuffer.toString("base64");
    const Authorization = `keyId="${Config.PublicViewKey}",algorithm="ed25519",signature="${Signature}"`;

    // Set headers
    Response.setHeader("X-Request-Date", ResponseDate);
    Response.setHeader("X-Request-Auth", Authorization);
    Response.setHeader("X-Hello-From", "TurtleTips ;)");

    // Set status
    const Status = StatusCode ?? OK;
    Response.status(Status);
    
    // Write payload
    Response.send(Payload);
}

// Initializes api server and hooks api controllers
export async function Init(Port:number) {
    // Setup express server
    ApiServer.app.use(bodyParser.urlencoded({
        extended: true
    }), bodyParser.json({
        // Appends raw body data to the end of rawtrailers to get around express limitations
        verify: (req, _, buf) => {
            req.rawTrailers.push(buf.toString())
        }
    }));

    // Check node environment
    if (process.env.NODE_ENV !== "production") {
        Log("Starting api server in development mode", LogLevel.Debug);
    }

    // Setup api controllers
    for (const Constroller in Controllers) {
        if (Controllers.hasOwnProperty(Constroller)) {
            let Controller = (Controllers as any)[Constroller];
            Controller.Init(ApiServer.app);
            Log("Added controller " + Constroller, LogLevel.Debug);
        }
    }

    // Begin listening for requests
    ServerInstance = ApiServer.app.listen(Port, () => {
        Log("Api server started on port " + Port);
    });
}

// Stops the api server
export async function Stop() {
    Log("Stopping API server...", LogLevel.Warning);
    ServerInstance.close();
}