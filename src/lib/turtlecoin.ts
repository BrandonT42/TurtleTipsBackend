import * as TurtleCoinUtils from "turtlecoin-utils";
import { Crypto as TurtleCoinCrypto, CryptoNote, Address } from "turtlecoin-utils";
import { Log } from "./logger";

// Handles TurtleCoin core related operations
export let Utils:CryptoNote;
export let Crypto:TurtleCoinCrypto;
export let Addresses:Address;

// Returns true when utils are done loading
let Loaded:boolean;

// Initializes crypto utils, needs to be awaited as a workaround for browser compatibility
export async function Init() {
    await new Promise(Resolve => {
        TurtleCoinUtils.on("ready", () => {
            Utils = new CryptoNote();
            Crypto = new TurtleCoinCrypto();
            Loaded = true;
            Log("TurtleCoin utils initialized");
            Resolve();
        });
    });
}