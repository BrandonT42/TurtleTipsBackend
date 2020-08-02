import * as Database from "./database";
import * as TurtleCoin from "./turtlecoin";
import * as Config from "../config.json";
let dns = require("dns");

// Attempts to get a public key for a host
export async function StorePublicKey(Host:string):Promise<boolean> {
    return new Promise(async Resolve => {
        // Check database for a corresponding public key
        let PublicKey = await Database.GetHostKey(Host);
        if (PublicKey) Resolve(false);

        // Get TXT records for the given host
        dns.resolveTxt(Host, (_, Addresses) => {
            // Check addresses exist
            if (!Addresses) Resolve(false);

            // Iterate over all records
            Addresses.forEach(Address => Address.forEach(async Record => {
                // Check for our txt key
                if (Record.toLowerCase().startsWith(Config.TxtRecord) && Record.indexOf("=") > 0) {
                    // Get public key from record and verify it
                    PublicKey = Record.substring(Record.indexOf("=") + 1);
                    if (TurtleCoin.Crypto.checkKey(PublicKey)) {
                        // Store newly found public key
                        Resolve(await Database.StoreHostKey(Host, PublicKey));
                    }
                }
            }));
            
            // If all else fails, return undefined
            Resolve(false);
        });
    });
}