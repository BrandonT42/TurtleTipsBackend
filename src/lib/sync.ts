import * as Async from "./async";
import * as Constants from "./constants";
import * as Database from "./database";
import * as TurtleCoin from "./turtlecoin";
import * as Network from "./network";
import * as Config from "../config.json";
import { OwnedOutput, SyncInput, SyncOutput, SyncTransaction, SyncBlock } from "./types";
import { LogLevel, Log } from "./logger";
import { CancellationToken } from "./async";

// Last known block height
export let Height:number = 0;

// The last height a checkpoint was stored at
let LastCheckpointHeight:number = 0;

// An array of checkpoint hashes
let Checkpoints:string[] = [];

// An array of searched block hashes
let SearchedBlocks:string[] = [];

// An array of blocks that still need to be searched for transactions
let UnsearchedBlocks:Array<any> = [];

// Stores a scanned block's hash
async function StoreBlockHash(Block:any) {
    // Update last known block height
    Height = Block.height;

    // Check if block is already stored
    if (SearchedBlocks.length > 0 && SearchedBlocks[0] === Block.blockHash) {
        return;
    }

    // If we're at a checkpoint height, add hash to start of checkpoint array
    if (LastCheckpointHeight + Constants.BLOCK_CHECKPOINT_INTERVAL < Block.height) {
        LastCheckpointHeight = Block.height;
        Checkpoints.unshift(Block.blockHash);
    }

    // Add block hash to our hash list, limit to X entries
    SearchedBlocks.unshift(Block.blockHash);
    if (SearchedBlocks.length > Constants.LAST_KNOWN_BLOCK_HASHES_LIMIT) {
        SearchedBlocks.pop();
    }

    // Update sync data in database
    Database.StoreSyncData(Height, LastCheckpointHeight, Checkpoints, SearchedBlocks);
}

// Gets a combined array of block hashes
async function GetLastKnownBlockHashes() {
    // Combine searched and unsearched block hashes
    let Hashes:string[] = [];
    UnsearchedBlocks.forEach(Block => {
        Hashes.push(Block.blockHash);
    });
    Hashes = Hashes.concat(SearchedBlocks);

    // Check for hash array limit
    let Count = Hashes.length < Constants.SYNC_BLOCK_LIMIT ? Hashes.length : Constants.SYNC_BLOCK_LIMIT;
    Hashes = Hashes.splice(0, Count);

    // Combine hashes with checkpoint hashes
    let Output = Hashes.concat(Checkpoints);
    return Output;
}

// Scans a transaction for owned inputs/outputs
async function ScanTransaction(Transaction:SyncTransaction, PublicSpendKeys:string[]) {
    // Create a list of outputs
    let Outputs:OwnedOutput[] = [];

    // Generate derived key
    let Derivation = TurtleCoin.Crypto.generateKeyDerivation(Transaction.publicKey, Config.PrivateViewKey);

    // Loop through transaction outputs
    for (let OutputIndex = 0; OutputIndex < Transaction.outputs.length; OutputIndex++) {
        // Get current output
        let Output:SyncOutput = Transaction.outputs[OutputIndex];

        // Derive public spend key for this output
        let DerivedSpendKey = TurtleCoin.Crypto.underivePublicKey(Derivation, OutputIndex, Output.key);

        // Check if this output is meant for us, and if so, hold onto it
        if (PublicSpendKeys.includes(DerivedSpendKey)) {
            Outputs.push({
                TransactionHash: Transaction.hash,
                Owner: DerivedSpendKey,
                Amount: Output.amount,
                GlobalIndex: Output.globalIndex,
                TransactionIndex: OutputIndex,
                PublicEphemeral: Output.key,
                DerivedKey: Derivation,
                UnlockTime: Transaction.unlockTime
            });
        }
    }

    // Return owned outputs
    return Outputs;
}

