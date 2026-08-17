import React from "react";
import { toast } from "sonner";

import { formatByteSize } from "@/lib/logBodyMeta";
import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import type { LogBodyStatus, WorkerEvent } from "@/types/workerMessages";

type UseLogBodyState = {
    body: string;
    status: LogBodyStatus;
    errorMessage: string | null;
}

const INITIAL_LOG_BODY_STATE: UseLogBodyState = {
    body: '',
    status: 'not_fetched',
    errorMessage: null
};

// Fallback gate for when Salesforce doesn't send Content-Length (edge-
// transformed responses can omit it, so total size isn't knowable upfront) -
// only worth interrupting the user for a download that's genuinely slow.
// Mirrors the app's existing "don't flash UI for fast things" rule
// (useDelayedLoadingGate), just applied to a toast instead of a skeleton.
const DOWNLOAD_TOAST_SHOW_DELAY_MS = 5_000;
// Primary gate, used whenever Content-Length IS known: shows the toast the
// moment a log is known to be this big, regardless of how fast it downloads.
// A time-only gate would miss an 18MB log entirely on a fast connection,
// since the whole download can finish before an elapsed-time timer ever
// fires - size is knowable immediately (headers arrive before any body
// chunk is read), so it doesn't need to wait at all.
const DOWNLOAD_TOAST_SIZE_THRESHOLD_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TOAST_ID = 'log-body-download-progress';

const formatDownloadProgressMessage = (receivedBytes: number, totalBytes: number | null) => {
    if (!totalBytes) {
        return `${formatByteSize(receivedBytes)} downloaded so far`;
    }

    const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));

    return `${formatByteSize(receivedBytes)} of ${formatByteSize(totalBytes)} (${percent}%)`;
}

const getRuntimeOnMessage = () => {
    return (globalThis as typeof globalThis & {
        chrome?: {
            runtime?: {
                onMessage?: {
                    addListener: (_listener: (_message: WorkerEvent) => void) => void;
                    removeListener: (_listener: (_message: WorkerEvent) => void) => void;
                };
            };
        };
    }).chrome?.runtime?.onMessage;
}

export const useLogBody = (
    logId: string | null,
    isEnabled: boolean
) => {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const orgId = connectionInfo?.orgId ?? null;
    const [state, setState] = React.useState<UseLogBodyState>(INITIAL_LOG_BODY_STATE);

    React.useEffect(() => {
        if (!isEnabled || !logId || !orgId) {
            setState(INITIAL_LOG_BODY_STATE);
            return;
        }

        let isCurrentRequest = true;
        let hasShownDownloadToast = false;
        let latestProgress: { receivedBytes: number; totalBytes: number | null } | null = null;

        const showDownloadToast = (receivedBytes: number, totalBytes: number | null) => {
            hasShownDownloadToast = true;
            toast.loading('Larger logs can take time to load.', {
                id: DOWNLOAD_TOAST_ID,
                description: formatDownloadProgressMessage(receivedBytes, totalBytes)
            });
        }

        const showToastTimeoutId = window.setTimeout(() => {
            if (!isCurrentRequest || !latestProgress) {
                return;
            }

            showDownloadToast(latestProgress.receivedBytes, latestProgress.totalBytes);
        }, DOWNLOAD_TOAST_SHOW_DELAY_MS);

        const runtimeOnMessage = getRuntimeOnMessage();

        const handleWorkerEvent = (message: WorkerEvent) => {
            if (
                message.event !== 'LOG_BODY_DOWNLOAD_PROGRESS'
                || message.orgId !== orgId
                || message.logId !== logId
            ) {
                return;
            }

            latestProgress = { receivedBytes: message.receivedBytes, totalBytes: message.totalBytes };

            if (
                !hasShownDownloadToast
                && message.totalBytes !== null
                && message.totalBytes >= DOWNLOAD_TOAST_SIZE_THRESHOLD_BYTES
            ) {
                showDownloadToast(message.receivedBytes, message.totalBytes);
                return;
            }

            if (hasShownDownloadToast) {
                showDownloadToast(message.receivedBytes, message.totalBytes);
            }
        };

        runtimeOnMessage?.addListener(handleWorkerEvent);

        const dismissDownloadToast = () => {
            window.clearTimeout(showToastTimeoutId);
            runtimeOnMessage?.removeListener(handleWorkerEvent);

            if (hasShownDownloadToast) {
                toast.dismiss(DOWNLOAD_TOAST_ID);
            }
        }

        setState({
            body: '',
            status: 'fetching',
            errorMessage: null
        });

        sendWorkerRequest({
            type: 'GET_LOG_BODY',
            orgId,
            logId
        })
            .then(response => {
                if (!isCurrentRequest) {
                    return;
                }

                dismissDownloadToast();

                if (response.type === 'LOG_BODY') {
                    setState({
                        body: response.result.record?.body ?? '',
                        status: response.result.status,
                        errorMessage: response.result.status === 'failed'
                            ? response.errorMessage ?? 'Failed to load log body.'
                            : null
                    });
                    return;
                }

                if (response.type === 'ERROR') {
                    setState({
                        body: '',
                        status: 'failed',
                        errorMessage: response.message
                    });
                    return;
                }

                setState({
                    body: '',
                    status: 'failed',
                    errorMessage: 'Unexpected worker response while loading log body.'
                });
            })
            .catch((error: unknown) => {
                if (!isCurrentRequest) {
                    return;
                }

                dismissDownloadToast();

                setState({
                    body: '',
                    status: 'failed',
                    errorMessage: error instanceof Error ? error.message : 'Failed to load log body.'
                });
            });

        return () => {
            isCurrentRequest = false;
            dismissDownloadToast();
        };
    }, [isEnabled, logId, orgId]);

    return state;
}
