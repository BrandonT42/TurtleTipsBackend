import dns from "dns";
import * as TurtleCoin from "./turtlecoin";
import * as Config from "../config.json";

// Attempts to get a public key for a host
export async function GetPublicKey(Host:string) {
    return new Promise(Resolve => {
        // Get TXT records for the given host
        dns.resolveTxt(Host, (_, Addresses) => {
            // Iterate over all records
            Addresses.forEach(Address => Address.forEach(Record => {
                // Check for our txt key
                if (Record.toLowerCase().startsWith(Config.TxtRecord) &&
                    Record.indexOf("=") > 0) {
                    // Get public key from record and verify it
                    let PublicKey = Record.substring(Record.indexOf("=") + 1);
                    if (TurtleCoin.Crypto.checkKey(PublicKey)) {
                        Resolve(PublicKey);
                    }
                }
            }));
            
            // If all else fails, return undefined
            Resolve(undefined);
        });
    });
}