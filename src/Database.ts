import Database from "better-sqlite3";
import dns from "dns";
import * as Config from "./config.json";
import * as Crypto from "turtlecoin-crypto";
import { Logger } from "@overnightjs/logger";
import { Constants } from "./Constants";

// Sqlite database connection
const DB = new Database(Config.Database, {
    memory: false,
    readonly: false,
    fileMustExist: false
});

// Executes an SQL string without variables
function Exec(Sql:string) {
    return DB.exec(Sql);
}

// Executes an SQL string with variables
function Run(Sql:string, Data:any[]) {
    return DB.prepare(Sql).run(...Data);
}

// Inserts data into a table
function Insert(TableName:string, Data:any) {
    if (!Array.isArray(Data)) Data = [Data];
    let Keys = Object.keys(Data[0]);
    let KeyNames = Keys.join(", ");
    let Sql = "INSERT INTO " + TableName + " (" + KeyNames + ") VALUES ";

    const Values = [];
    let Count = 0;
    Data.forEach(Value => {
        if (Count > 0) Sql += ", ";
        Sql += "(" + Array.from({length: Keys.length}, () => "?").join(", ") + ")";
        Keys.forEach(Key => Values.push(Value[Key]));
        Count++;
    });

    return Run(Sql, Values);
}

// Replaces data within a table
function Replace(TableName:string, Data:any) {
    if (!Array.isArray(Data)) Data = [Data];
    let Keys = Object.keys(Data[0]);
    let KeyNames = Keys.join(", ");
    let Sql = "REPLACE INTO " + TableName + " (" + KeyNames + ") VALUES ";

    const Values = [];
    let Count = 0;
    Data.forEach(Value => {
        if (Count > 0) Sql += ", ";
        Sql += "(" + Array.from({length: Keys.length}, () => "?").join(", ") + ")";
        Keys.forEach(Key => Values.push(Value[Key]));
        Count++;
    });

    return Run(Sql, Values);
}

