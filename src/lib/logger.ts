import * as Config from "../config.json";

// Log levels in order of descending importance
export enum LogLevel {
    "Fatal",
    "Error",
    "Warning",
    "Info",
    "Debug"
}

// Console color codes
const Color = {
    [LogLevel.Fatal]: "\x1b[5m\x1b[31m",
    [LogLevel.Error]: "\x1b[31m",
    [LogLevel.Warning]: "\x1b[33m",
    [LogLevel.Info]: "\x1b[97m",
    [LogLevel.Debug]: "\x1b[37m"
};

// Logs a message to the console
export function Log(Message:string, Level?:LogLevel) {
    // Set default log level to info
    Level = Level ?? LogLevel.Info;
    
    // Check log level
    if (Config.LogLevel < Level) return;

    // Write to console
    console.log(Color[Level], Message, "\x1b[0m");
}