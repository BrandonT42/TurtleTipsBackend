import * as express from "express";
import { OK, BAD_REQUEST, NETWORK_AUTHENTICATION_REQUIRED } from "http-status-codes";
import { Request, Response } from "express";
import { Log, LogLevel } from "../lib/logger";
import * as Constants from "../lib/constants";
import * as Database from "../lib/database";
import * as TurtleCoin from "../lib/turtlecoin";
import * as Network from "../lib/network";
import * as Sync from "../lib/sync";
import * as Hosts from "../lib/hosts";
import { VerifyRequest, Respond } from "../lib/apiserver";

// Api controller prefix
const Prefix:string = "/api/v0";

class v0 {
    // Initializes the controller and assigns routes
    public static Init(App:express.Application) {
        // Assign routes
        App.get(Prefix + "/hosts", (Request, Response) => this.GetHosts(Request, Response));
        App.get(Prefix + "/height", (Request, Response) => this.GetHeight(Request, Response));
        App.post(Prefix + "/register", (Request, Response) => this.RegisterPubKey(Request, Response));
        App.post(Prefix + "/sync", (Request, Response) => this.RequestSync(Request, Response));
        App.post(Prefix + "/registerhost", (Request, Response) => this.RegisterHost(Request, Response));
    }

    // Gets all known and registered hosts
    public static async GetHosts(Request:Request, Response:Response) {
        Log(Request.socket.remoteAddress + " - hosts request", LogLevel.Debug);

        // Get hosts list
        let Hosts = await Database.GetHosts();
        let Result = {
            hosts: Hosts
        }
        await Respond(Request, Response, JSON.stringify(Result), OK);
    }

    // Gets the backend's current height information
    public static async GetHeight(Request:Request, Response:Response) {
        Log(Request.socket.remoteAddress + " - height request", LogLevel.Debug);

        // Get known heights
        let Result = {
            height: Sync.Height
        };
        await Respond(Request, Response, JSON.stringify(Result), OK);
    }

    // Registers a public key to the database
    public static async RegisterPubKey(Request:Request, Response:Response) {
        Log(Request.socket.remoteAddress + " - register pubkey request", LogLevel.Debug);

        // Verify request signature
        if (!await VerifyRequest(Request)) {
            Log(Request.socket.remoteAddress + " made an unverifiable request", LogLevel.Warning);
            await Respond(Request, Response, "{}", NETWORK_AUTHENTICATION_REQUIRED);
            return;
        }

        // Get variables
        let PublicKey = Request.body["pubkey"];

        // Verify public key is a valid key
        if (TurtleCoin.Crypto.checkKey(PublicKey) === false) {
            await Respond(Request, Response, JSON.stringify({
                Error: "Invalid public key"
            }), BAD_REQUEST);
            return;
        }

        // Try to add to database
        let Success = await Database.StorePubKey(PublicKey, Network.Height);
        await Respond(Request, Response, JSON.stringify({
            Success: Success
        }), OK);
    }

    // Requests wallet sync data for a specific range
    public static async RequestSync(Request:Request, Response:Response) {
        Log(Request.socket.remoteAddress + " - sync request", LogLevel.Debug);

        // Verify request signature
        if (!await VerifyRequest(Request)) {
            Log(Request.socket.remoteAddress + " made an unverifiable request", LogLevel.Warning);
            await Respond(Request, Response, "{}", NETWORK_AUTHENTICATION_REQUIRED);
            return;
        }

        // Get variables
        let PublicKey = Request.body["pubkey"];
        let Height = Request.body["height"];
        let Count = Request.body["count"] ?? Constants.WALLET_BLOCK_SYNC_MAX;

        // Check that count is not exceeding the maximum limit
        if (Count > Constants.WALLET_BLOCK_SYNC_MAX) {
            Count = Constants.WALLET_BLOCK_SYNC_MAX;
        }

        // Check that public key exists in the database
        if (!await Database.CheckPubKeyExists(PublicKey)) {
            await Respond(Request, Response, "{}", BAD_REQUEST);
            return;
        }

        // Query database
        let SyncData = await Database.GetWalletOutputs(PublicKey, Height, Count);
        await Respond(Request, Response, JSON.stringify(SyncData), OK);
    }

    // Requests a host's public key and registers that key if found
    public static async RegisterHost(Request:Request, Response:Response) {
        Log(Request.socket.remoteAddress + " - host key request", LogLevel.Debug);

        // Verify request signature
        if (!await VerifyRequest(Request)) {
            Log(Request.socket.remoteAddress + " made an unverifiable request", LogLevel.Warning);
            await Respond(Request, Response, "{}", NETWORK_AUTHENTICATION_REQUIRED);
            return;
        }

        // Get variables
        let Host = Request.body["host"];

        // Register public key
        let Result = await Hosts.StorePublicKey(Host);
        await Respond(Request, Response, JSON.stringify({
            Success: Result
        }), OK);
    }
}
export default v0;