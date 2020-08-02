// Daemon API endpoints
export enum DAEMON_API {
    HEIGHT = "/height"
};

// How often to update network height (in ms)
export const NETWORK_HEIGHT_INTERVAL = 10000;

// The amount of time to wait between checking for cancellation in each async function (in ms)
export const CANCELLATION_INTERVAL:number = 100;

// Max amount of time a signature is valid for (in ms)
export const SIGNATURE_TIME_DELTA:number = 300000;

// Minimum # of confirmations for a transaction to be considered valid
export const MINIMUM_CONFIRMATIONS:number = 60;

// # of blocks to request at a time during sync
export const SYNC_BLOCK_LIMIT:number = 100;

// Max # of blocks to cache in memory while syncing
export const SYNC_BLOCK_CACHE_LIMIT:number = 500;

// # of hashes to store in last known block hash array
export const LAST_KNOWN_BLOCK_HASHES_LIMIT:number = 50;

// # of blocks between checkpoints
export const BLOCK_CHECKPOINT_INTERVAL:number = 5000;

// Amount of time to wait before updating daemon height
export const DAEMON_UPDATE_TIME:number = 10000;

// Amount of time to wait before requesting sync blocks if the last request was empty or failed (in ms)
export const SYNC_WAIT_TIME:number = 5000;

// Max # of blocks to look through for transactions when a wallet is syncing
export const WALLET_BLOCK_SYNC_MAX:number = 1000;