import * as bodyParser from "body-parser";
import * as controllers from "./controllers";
import { Server } from "@overnightjs/core"
import { Logger } from "@overnightjs/logger";
import WalletScanner from "./Wallet";

class ApiServer extends Server {
    // General variables
    private declare Wallet:WalletScanner

    // Class entry point
    constructor() {
        super();

        // Setup app
        //this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.json({
            // Appends raw body data to the end of rawtrailers to get around express limitations
            verify: (req, res, buf) => {
              req.rawTrailers.push(buf.toString())
            }
          }))

        // Point to front-end code
        if (process.env.NODE_ENV !== "production") {
            this.Log("Starting api server in development mode");
            //this.app.get("*", (req, res) => res.send("Bad request"));
        }
    }

    // Logs a message to the console
    async Log(Message:any, Level?:string) {
        let LogMessage = "[ApiServer] " + Message;
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

    // Starts listening on a chosen port
    async Start(Port:number, Wallet:WalletScanner) {
        // Assign wallet reference
        this.Wallet = Wallet;

        // Setup api controllers
        for (const name in controllers) {
            if (controllers.hasOwnProperty(name)) {
                let Controller = (controllers as any)[name];
                Controller.Init(this.app, this.Wallet);
                this.Log("Added controller " + name);
            }
        }

        // Begin listening for requests
        this.app.listen(Port, () => {
            this.Log("Api server started on port " + Port, "imply");
        });
    }
}

export default ApiServer;