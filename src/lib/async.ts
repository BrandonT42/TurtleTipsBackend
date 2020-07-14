import { Constants } from "../Constants";

// Returns a JSON error message
export function Error(Message:string) {
    return JSON.stringify({Error: Message});
}

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

/**
 * Performs a loop until cancelled
 * 
 * @param Callback          An async function to perform in a loop
 * @param Cancel            This function's cancellation token
 * @param DoNotInterrupt    If this is set, looped function must finish before cancellation
 */
export async function Loop(Callback:Function, Cancel:CancellationToken) {
    await new Promise(Resolve => {
        setInterval(() => {
            if (Cancel.ForceCancelled) Resolve();
        }, Constants.CANCELLATION_INTERVAL);
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

/**
 * Allows an asynchronous function to sleep for a specified amount of time
 * 
 * @param Milliseconds  An async function to perform in a loop
 * @param Cancel        This function's cancellation token
 */
export async function Sleep(Milliseconds:number, Cancel?:CancellationToken) {
    await new Promise(Resolve => {
        if (Cancel) {
            setInterval(() => {
                if (Cancel.Cancelled) Resolve();
            }, Constants.CANCELLATION_INTERVAL);
        }
        setTimeout(Resolve, Milliseconds);
    });
}

/**
 * Performs a loop until a conditional returns false or until cancelled
 * 
 * @param Conditional       A conditional that must return true to perform the loop
 * @param Callback          An async function to perform in a loop
 * @param Cancel            This function's cancellation token
 * @param DoNotInterrupt    If this is set, looped function must finish before cancellation
 */
export async function While(Conditional:Function, Callback:Function, Cancel:CancellationToken) {
    await new Promise(Resolve => {
        setInterval(() => {
            if (Cancel.ForceCancelled) Resolve();
        }, Constants.CANCELLATION_INTERVAL);
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