import * as Config from "./config.json";
import * as http from "./lib/http";
import * as async from "./lib/async";
import * as crypto from "./lib/crypto";
import { Constants } from "./Constants";
import { Sqlite } from "./Database";
import { Logger } from '@overnightjs/logger';
import { CryptoNote } from 'turtlecoin-utils';

// TODO - Move fetched blocks into an unscanned blocks array so they're ready when last chunk is done scanning
// TODO - Handle database errors to keep skipping from happening
// TODO - Map inputs to outputs, based on key image??

class WalletScanner {
    // General variables
    public CryptoUtils:CryptoNote;
    private CancellationToken:async.CancellationToken;

    // Sync variables
    public LastKnownBlockHeight:number;
    public LastKnownNetworkHeight:number;
    private LastCheckpointHeight:number;
    private Checkpoints:string[];
    private SearchedBlocks:string[];
    private UnsearchedBlocks:Array<any>;

    // Class entry point
    constructor() {
        this.Log("Private view key set to " + Config.PrivateViewKey, "imply");
        this.CryptoUtils = new CryptoNote();
    }

    //#region Utilities
    async Log(Message:any, Level?:string) {
        let LogMessage = "[Wallet] " + Message;
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
    //#endregion

    //#region Database
    async StoreBlockHash(Block:any) {
        // Update last known block height
        this.LastKnownBlockHeight = Block.height;

        // Check if block is already stored
        if (this.SearchedBlocks.length > 0 && this.SearchedBlocks[0] === Block.blockHash) {
            return;
        }

        // If we're at a checkpoint height, add hash to start of checkpoint array
        if (this.LastCheckpointHeight + Constants.BLOCK_CHECKPOINT_INTERVAL < Block.height) {
            this.LastCheckpointHeight = Block.height;
            this.Checkpoints.unshift(Block.blockHash);
        }

        // Add block hash to our hash list, limit to X entries
        this.SearchedBlocks.unshift(Block.blockHash);
        if (this.SearchedBlocks.length > Constants.LAST_KNOWN_BLOCK_HASHES_LIMIT) {
            this.SearchedBlocks.pop();
        }

        // Update sync data in database
        Sqlite.StoreSyncData(this.LastKnownBlockHeight, this.LastCheckpointHeight,
            this.Checkpoints, this.SearchedBlocks);
    }
    //#endregion

    //#region Sync Functions
    async GetLastKnownBlockHashes() {
        // Return a combined array of block hashes
        let Hashes = [];
        this.UnsearchedBlocks.forEach(Block => {
            Hashes.push(Block.blockHash);
        });
        Hashes = Hashes.concat(this.SearchedBlocks);
        let Count = Hashes.length < Constants.SYNC_BLOCK_LIMIT ? Hashes.length : Constants.SYNC_BLOCK_LIMIT;
        Hashes = Hashes.splice(0, Count);
        let Output = Hashes.concat(this.Checkpoints);
        return Output;
    }

    async ScanBlock(Block:any) {
        return new Promise(async Resolve => {
            // Only scan this block if there are public keys for this height
            let PublicKeys = await Sqlite.GetPubKeys(Block.height);
            if (PublicKeys.length !== 0) {
                // Iterate over transactions transactions
                Block.transactions.forEach(async (Transaction: any) => {
                    let Outputs = await crypto.ScanTransaction(Transaction, PublicKeys);
                    if (Outputs.length > 0) {
                        this.Log(Outputs.length + " valid outputs found in tx " + Transaction.hash, "imply");
                        Sqlite.StoreTransaction(Transaction, Block, Outputs);
                    }
                });
                let Transactions = Block.transactions;
                for (let TxIndex = 0; TxIndex < Transactions.length; TxIndex++) {
                    
                }
            }

            // Store block hash
            await this.StoreBlockHash(Block);
            Resolve();
        });
    }

    async GetNetworkHeight() {
        let Height = await http.Get("/height");
        return Height["network_height"];
    }

    async GetBlocks() {
        // Create a sync data request
        let SyncData:any;

        // Get last known block hash array
        let LastKnownBlockHashes = await this.GetLastKnownBlockHashes();

        // No blocks stored, get our starting block
        if (LastKnownBlockHashes.length === 0) {
            this.Log("No block hashes stored, getting first sync block...");
            // Populate sync request
            SyncData = {
                scanHeight: Config.SyncHeight,
                blockCount: 1
            }
        }

        // Otherwise sync by hashes
        else {
            // Calculate height delta to known if we need to sync
            let HeightDelta = this.LastKnownNetworkHeight - this.LastKnownBlockHeight;
            if (HeightDelta <= 0) return;
            
            // Calculate how many blocks to grab in our request
            let BlockCount = (HeightDelta > Constants.SYNC_BLOCK_LIMIT) ?
                Constants.SYNC_BLOCK_LIMIT : HeightDelta;

            // If the block count falls outside our cache limit, do not send request, loop will sleep
            if (this.UnsearchedBlocks.length + BlockCount > Constants.SYNC_BLOCK_CACHE_LIMIT) {
                return;
            }

            // Populate sync request
            SyncData = {
                lastKnownBlockHashes: LastKnownBlockHashes,
                blockCount: BlockCount
            }
        }

        // Get blocks from block api
        let Blocks = await http.Post("/sync", SyncData).catch(Error => {
            this.Log("Couldn't get blocks: " + Error["Message"], "warning");
        }) as any[];
        if (!Blocks) return Blocks;

        // Sort blocks by height and return result
        return Blocks.sort((a, b) => {
            return b.height - a.height;
        });
    }

    async Sync() {
        this.Log("Starting sync...", "imply");
        this.CancellationToken = new async.CancellationToken();

        // Start network update loop
        async.Loop(async () => {
            // Get current network height
            this.LastKnownNetworkHeight = await this.GetNetworkHeight();
            await async.Sleep(Constants.DAEMON_UPDATE_TIME);
        }, this.CancellationToken);

        // Start block collection loop
        this.UnsearchedBlocks = [];
        async.Loop(async () => {
            // Only grab blocks if we have room to store them in memory
            if (this.UnsearchedBlocks.length >= Config.BlockCacheLimit) {
                this.Log("Block cache limit reached, waiting...");
                await async.Sleep(Constants.SYNC_WAIT_TIME, this.CancellationToken);
                return;
            }

            // Get an amount of blocks
            let TimeStart = Date.now();
            let Blocks = await this.GetBlocks() as any[];
            if (!Blocks || Blocks.length === 0) {
                this.Log("No blocks fetched, waiting...");
                await async.Sleep(Constants.SYNC_WAIT_TIME, this.CancellationToken);
                return;
            }
            this.UnsearchedBlocks = Blocks.concat(this.UnsearchedBlocks);
            let TimeEnd = Date.now();
            let Duration = (TimeEnd - TimeStart) / 1000;
            this.Log("Fetched " + Blocks.length + " blocks in " + Duration + " seconds");
        }, this.CancellationToken);

        // Start block processing loop
        async.Loop(async () => {
            // Check if there are blocks to sync
            if (this.UnsearchedBlocks.length === 0) {
                // No blocks to be synced, wait before trying again
                await async.Sleep(1000, this.CancellationToken);
                return true;
            }

            // Sync next block in queue
            let Block = this.UnsearchedBlocks.pop();
            this.ScanBlock(Block).then(
                () => {},
                () => {
                    this.UnsearchedBlocks.push(Block);
                }
            );
        }, this.CancellationToken);

        // Start transaction unlock loop
        /*async.Loop(async () => {
            // TODO - check for newly unlocked/confirmed transactions
        }, this.CancellationToken);*/

        // Start sync progress loop
        async.Loop(async () => {
            this.Log(this.LastKnownBlockHeight + " / " + this.LastKnownNetworkHeight + " blocks synced (" +
            (this.LastKnownBlockHeight / this.LastKnownNetworkHeight * 100).toFixed(2) + "%)")
            await async.Sleep(5000, this.CancellationToken);
        }, this.CancellationToken);
    }
    //#endregion

    async Start() {
        // Load sync data
        let SyncData = await Sqlite.GetSyncData();
        this.LastKnownBlockHeight = SyncData.Height;
        this.LastKnownNetworkHeight = SyncData.Height;
        this.LastCheckpointHeight = SyncData.LastCheckpoint;
        this.Checkpoints = SyncData.Checkpoints;
        this.SearchedBlocks = SyncData.SearchedBlocks;
            
        // Begin syncing
        await this.Sync();
    }

    async Stop() {
        this.CancellationToken.Cancel();
    }
}

export default WalletScanner;