function Log(Message:string, Level?:string) {
    let LogMessage = "[Database] " + Message;
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

// Database handling wallet data
export class Sqlite {
    // Initializes database and creates tables if needed
    public static async Setup() {
        // Create tables
        Exec(Constants.BLOCK_TABLE);
        Exec(Constants.DOMAINS_TABLE);
        Exec(Constants.INPUTS_TABLE);
        Exec(Constants.OUTPUTS_TABLE);
        Exec(Constants.PUBKEYS_TABLE);
        Exec(Constants.SYNC_TABLE);
        Exec(Constants.TRANSACTIONS_TABLE);

        // Add default sync data if it doesn't exist
        Run(
            "INSERT INTO sync (height, last_checkpoint) " +
            "SELECT ?, ? WHERE NOT EXISTS (SELECT * FROM sync)",
            [
                Config.SyncHeight,
                Config.SyncHeight
            ]
        );

        // TODO - remove this debug code
        try {
            Insert("pubkeys", {
                pubkey: "f405b8cd44e8123dad80764cc6d6f93442eeb0fe1cf653bd1d5adbbca26f4c5b",
                creation_height: Config.SyncHeight
            });
        }
        catch {}

        Log("Database loaded");
    }

    // Stores or replaces a pubkey
    public static async StorePubKey(PublicKey:string, NetworkHeight:number):Promise<boolean> {
        try {
            Replace(
                "pubkeys",
                {
                    pubkey: PublicKey,
                    creation_height: NetworkHeight
                }
            );
            Log("Public key registered: " + PublicKey);
            return true;
        }
        catch {
            return false;
        }
    }

    // Stores a transaction
    public static StoreTransaction(Transaction:any, Block:any, Outputs:any[]) {
        // Store block data
        try {
            Insert(
                "block_heights",
                {
                    block_hash: Block.blockHash,
                    height: Block.height
                }
            );
        } catch {}

        // Store transaction data
        Insert(
            "transactions",
            {
                transaction_hash: Transaction.hash,
                block_hash: Block.blockHash,
                payment_id: Transaction.paymentId,
                unlock_time: Transaction.unlockTime
            }
        );

        // Store inputs
        let InputValues = [];
        Transaction.inputs.forEach(Input => {
            InputValues.push({
                transaction_hash: Transaction.hash,
                key_image: Input.keyImage,
                amount: Input.amount,
                block_height: Block.height
            });
        })
        Insert(
            "inputs",
            InputValues
        );

        // Store outputs
        let OutputValues = [];
        Outputs.forEach(Output => {
            console.log({
                pubkey: Output.Owner,
                transaction_hash: Transaction.hash,
                transaction_index: Output.TransactionIndex,
                unlock_time: Transaction.unlockTime,
                global_index: Output.GlobalIndex,
                amount: Output.Amount,
                public_ephemeral: Output.PublicEphemeral,
                derivation: Output.DerivedKey
            });
            OutputValues.push({
                pubkey: Output.Owner,
                transaction_hash: Transaction.hash,
                transaction_index: Output.TransactionIndex,
                unlock_time: Transaction.unlockTime,
                global_index: Output.GlobalIndex,
                amount: Output.Amount,
                public_ephemeral: Output.PublicEphemeral,
                derivation: Output.DerivedKey
            });
        })
        Insert(
            "outputs",
            OutputValues
        );
    }

    // Stores current sync data
    public static async StoreSyncData(LastKnownBlockHeight:number, LastCheckpointHeight:number,
        Checkpoints:string[], SearcheSqlitelocks:string[]) {
        Run(
            "UPDATE sync SET height = ?, last_checkpoint = ?, checkpoints = ?, last_known_block_hashes = ?",
            [
                LastKnownBlockHeight,
                LastCheckpointHeight,
                JSON.stringify(Checkpoints),
                JSON.stringify(SearcheSqlitelocks)
            ]
        );
    }

    // Stores or replaces a domain owner's pubkey
    public static async StoreDomainOwner(Domain:string, PublicKey:string):Promise<boolean> {
        // Try to store domain and pubkey, will fail if key isn't already registered
        //   or domain is already registered
        try {
            Replace(
                "domains",
                {
                    domain: Domain,
                    pubkey: PublicKey
                }
            );
            return true;
        }
        catch {
            return false;
        }
    }

    // Gets data from last sync
    public static async GetSyncData() {
        let SyncData = DB
            .prepare("SELECT * FROM sync LIMIT 1")
            .get();
        return {
            Height: SyncData.height,
            LastCheckpoint: SyncData.last_checkpoint,
            Checkpoints: (SyncData.checkpoints) ?
                JSON.parse(SyncData.checkpoints) : [],
            SearchedBlocks: (SyncData.last_known_block_hashes) ?
                JSON.parse(SyncData.last_known_block_hashes) : []
        };
    }

    // Gets all known pubkeys
    public static async GetPubKeys(Height:number):Promise<string[]> {
        return DB
            .prepare("SELECT pubkey FROM pubkeys WHERE creation_height <= ?")
            .all([ Height ])
            .map(Row => Row["pubkey"]) as string[];
    }

    // Checks a TXT record for pubkey information
    private static async StoreTxtRecord(Domain:string):Promise<string> {
        return new Promise(Resolve => {
            dns.resolveTxt(Domain, (_, Addresses) => {
                // Iterate over all records
                Addresses.forEach(Address => Address.forEach(Record => {
                    // Check for our txt key
                    if (Record.toLowerCase().startsWith(Config.TxtRecord)) {
                        // Get public key from record and verify it
                        let PublicKey = Record.substring(Record.indexOf("=") + 1);
                        if (Crypto.checkKey(PublicKey)) {
                            // Add to our database and return value
                            let Success = Sqlite.StoreDomainOwner(Domain, PublicKey);
                            if (Success) {
                                Log(Domain + " registered to " + PublicKey);
                                Resolve(PublicKey);
                            }
                            else Log(Domain + " attempted to register an invalid public key");
                        }
                    }
                }));
                
                // If all else fails, return undefined
                Resolve(undefined);
            });
        });
    }

    // Gets the pubkey belonging to a domain
    public static async GetDomainOwner(Domain:string):Promise<string> {
        return new Promise(async Resolve => {
            // Throws if there isn't a matching record
            try {
                let DomainInfo = DB
                    .prepare("SELECT * FROM domains WHERE domain = ?")
                    .get([ Domain ]);
                Resolve(DomainInfo.pubkey);
            }
            catch {
                // TODO - support user accounts
                if (Domain.includes("@")) {
                    Resolve(undefined);
                }

                // If the public key isn't already registered, query its DNS records
                else {
                    let PublicKey = await Sqlite.StoreTxtRecord(Domain);
                    Resolve(PublicKey);
                }
            }
        });
    }

    // Checks if a pubkey is registered
    public static async CheckPubKeyExists(PublicKey:string) {
        try {
            let Value = DB
                .prepare("SELECT * FROM pubkeys WHERE pubkey = ? LIMIT 1")
                .all([ PublicKey ]);
            return (Value.length > 0);
        }
        catch {
            return false;
        }
    }

    // Gets sync data for a given pubkey within a range of heights
    public static async GetWalletOutputs(PublicKey:string, Height:number, Count:number) {
        try {
            // Query relevant blocks for this range
            let Blocks = DB
                .prepare("SELECT block_hash FROM block_heights WHERE height >= ? AND height < ?")
                .all([ Height, Height + Count ]);
            if (Blocks.length === 0) return [];
            
            // Create an SQL string for querying transactions
            let TransactionsSql = "SELECT * FROM transactions WHERE block_hash IN (";
            let BlockHashes = [];
            let BlockCount = 0;
            Blocks.forEach(Block => {
                if (BlockCount > 0) TransactionsSql += ", ?";
                else TransactionsSql += "?";
                BlockHashes.push(Block["block_hash"]);
                BlockCount++;
            });
            TransactionsSql += ")";
                
            // Query relevant transactions
            let Transactions = DB
                .prepare(TransactionsSql)
                .all(BlockHashes);

            // Create SQL strings for querying inputs and outputs
            let InputsSql = "SELECT * FROM inputs WHERE transaction_hash IN (";
            let OutputsSql = "SELECT * FROM outputs WHERE transaction_hash IN (";
            let TransactionHashes = [];
            let TransactionCount = 0;
            Transactions.forEach(Transaction => {
                if (TransactionCount > 0) {
                    InputsSql += ", ?";
                    OutputsSql += ", ?";
                }
                else {
                    InputsSql += "?";
                    OutputsSql += "?";
                }
                TransactionHashes.push(Transaction["transaction_hash"]);
                TransactionCount++;
            });
            InputsSql += ")";
            OutputsSql += ") AND pubkey = ?";
                
            // Query relevant inputs
            let Inputs = DB
                .prepare(InputsSql)
                .all(TransactionHashes);
                
            // Query relevant outputs
            TransactionHashes.push(PublicKey);
            let Outputs = DB
                .prepare(OutputsSql)
                .all(TransactionHashes);

            // Return found outputs
            return {
                Inputs: Inputs,
                Outputs: Outputs
            };
        }
        catch (Err) {
            console.log(Err);
            return {
                Inputs: [],
                Outputs: []
            };
        }
    }
}