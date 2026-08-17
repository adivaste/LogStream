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
    // The local/mock backend only exists to power the plain `npm run dev`
    // preview (no `chrome` API at all, so there's no real worker to talk
    // to) - it must never be a fallback for a *real* messaging failure once
    // the chrome runtime is actually present. The service worker going
    // dormant or dying mid-message ("Extension context invalidated", an
    // MV3 eviction, an in-progress extension update) is routine in an
    // installed extension, not rare - silently swapping to fabricated mock
    // data on that failure would show the user plausible-looking logs that
    // are simply wrong, with no error surfaced at all.
    if (!canUseChromeRuntime()) {
        return handleLocalWorkerRequest(request);
    }

    return sendChromeRuntimeMessage(request);
}
