// The amount of time to wait between checking for cancellation in an async function (in ms)
const CANCELLATION_INTERVAL = 100;

// Async cancellation token
export class CancellationToken {
    public Cancelled:boolean = false;
    public ForceCancelled:boolean = false;
    constructor(InitialValue?:boolean) {
        this.Cancelled = InitialValue ?? false;
    }
    public Cancel(StopAllOperations?:boolean) {
        this.Cancelled = true;
        this.ForceCancelled = StopAllOperations ?? false;
    }
}

// Performs a loop until cancelled
export async function Loop(Callback:Function, Cancel:CancellationToken) {
    await new Promise(Resolve => {
        setInterval(() => {
            if (Cancel.ForceCancelled) Resolve();
        }, CANCELLATION_INTERVAL);
        let _Loop = async () => {
            if (Cancel.Cancelled === true) Resolve();
            else {
                await Callback();
                setTimeout(_Loop, 0);
            }
        }
        setTimeout(_Loop, 0);
    });
}

// Allows an asynchronous function to sleep for a specified amount of time
export async function Sleep(Milliseconds:number, Cancel?:CancellationToken) {
    await new Promise(Resolve => {
        if (Cancel) {
            setInterval(() => {
                if (Cancel.Cancelled) Resolve();
            }, CANCELLATION_INTERVAL);
        }
        setTimeout(Resolve, Milliseconds);
    });
}

// Performs a loop until a conditional returns false or until cancelled
export async function While(Conditional:Function, Callback:Function, Cancel:CancellationToken) {
    await new Promise(Resolve => {
        setInterval(() => {
            if (Cancel.ForceCancelled) Resolve();
        }, CANCELLATION_INTERVAL);
        let _Loop = async () => {
            if (Cancel.Cancelled === true) Resolve();
            else if (await Conditional() !== true) Resolve();
            else {
                await Callback();
                setTimeout(_Loop, 0);
            }
        }
        _Loop();
    });
}