import * as Crypto from "turtlecoin-crypto";
import * as express from 'express';
import * as helpers from "../lib/async";
import * as http from "../lib/http";
import { OK, BAD_REQUEST, NETWORK_AUTHENTICATION_REQUIRED, INTERNAL_SERVER_ERROR } from 'http-status-codes';
import { Request, Response } from 'express';
import { Logger } from '@overnightjs/logger';
import WalletScanner from '../Wallet';
import { Sqlite } from "../Database";
import { VerifyRequest } from "../lib/crypto";
import { Constants } from "../Constants";

// Api controller prefix
const Prefix:string = "/api/v0";

class v0 {
    // General variables
    private static declare Wallet:WalletScanner;

    // Logs a message to the console
    private static async Log(Message:any, Level?:string) {
        let LogMessage = "[v0] " + Message;
        let LogLevel = Level ?? "info";
        switch (LogLevel.toLowerCase()) {
            case "warning":
                Logger.Warn(LogMessage);
                break;
            case "error":
                Logger.Err(LogMessage);
                break;
            case "imply":
                Logger.Imp(LogMessage);
                break;
            default:
                Logger.Info(LogMessage);
                break;
        }
    }

    // Initializes the controller and assigns routes
    public static Init(App:express.Application, Wallet:WalletScanner) {
        // Assign wallet reference 
        this.Wallet = Wallet;

        // Assign routes
        App.get(Prefix + "/height", (Request, Response) => this.GetHeight(Request, Response));
        App.get(Prefix + "/hosts", (Request, Response) => this.GetHosts(Request, Response));
        App.post(Prefix + "/send", (Request, Response) => this.SendTransaction(Request, Response));
        App.post(Prefix + "/register", (Request, Response) => this.RegisterPubKey(Request, Response));
        App.post(Prefix + "/tip", (Request, Response) => this.RequestTip(Request, Response));
        App.post(Prefix + "/sync", (Request, Response) => this.RequestSync(Request, Response));
    }

    public static async GetHosts(Request:Request, Response:Response) {
        this.Log(Request.socket.remoteAddress + " - hosts request");

        // Get hosts list
        let Hosts = await Sqlite.GetHosts();
        let Result = {
            hosts: Hosts
        }
        Response.status(OK).send(JSON.stringify(Result));
    }

    public static async RegisterPubKey(Request:Request, Response:Response) {
        this.Log(Request.socket.remoteAddress + " - register pubkey request");

        // Verify request signature
        // TODO - uncomment this
        /*
        if (!VerifyRequest(Request)) {
            Response.status(NETWORK_AUTHENTICATION_REQUIRED).send("{}");
        }*/

        // Get variables
        let PublicKey = Request.body["pubkey"];
        let NetworkHeight = this.Wallet.LastKnownNetworkHeight;

        // Verify public key is a valid key
        if (Crypto.checkKey(PublicKey) === false) {
            Response.status(BAD_REQUEST).send(helpers.Error("Invalid public key"));
            return;
        }

        // Try to add to database
        let Success = await Sqlite.StorePubKey(PublicKey, NetworkHeight);
        Response.status(OK).send(JSON.stringify({
            Success: Success
        }));
    }

    public static async GetHeight(Request:Request, Response:Response) {
        this.Log(Request.socket.remoteAddress + " - height request");

        // Get known heights
        let Result = {
            height: this.Wallet.LastKnownBlockHeight
        };
        Response.status(OK).send(JSON.stringify(Result));
    }

    public static async SendTransaction(Request:Request, Response:Response) {
        this.Log(Request.socket.remoteAddress + " - send transaction request");

        // Verify request signature
        if (!VerifyRequest(Request)) {
            Response.status(NETWORK_AUTHENTICATION_REQUIRED).send("{}");
            return;
        }
        
        try {
            let RawTransaction:string = Request.body["transaction"];
            console.log(RawTransaction);
            http.Post("/sendrawtransaction", {
                tx_as_hex: RawTransaction
            }).then(
                Success => {
                    // Transaction sent
                    Logger.Imp("Sent transaction: ");
                    console.log(Success);
                    Response.status(OK).send("{}");
                },
                Failure => {
                    // Transaction failed to send
                    Logger.Imp("Failed to send transaction: ");
                    console.log(Failure);
                    Response.status(OK).send("{}");
                }
            );
        }
        catch (e) {
            Response.status(BAD_REQUEST).send("{}");
        }
    }

    public static async RequestTip(Request:Request, Response:Response) {
        this.Log(Request.socket.remoteAddress + " - tip request");

        // Verify request signature
        if (!VerifyRequest(Request)) {
            Response.status(NETWORK_AUTHENTICATION_REQUIRED).send("{}");
            return;
        }

        // Query database and respond
        let Owner = await Sqlite.GetDomainOwner(Request.body["domain"]);
        if (Owner !== undefined) {
            Response.status(OK).send(JSON.stringify({
                pubkey: Owner
            }));
        }
        else Response.status(OK).send("{}");
    }

    public static async RequestSync(Request:Request, Response:Response) {
        this.Log(Request.socket.remoteAddress + " - sync request");

        // Verify request signature
        // TODO - Uncomment this after figuring out why it broke
        /*
        if (!VerifyRequest(Request)) {
            Response.status(NETWORK_AUTHENTICATION_REQUIRED).send("{}");
            return;
        }*/

        // Get variables
        let PublicKey = Request.body["pubkey"];
        let Height = Request.body["height"];
        let Count = Request.body["count"] ?? Constants.WALLET_BLOCK_SYNC_MAX;

        // Check that count is not exceeding the maximum limit
        if (Count > Constants.WALLET_BLOCK_SYNC_MAX) {
            Count = Constants.WALLET_BLOCK_SYNC_MAX;
        }

        // Check that public key exists in the database
        if (!await Sqlite.CheckPubKeyExists(PublicKey)) {
            Response.status(BAD_REQUEST).send("{}");
            return;
        }

        // Query database
        let SyncData = await Sqlite.GetWalletOutputs(PublicKey, Height, Count);
        Response.status(OK).send(JSON.stringify(SyncData));
    }
}

export default v0;