// Scans a block for owned inputs/outputs
async function ScanBlock(Block:SyncBlock) {
    return new Promise(async Resolve => {
        // Only scan this block if there are public keys for this height
        let PublicKeys = await Database.GetPubKeys(Block.height);
        if (PublicKeys.length !== 0) {
            // Iterate over all transactions in this block
            Block.transactions.forEach(async (Transaction: any) => {
                // Search for any owned outputs
                let Outputs = await ScanTransaction(Transaction, PublicKeys);
                if (Outputs.length > 0) {
                    Log(Outputs.length + " valid outputs found in tx " + Transaction.hash);
                    Database.StoreTransaction(Transaction, Block, Outputs);
                }
            });
        }

        // Store block hash
        await StoreBlockHash(Block);
        Resolve();
    });
}

// Gets new blocks to sync
async function GetBlocks() {
    // Create a sync data request
    let SyncData:any;

    // Get last known block hash array
    let LastKnownBlockHashes = await GetLastKnownBlockHashes();

    // No blocks stored, get our starting block
    if (LastKnownBlockHashes.length === 0) {
        Log("No block hashes stored, getting first sync block...", LogLevel.Warning);

        // Populate sync request
        SyncData = {
            scanHeight: Config.SyncHeight,
            blockCount: 1
        }
    }

    // Otherwise sync by hashes
    else {
        // Calculate height delta to known if we need to sync
        let HeightDelta = Network.Height - Height;
        if (HeightDelta <= 0) return;
        
        // Calculate how many blocks to grab in our request
        let BlockCount = (HeightDelta > Constants.SYNC_BLOCK_LIMIT) ?
            Constants.SYNC_BLOCK_LIMIT : HeightDelta;

        // If the block count falls outside our cache limit, do not send request, loop will sleep
        if (UnsearchedBlocks.length + BlockCount > Constants.SYNC_BLOCK_CACHE_LIMIT) {
            return;
        }

        // Populate sync request
        SyncData = {
            lastKnownBlockHashes: LastKnownBlockHashes,
            blockCount: BlockCount
        }
    }

    // Get blocks from network
    let Blocks = await Network.GetBlocks(SyncData);
    if (!Blocks) return undefined;

    // Sort blocks by height and return result
    return Blocks.sort((a, b) => {
        return b.height - a.height;
    });
}

// Initializes sync process
export async function Init(CancellationToken:CancellationToken) {
    // Get sync data from database
    let SyncData = await Database.GetSyncData();
    Height = SyncData.Height;
    Checkpoints = SyncData.Checkpoints;
    LastCheckpointHeight = SyncData.LastCheckpoint;
    SearchedBlocks = SyncData.SearchedBlocks;
    UnsearchedBlocks = [];

    // Start block collection loop
    Async.Loop(async () => {
        // Only grab blocks if we have room to store them in memory
        if (UnsearchedBlocks.length >= Config.BlockCacheLimit) {
            Log("Block cache limit reached, waiting...", LogLevel.Debug);
            await Async.Sleep(Constants.SYNC_WAIT_TIME, CancellationToken);
            return;
        }

        // Get an amount of blocks
        let TimeStart = Date.now();
        let Blocks = await GetBlocks();
        if (!Blocks || Blocks.length === 0) {
            Log("No blocks fetched, waiting...", LogLevel.Debug);
            await Async.Sleep(Constants.SYNC_WAIT_TIME, CancellationToken);
            return;
        }
        UnsearchedBlocks = Blocks.concat(UnsearchedBlocks);
        let TimeEnd = Date.now();
        let Duration = (TimeEnd - TimeStart) / 1000;
        Log("Fetched " + Blocks.length + " blocks in " + Duration + " seconds", LogLevel.Debug);
    }, CancellationToken);

    // Start block processing loop
    Async.Loop(async () => {
        // Check if there are blocks to sync
        if (UnsearchedBlocks.length === 0) {
            // No blocks to be synced, wait before trying again
            await Async.Sleep(1000, CancellationToken);
            return true;
        }

        // Sync next block in queue
        let Block = UnsearchedBlocks.pop();
        ScanBlock(Block).then(() => {},
            () => {
                UnsearchedBlocks.push(Block);
            }
        );
    }, CancellationToken);

    // Start sync progress loop
    Async.Loop(async () => {
        Log(`${Height} / ${Network.Height} blocks synced (${(Height / Network.Height * 100).toFixed(2)}%)`);
        await Async.Sleep(5000, CancellationToken);
    }, CancellationToken);
}