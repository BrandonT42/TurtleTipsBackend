import * as Async from "./lib/async";
import * as ApiServer from "./lib/apiserver";
import * as TurtleCoin from "./lib/turtlecoin";
import * as Database from "./lib/database";
import * as Network from "./lib/network";
import * as Sync from "./lib/sync";
import * as Config from "./config.json";

// Cancellation token that can cancel all async operations
export const CancellationToken = new Async.CancellationToken();

// Bind exit handlers to be able to clean up before closing
process.on('exit', Exit.bind(null));
process.on('SIGINT', Exit.bind(null));
process.on('SIGUSR1', Exit.bind(null));
process.on('SIGUSR2', Exit.bind(null));
process.on('uncaughtException', Exit.bind(null));
async function Exit() {
    CancellationToken.Cancel(true);
    await ApiServer.Stop();
    await Database.Stop();
    process.exit();
}

// Begins background operations
async function Start() {
    // Initialize TurtleCoin utilities
    await TurtleCoin.Init();

    // Initialize database connection
    await Database.Init();

    // Initialize network monitor
    await Network.Init(CancellationToken);

    // Initialize sync process
    await Sync.Init(CancellationToken);

    // Initialize api server
    await ApiServer.Init(Config.ApiPort);
}
Start();