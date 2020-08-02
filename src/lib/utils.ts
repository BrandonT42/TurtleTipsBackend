import * as TurtleCoin from "./turtlecoin";
import * as CryptoJS from "crypto-js";
import { Errorable } from "./types";

// Converts a string to a hexadecimal representation of that string
export function StringToHex(Value:string) {
    var Hex:string = "";
    for (let i = 0; i < Value.length; i++) {
        let Char = Value.charCodeAt(i).toString(16);
        Hex += ("000" + Char).slice(-4);
    }
    return Hex
}

// Hashes an arbitrary string
export function Hash(Value:string) {
    let Hex = Buffer.from(Value).toString("hex");
    return TurtleCoin.Crypto.cn_fast_hash(Hex);
}

// Encrypts an arbitrary string with a password key
export function Encrypt(Value:string, Password:string) {
    return CryptoJS.AES.encrypt(Value, Password).toString();
}

// Decrypts an encrypted string using the supplied password key
export function Decrypt(Value:string, Password:string):Errorable<string> {
    try {
        let Message = CryptoJS.AES.decrypt(Value, Password).toString(CryptoJS.enc.Utf8);
        if (!Message) return { Success: false, Error: "Incorrect password" };
        else return { Success: true, Value: Message };
    }
    catch {
        return { Success: false, Error: "Incorrect password" };
    }
}
