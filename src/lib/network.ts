import { Http } from "./http";
import * as Async from "./async";
import * as Constants from "./constants";
import * as Config from "../config.json";
import { SyncBlock } from "./types";

// Connection to daemon/blockapi
const Daemon:Http = new Http(Config.DaemonHost, Config.DaemonPort, Config.DaemonHttps);

// Last known network height
export let Height:number = 0;

// Connection status
export let Connected:boolean = false;

// Initializes network monitor
export async function Init(CancellationToken:Async.CancellationToken) {
    // Begin height update loop
    Async.Loop(async () => {
        // Request height from daemon
        let Response = await Daemon.Get(Constants.DAEMON_API.HEIGHT);
        if (Response
            && Response.Value.network_height) {
            Height = Response.Value.network_height;
            Connected = true;
        }
        else Connected = false;
        await Async.Sleep(Constants.NETWORK_HEIGHT_INTERVAL);
    }, CancellationToken);
}

// Gets a list of sync blocks from block api
export async function GetBlocks(Params:any):Promise<SyncBlock[]> {
    let Blocks = await Daemon.Post("/sync", Params);
    return Blocks.Value;
}