import * as https from "https";
import * as http from "http";
import * as Config from "../config.json";
import * as Crypto from "../lib/crypto";

function Error(Message:string) {
    return {
        Message: Message
    }
}

export async function Request(Method:string, Verb:string, Params:any) {
    return new Promise((Resolve, Reject) => {
        let Data:string = JSON.stringify(Params);
        let Options = {
            hostname: Config.BlockApiHost,
            port: Config.BlockApiPort,
            path: Method,
            method: Verb,
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Data.length,
                "X-Hello-From": "TurtleTips ;)"
            },
            timeout: 15000
        };

        let Request = (Config.Https ? https : http).request(Options, Result => {
            if (Result.statusCode != 200) {
                Reject(Error("Status code " + Result.statusCode));
                return;
            }

            let Body = [];
            Result.on("data", Chunk => {
                Body.push(Chunk);
            });
            Result.on("end", () => {
                try {
                    Resolve(JSON.parse(Buffer.concat(Body).toString()));
                }
                catch (e) {
                    Reject(Error("Invalid JSON response"));
                }
            });
            Result.on("error", Err => {
                Reject(Error(Err.message));
            })
        });
        Request.on("error", Err => {
            Reject(Error(Err.message));
        });
        Request.on("close", () => {
            Reject(Error("Request connection closed"));
        });
        Request.on("timeout", () => {
            Reject(Error("Request timed out"));
        });

        Crypto.SignRequest(Request, Data);
        //console.log("Verification: " + Crypto.VerifyRequest(Request, Data));

        Request.write(Data);
        Request.end();
    });
}

export async function Post(Method:string, Params:any) {
    return await Request(Method, "POST", Params);
}

export async function Get(Method:string, Params?:any) {
    return await Request(Method, "GET", Params ?? {});
}