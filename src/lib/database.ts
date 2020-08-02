import * as Config from "../config.json";
import { Log, LogLevel } from "./logger";
import { SyncTransaction, SyncBlock, Input, Output, OwnedOutput, SyncData } from "./types";
const DB = require("better-sqlite3-helper");

// Executes an SQL string with variables
function Run(Sql:string, Data:any[]) {
    return DB().prepare(Sql).run(...Data);
}

// Inserts data into a table
function Insert(TableName:string, Data:any) {
    if (!Array.isArray(Data)) Data = [Data];
    let Keys = Object.keys(Data[0]);
    let KeyNames = Keys.join(", ");
    let Sql = "INSERT INTO " + TableName + " (" + KeyNames + ") VALUES ";

    const Values:any[] = [];
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

// Initializes database and creates tables if needed
export async function Init() {
    // Set up database connection
    DB({
        path: Config.Database,
        memory: false,
        readonly: false,
        fileMustExist: false,
        migrate: {
            force: false,
            table: "migration",
            migrationsPath: "./dist/migrations"
        }
    });

    // Add default sync data if it doesn't exist
    Run(
        "INSERT INTO sync (height, last_checkpoint) " +
        "SELECT ?, ? WHERE NOT EXISTS (SELECT * FROM sync)",
        [
            Config.SyncHeight,
            Config.SyncHeight
        ]
    );

    // Done
    Log("Database initialized");
}

// Stores or replaces a pubkey
export async function StorePubKey(PublicKey:string, NetworkHeight:number):Promise<boolean> {
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
export function StoreTransaction(Transaction:SyncTransaction, Block:SyncBlock, Outputs:OwnedOutput[]) {
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
    let InputValues:Input[] = [];
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
    let OutputValues:Output[] = [];
    Outputs.forEach(Output => {
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
export async function StoreSyncData(LastKnownBlockHeight:number, LastCheckpointHeight:number,
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
export async function StoreHostKey(Domain:string, PublicKey:string):Promise<boolean> {
    try {
        Replace(
            "hosts",
            {
                host: Domain,
                pubkey: PublicKey
            }
        );
        return true;
    }
    catch {
        return false;
    }
}

// Gets all stored hosts
export async function GetHosts() {
    return DB()
        .prepare("SELECT host, pubkey FROM hosts")
        .all();
}

// Gets data from last sync
export async function GetSyncData() {
    let SyncData = DB()
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
export async function GetPubKeys(Height:number):Promise<string[]> {
    return DB()
        .prepare("SELECT pubkey FROM pubkeys WHERE creation_height <= ?")
        .all([ Height ])
        .map(Row => Row["pubkey"]) as string[];
}

// Gets the pubkey belonging to a domain
export async function GetHostKey(Domain:string):Promise<string> {
    return new Promise(async Resolve => {
        // Throws if there isn't a matching record
        try {
            let DomainInfo = DB()
                .prepare("SELECT * FROM hosts WHERE host = ?")
                .get([ Domain ]);
            Resolve(DomainInfo.pubkey);
        }
        catch {
            Resolve(undefined);
        }
    });
}

// Checks if a pubkey is registered
export async function CheckPubKeyExists(PublicKey:string) {
    try {
        let Value = DB()
            .prepare("SELECT * FROM pubkeys WHERE pubkey = ? LIMIT 1")
            .all([ PublicKey ]);
        return (Value.length > 0);
    }
    catch {
        return false;
    }
}

// Gets sync data for a given pubkey within a range of heights
export async function GetWalletOutputs(PublicKey:string, Height:number, Count:number):Promise<SyncData> {
    try {
        // Query relevant blocks for this range
        let Blocks = DB()
            .prepare("SELECT block_hash FROM block_heights WHERE height >= ? AND height < ?")
            .all([ Height, Height + Count ]);
        if (Blocks.length === 0) {
            return {
                Inputs: [],
                Outputs: []
            };
        }
        
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
        let Transactions = DB()
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
        let Inputs = DB()
            .prepare(InputsSql)
            .all(TransactionHashes) as Input[];
            
        // Query relevant outputs
        TransactionHashes.push(PublicKey);
        let Outputs = DB()
            .prepare(OutputsSql)
            .all(TransactionHashes) as Output[];

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

// Gracefully stops the database to prevent any future locking issues
export async function Stop() {
    Log("Stopping database...", LogLevel.Warning);
    await DB().close();
}