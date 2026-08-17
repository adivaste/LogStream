import { openLogStreamDb } from "./db/db";
import { handleWorkerMessage } from "./messageHandler";
import { liveLogPoller } from "./poller";
import { sessionStore } from "./session/sessionStore";
import { storageRetentionService } from "./storageRetention";
import type { WorkerRequest, WorkerResponse } from "@/types/workerMessages";

type ChromeMessageSender = unknown;
type SendResponse = (_response: WorkerResponse) => void;

type ChromeRuntime = {
    getURL?: (_path: string) => string;
    onInstalled?: {
        addListener: (_listener: () => void | Promise<void>) => void;
    };
    onStartup?: {
        addListener: (_listener: () => void | Promise<void>) => void;
    };
    onMessage?: {
        addListener: (
            _listener: (
                _message: WorkerRequest,
                _sender: ChromeMessageSender,
                _sendResponse: SendResponse
            ) => boolean | void
        ) => void;
    };
    sendMessage?: (_message: unknown) => void;
}

type ChromeAction = {
    onClicked?: {
        addListener: (_listener: (_tab: ChromeTab) => void) => void;
    };
}

type ChromeTab = {
    id?: number;
    url?: string;
}

type ChromeTabs = {
    create?: (_createProperties: { url: string }) => Promise<ChromeTab>;
}

type ChromeApi = {
    runtime?: ChromeRuntime;
    action?: ChromeAction;
    tabs?: ChromeTabs;
    alarms?: unknown;
}

let initPromise: Promise<void> | null = null;

const getChromeApi = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

export const initBackgroundRuntime = () => {
    if (initPromise) {
        return initPromise;
    }

    initPromise = Promise.all([
        openLogStreamDb(),
        sessionStore.restore()
    ]).then(() => undefined);

    return initPromise;
}

const registerLifecycleListeners = () => {
    const chromeApi = getChromeApi();

    chromeApi?.runtime?.onInstalled?.addListener(() => {
        void initBackgroundRuntime();
    });

    chromeApi?.runtime?.onStartup?.addListener(() => {
        void initBackgroundRuntime();
    });

    liveLogPoller.registerAlarmListener();
    storageRetentionService.registerAlarmListener();
}

const registerMessageListener = () => {
    const chromeApi = getChromeApi();

    chromeApi?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
        void initBackgroundRuntime()
            .then(() => handleWorkerMessage(message))
            .then(sendResponse)
            .catch((error: unknown) => {
                sendResponse({
                    type: 'ERROR',
                    requestId: message.requestId,
                    code: 'UNKNOWN_ERROR',
                    message: error instanceof Error ? error.message : 'Background worker request failed.',
                    retryable: true
                });
            });

        return true;
    });
}

const registerActionClickListener = () => {
    const chromeApi = getChromeApi();

    chromeApi?.action?.onClicked?.addListener((tab) => {
        const runtime = chromeApi.runtime;
        const createTab = chromeApi.tabs?.create;

        if (!runtime?.getURL || !createTab) {
            return;
        }

        const sourceParams = new URLSearchParams();

        if (typeof tab.id === 'number') {
            sourceParams.set('sourceTabId', String(tab.id));
        }

        if (tab.url) {
            sourceParams.set('sourceUrl', tab.url);
        }

        const queryString = sourceParams.toString();
        const extensionUrl = runtime.getURL(
            queryString ? `index.html?${queryString}` : 'index.html'
        );

        void createTab({ url: extensionUrl });
    });
}

export const startBackgroundRuntime = () => {
    registerLifecycleListeners();
    registerMessageListener();
    registerActionClickListener();
    void initBackgroundRuntime().then(() => {
        void liveLogPoller.start();
        storageRetentionService.start();
    });
}
