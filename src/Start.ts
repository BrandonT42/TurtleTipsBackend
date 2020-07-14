import Server from "./ApiServer";
import Wallet from "./Wallet";
import { Sqlite } from "./Database";

async function StartBackend() {
    // Initialize database
    Sqlite.Setup();

    // Initialize and start wallet scanning
    let Scanner = new Wallet();
    await Scanner.Start();

    // Initialize and start api server
    let ApiServer = new Server();
    await ApiServer.Start(8080, Scanner);
}

StartBackend();