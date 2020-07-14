export class Constants {
// Minimum # of confirmations for a transaction to be considered valid
public static MINIMUM_CONFIRMATIONS:number = 60;

// # of blocks to request at a time during sync
public static SYNC_BLOCK_LIMIT:number = 100;

// Max # of blocks to cache in memory while syncing
public static SYNC_BLOCK_CACHE_LIMIT:number = 500;

// # of hashes to store in last known block hash array
public static LAST_KNOWN_BLOCK_HASHES_LIMIT:number = 50;

// # of blocks between checkpoints
public static BLOCK_CHECKPOINT_INTERVAL:number = 5000;

// Amount of time to wait before updating daemon height
public static DAEMON_UPDATE_TIME:number = 10000;

// Amount of time to wait before requesting sync blocks if the last request was empty or failed (in ms)
public static SYNC_WAIT_TIME:number = 5000;

// Max # of blocks to look through for transactions when a wallet is syncing
public static WALLET_BLOCK_SYNC_MAX:number = 1000;

// Sets up database tables
public static BLOCK_TABLE = `CREATE TABLE IF NOT EXISTS "block_heights" (
    "block_hash"	varchar(64) NOT NULL UNIQUE,
    "height"	bigint NOT NULL UNIQUE,
    PRIMARY KEY("block_hash")
);`;
public static TRANSACTIONS_TABLE = `CREATE TABLE IF NOT EXISTS "transactions" (
    "transaction_hash"	varchar(64) NOT NULL UNIQUE,
    "block_hash"	varchar(64) NOT NULL,
    "payment_id"	varchar NOT NULL,
    "unlock_time"	bigint NOT NULL,
    PRIMARY KEY("transaction_hash"),
    FOREIGN KEY("block_hash") REFERENCES "block_heights"("block_hash")
);`;
public static SYNC_TABLE = `CREATE TABLE IF NOT EXISTS "sync" (
    "height"	BIGINT NOT NULL,
    "last_checkpoint"	BIGINT NOT NULL,
    "checkpoints"	BLOB,
    "last_known_block_hashes"	BLOB
);`;
public static PUBKEYS_TABLE = `CREATE TABLE IF NOT EXISTS "pubkeys" (
    "pubkey"	VARCHAR(64) NOT NULL UNIQUE,
    "creation_height"	BIGINT NOT NULL,
    PRIMARY KEY("pubkey")
);`;
public static INPUTS_TABLE = `CREATE TABLE IF NOT EXISTS "inputs" (
    "transaction_hash"	varchar(64) NOT NULL,
    "key_image"	varchar(64) NOT NULL UNIQUE,
    "amount"	bigint NOT NULL,
    PRIMARY KEY("key_image","transaction_hash"),
    FOREIGN KEY("transaction_hash") REFERENCES "transactions"("transaction_hash")
);`;
public static OUTPUTS_TABLE = `CREATE TABLE IF NOT EXISTS "outputs" (
    "transaction_hash"	varchar(64) NOT NULL,
    "pubkey" varchar(64) NOT NULL,
    "transaction_index"	INTEGER NOT NULL,
    "global_index"	BIGINT NOT NULL UNIQUE,
    "amount"	bigint NOT NULL,
    "public_ephemeral"	varchar(64) NOT NULL,
    "derivation"	varvhar(64) NOT NULL,
    PRIMARY KEY("transaction_hash","transaction_index"),
    FOREIGN KEY("transaction_hash") REFERENCES "transactions"("transaction_hash"),
    FOREIGN KEY("pubkey") REFERENCES "pubkeys"("pubkey")
);`;
public static DOMAINS_TABLE = `CREATE TABLE IF NOT EXISTS "domains" (
    "domain"	varchar NOT NULL UNIQUE,
    "pubkey"	varchar(64) NOT NULL,
    PRIMARY KEY("domain"),
    FOREIGN KEY("pubkey") REFERENCES "pubkeys"("pubkey")
);`;
}