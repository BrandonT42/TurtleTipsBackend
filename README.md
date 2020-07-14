# TurtleTips Backend
The TurtleTips backend service handles wallet syncing and network interconnectivity.

## Setup
1. Clone git locally
2. Open terminal in local folder
3. Run `npm run watch` to begin debugging

## Lay of the Land
Initial code is ran from `Start.ts`, which initializes the database connection, the wallet scanning service, and the API listening service.

Database functions are in `Database.ts`, wallet scanning operations are in `Wallet.ts`, API handling is in `ApiServer.ts`, and all constants and descriptions of what they are for are in `Constants.ts`.

API handlers are in `controllers/`, API versions are managed through `controllers/index.ts`.

The `lib/` folder contains useful scripts: `async.ts` provides some C#-esque async operations, `crypto.ts` supplies a few crypto operations, and, you guessed it, `http.ts` has HTTP operations.

All managed configuration options are in `config.json`, and they should be pretty self-explanatory.
