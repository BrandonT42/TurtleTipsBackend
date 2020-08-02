// An error-able, variable return type interface
export type Errorable<T> = {
    Success: false,
    Error: string
} | {
    Success: true,
    Value: T
}

// HTTP/S response object
export type Response = {
    Value: any;
    Authenticated: boolean;
}

// Output data containing only what we need
export type OwnedOutput = {
    // Corresponding transaction hash
    TransactionHash:string;

    // Public Spend Key
    Owner:string;

    // Units
    Amount:number;

    // Global Index
    GlobalIndex:number;

    // Transaction Output Index
    TransactionIndex:number;

    // Output Key
    PublicEphemeral:string;

    // Instead of TX PubKey
    DerivedKey:string;

    // Unlock Height
    UnlockTime:number;
}

// Sync block received from block api
export type SyncBlock = {
    blockHash: string;
    height: number;
    timestamp: number;
    transactions: SyncTransaction[];
}

// Sync transaction received from block api
export type SyncTransaction = {
    hash: string;
    publicKey: string;
    unlockTime: number;
    paymentId: string;
    inputs: SyncInput[];
    outputs: SyncOutput[];
}

// Sync input received from block api
export type SyncInput = {
    keyImage: string;
    amount: number;
    type?: number;
}

// Sync output received from block api
export type SyncOutput = {
    index: number;
    globalIndex: number;
    key: string;
    amount: number;
    type?: number;
}

// Database-stored input
export type Input = {
    transaction_hash: string,
    key_image: string,
    amount: number,
    block_height: number
}

// Database-stored output
export type Output = {
    pubkey: string,
    transaction_hash: string,
    transaction_index: number,
    unlock_time: number,
    global_index: number,
    amount: number,
    public_ephemeral: string,
    derivation: string
}

// Sent to client when syncing a wallet
export type SyncData = {
    Inputs: Input[],
    Outputs: Output[]
}