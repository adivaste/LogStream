import type { WorkerEvent } from "@/types/workerMessages";

type ChromeRuntime = {
    sendMessage?: (_message: WorkerEvent) => void;
}

type ChromeApi = {
    runtime?: ChromeRuntime;
}

const getChromeApi = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

export const broadcastWorkerEvent = (event: WorkerEvent) => {
    try {
        getChromeApi()?.runtime?.sendMessage?.(event);
    } catch {
        // Extension views may be closed. Callers should continue quietly.
    }
}
