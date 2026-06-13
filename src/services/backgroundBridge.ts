import { handleLocalWorkerRequest } from "./localLogStreamBackend";
import type { WorkerRequest, WorkerResponse } from "@/types/workerMessages";

type ChromeRuntime = {
    runtime?: {
        sendMessage?: (
            _message: WorkerRequest,
            _callback: (_response: WorkerResponse) => void
        ) => void;
        lastError?: {
            message?: string;
        };
    };
}

const getChromeRuntime = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeRuntime }).chrome?.runtime;
}

const canUseChromeRuntime = () => {
    return typeof getChromeRuntime()?.sendMessage === 'function';
}

const sendChromeRuntimeMessage = (request: WorkerRequest) => {
    return new Promise<WorkerResponse>((resolve, reject) => {
        const runtime = getChromeRuntime();

        if (!runtime?.sendMessage) {
            reject(new Error('Chrome runtime messaging is unavailable.'));
            return;
        }

        runtime.sendMessage(request, (response) => {
            const lastError = runtime.lastError;

            if (lastError) {
                reject(new Error(lastError.message ?? 'Chrome runtime messaging failed.'));
                return;
            }

            resolve(response);
        });
    });
}

export const sendWorkerRequest = async (
    request: WorkerRequest
): Promise<WorkerResponse> => {
    if (canUseChromeRuntime()) {
        try {
            return await sendChromeRuntimeMessage(request);
        } catch {
            return handleLocalWorkerRequest(request);
        }
    }

    return handleLocalWorkerRequest(request);
}
