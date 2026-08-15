import React from "react";

import {
    LIVE_LOG_ACTIVITY_EVENTS,
    LIVE_LOG_IDLE_CHECK_INTERVAL_MS,
    LIVE_LOG_IDLE_TIMEOUT_MS,
    LIVE_LOG_PAGE_LIMIT,
    LIVE_LOG_POLL_INTERVAL_MS
} from "@/lib/livePollingConfig";
import { mapSalesforceLogToUiLog } from "@/lib/logEntryMapper";
import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import type { LogEntry } from "@/types/ui";
import type { WorkerEvent } from "@/types/workerMessages";

type UseLiveLogsState = {
    logs: LogEntry[];
    isLoading: boolean;
    isLoadingOlderLogs: boolean;
    hasOlderLogs: boolean;
    errorMessage: string | null;
    olderLogsErrorMessage: string | null;
}

export type LoadOlderLogsResult =
    | { status: 'loaded'; count: number }
    | { status: 'empty' }
    | { status: 'failed'; message: string }
    | { status: 'skipped' };

export type LoadOlderLogsParams = {
    beforeStartTime: string;
    afterStartTime?: string;
}

export type UseLiveLogsResult = UseLiveLogsState & {
    loadOlderLogs: (_params: LoadOlderLogsParams) => Promise<LoadOlderLogsResult>;
}

const INITIAL_LIVE_LOGS_STATE: UseLiveLogsState = {
    logs: [],
    isLoading: false,
    isLoadingOlderLogs: false,
    hasOlderLogs: true,
    errorMessage: null,
    olderLogsErrorMessage: null
};

const mergeLogsById = (
    incomingLogs: LogEntry[],
    currentLogs: LogEntry[]
) => {
    const incomingLogIds = new Set(incomingLogs.map(log => log.id));

    return [
        ...incomingLogs,
        ...currentLogs.filter(log => !incomingLogIds.has(log.id))
    ];
}

export const useLiveLogs = () => {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const isLiveStreamOn = useUIStore(state => state.isLiveStreamOn);
    const setLivePollingState = useUIStore(state => state.setLivePollingState);
    const orgId = connectionInfo?.orgId ?? null;
    const [state, setState] = React.useState<UseLiveLogsState>(INITIAL_LIVE_LOGS_STATE);
    const isRequestInFlightRef = React.useRef(false);
    const lastActivityAtRef = React.useRef(Date.now());
    const isIdleRef = React.useRef(false);
    const latestLogsRef = React.useRef<LogEntry[]>([]);
    const stateRef = React.useRef<UseLiveLogsState>(INITIAL_LIVE_LOGS_STATE);
    const isOlderLogsRequestInFlightRef = React.useRef(false);
    const isConnected = Boolean(connectionInfo);

    React.useEffect(() => {
        stateRef.current = state;
        latestLogsRef.current = state.logs;
    }, [state]);

    React.useEffect(() => {
        if (!orgId) {
            return;
        }

        void sendWorkerRequest({
            type: 'SET_LIVE_POLLING',
            orgId,
            enabled: isLiveStreamOn
        });
    }, [isLiveStreamOn, orgId]);

    React.useEffect(() => {
        const runtime = (globalThis as typeof globalThis & {
            chrome?: {
                runtime?: {
                    onMessage?: {
                        addListener: (_listener: (_message: WorkerEvent) => void) => void;
                        removeListener: (_listener: (_message: WorkerEvent) => void) => void;
                    };
                };
            };
        }).chrome?.runtime;

        if (!orgId || !runtime?.onMessage) {
            return;
        }

        const handleWorkerEvent = (message: WorkerEvent) => {
            if ('orgId' in message && message.orgId !== orgId) {
                return;
            }

            if (message.event === 'NEW_LOGS') {
                setState(currentState => {
                    const knownLogIds = new Set(currentState.logs.map(log => log.id));
                    const newLogs = message.logs
                        .map(mapSalesforceLogToUiLog)
                        .filter(log => !knownLogIds.has(log.id));

                    if (newLogs.length === 0) {
                        return currentState;
                    }

                    return {
                        ...currentState,
                        logs: [...newLogs, ...currentState.logs]
                    };
                });
                return;
            }

            if (message.event === 'LIVE_POLLING_STATE_CHANGED') {
                setLivePollingState(message.state);
                return;
            }

            if (message.event === 'SESSION_EXPIRED') {
                setLivePollingState('session_expired');
            }
        };

        runtime.onMessage.addListener(handleWorkerEvent);

        return () => {
            runtime.onMessage?.removeListener(handleWorkerEvent);
        };
    }, [orgId, setLivePollingState]);

    const loadLogs = React.useCallback(async (isInitialLoad = false) => {
        if (isRequestInFlightRef.current) {
            return;
        }

        if (!orgId) {
            setState(INITIAL_LIVE_LOGS_STATE);
            setLivePollingState('offline');
            return;
        }

        isRequestInFlightRef.current = true;

        if (isConnected && isLiveStreamOn && !isIdleRef.current) {
            setLivePollingState('syncing');
        }

        if (isInitialLoad) {
            setState(currentState => ({
                ...currentState,
                isLoading: true,
                errorMessage: null
            }));
        }

        try {
            const response = await sendWorkerRequest({
                type: 'GET_LOGS',
                orgId,
                limit: LIVE_LOG_PAGE_LIMIT
            });

            if (response.type === 'LOGS') {
                const incomingLogs = response.page.logs.map(mapSalesforceLogToUiLog);

                setState(currentState => ({
                    logs: isInitialLoad
                        ? incomingLogs
                        : mergeLogsById(incomingLogs, currentState.logs),
                    isLoading: false,
                    isLoadingOlderLogs: false,
                    hasOlderLogs: isInitialLoad
                        ? response.page.logs.length === LIVE_LOG_PAGE_LIMIT
                        : currentState.hasOlderLogs,
                    errorMessage: null,
                    olderLogsErrorMessage: null
                }));

                if (isConnected && isLiveStreamOn && !isIdleRef.current) {
                    setLivePollingState('live');
                }

                return;
            }

            if (response.type === 'ERROR') {
                setState({
                    logs: isInitialLoad ? [] : latestLogsRef.current,
                    isLoading: false,
                    isLoadingOlderLogs: false,
                    hasOlderLogs: !isInitialLoad,
                    errorMessage: response.message,
                    olderLogsErrorMessage: null
                });

                if (isConnected) {
                    setLivePollingState(
                        response.code === 'NO_SESSION' || response.code === 'INVALID_SESSION'
                            ? 'session_expired'
                            : 'offline'
                    );
                }

                return;
            }

            setState({
                logs: isInitialLoad ? [] : latestLogsRef.current,
                isLoading: false,
                isLoadingOlderLogs: false,
                hasOlderLogs: !isInitialLoad,
                errorMessage: 'Unexpected worker response while loading logs.',
                olderLogsErrorMessage: null
            });
        } catch (error: unknown) {
            setState({
                logs: isInitialLoad ? [] : latestLogsRef.current,
                isLoading: false,
                isLoadingOlderLogs: false,
                hasOlderLogs: !isInitialLoad,
                errorMessage: error instanceof Error ? error.message : 'Failed to load logs.',
                olderLogsErrorMessage: null
            });

            if (isConnected) {
                setLivePollingState('offline');
            }
        } finally {
            isRequestInFlightRef.current = false;
        }
    }, [isConnected, isLiveStreamOn, orgId, setLivePollingState]);

    const loadOlderLogs = React.useCallback(async ({
        beforeStartTime,
        afterStartTime
    }: LoadOlderLogsParams) => {
        if (!orgId || isOlderLogsRequestInFlightRef.current) {
            return { status: 'skipped' } satisfies LoadOlderLogsResult;
        }

        const currentState = stateRef.current;

        if (currentState.isLoading || currentState.isLoadingOlderLogs || currentState.logs.length === 0) {
            return { status: 'skipped' } satisfies LoadOlderLogsResult;
        }

        isOlderLogsRequestInFlightRef.current = true;
        setState(previousState => ({
            ...previousState,
            isLoadingOlderLogs: true,
            olderLogsErrorMessage: null
        }));

        try {
            let cursorBeforeStartTime = beforeStartTime;
            let totalLoadedCount = 0;

            // Salesforce ApexLog.StartTime only has second-level precision, so a
            // busy org can have far more than one page of logs sharing the exact
            // boundary timestamp. A full page can legitimately come back with zero
            // *new* records (we already have them all) even though older history
            // still exists - that must not be reported as "no older logs found".
            // Keep paging past all-duplicate full pages until we find new records
            // or Salesforce returns a page shorter than the limit (true end).
            for (let attempt = 0; attempt < 10; attempt++) {
                const response = await sendWorkerRequest({
                    type: 'GET_OLDER_LOGS',
                    orgId,
                    beforeStartTime: cursorBeforeStartTime,
                    afterStartTime,
                    limit: LIVE_LOG_PAGE_LIMIT
                });

                if (response.type !== 'LOGS') {
                    if (response.type === 'ERROR') {
                        setState(previousState => ({
                            ...previousState,
                            isLoadingOlderLogs: false,
                            olderLogsErrorMessage: response.message
                        }));
                        return {
                            status: 'failed',
                            message: response.message
                        } satisfies LoadOlderLogsResult;
                    }

                    const message = 'Unexpected worker response while loading older logs.';

                    setState(previousState => ({
                        ...previousState,
                        isLoadingOlderLogs: false,
                        olderLogsErrorMessage: message
                    }));

                    return {
                        status: 'failed',
                        message
                    } satisfies LoadOlderLogsResult;
                }

                const fetchedLogs = response.page.logs;
                const isFullPage = fetchedLogs.length === LIVE_LOG_PAGE_LIMIT;
                let newLogCount = 0;

                setState(previousState => {
                    const knownLogIds = new Set(previousState.logs.map(log => log.id));
                    const olderLogs = fetchedLogs
                        .map(mapSalesforceLogToUiLog)
                        .filter(log => !knownLogIds.has(log.id));
                    newLogCount = olderLogs.length;

                    return {
                        ...previousState,
                        logs: [...previousState.logs, ...olderLogs],
                        isLoadingOlderLogs: false,
                        hasOlderLogs: isFullPage,
                        olderLogsErrorMessage: null
                    };
                });

                totalLoadedCount += newLogCount;

                if (newLogCount > 0 || !isFullPage) {
                    return totalLoadedCount > 0
                        ? { status: 'loaded', count: totalLoadedCount } satisfies LoadOlderLogsResult
                        : { status: 'empty' } satisfies LoadOlderLogsResult;
                }

                const oldestFetchedStartTime = fetchedLogs.at(-1)?.startTime;

                if (!oldestFetchedStartTime) {
                    return { status: 'empty' } satisfies LoadOlderLogsResult;
                }

                // Every record in this full page was already known - shift the
                // window past it and try again rather than giving up.
                cursorBeforeStartTime = oldestFetchedStartTime;
                setState(previousState => ({
                    ...previousState,
                    isLoadingOlderLogs: true
                }));
            }

            return { status: 'empty' } satisfies LoadOlderLogsResult;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load older logs.';

            setState(previousState => ({
                ...previousState,
                isLoadingOlderLogs: false,
                olderLogsErrorMessage: message
            }));

            return {
                status: 'failed',
                message
            } satisfies LoadOlderLogsResult;
        } finally {
            isOlderLogsRequestInFlightRef.current = false;
        }
    }, [orgId]);

    React.useEffect(() => {
        isRequestInFlightRef.current = false;
        isIdleRef.current = false;
        lastActivityAtRef.current = Date.now();

        if (!isConnected) {
            setLivePollingState('offline');
            setState(INITIAL_LIVE_LOGS_STATE);
        } else if (!isLiveStreamOn) {
            setLivePollingState('manual_paused');
        } else {
            setLivePollingState('syncing');
            void loadLogs(true);
        }
    }, [isConnected, isLiveStreamOn, loadLogs, orgId, setLivePollingState]);

    React.useEffect(() => {
        if (!isConnected || !isLiveStreamOn) {
            return;
        }

        const markActive = () => {
            lastActivityAtRef.current = Date.now();

            if (orgId) {
                void sendWorkerRequest({
                    type: 'USER_ACTIVITY_HEARTBEAT',
                    orgId,
                    occurredAt: new Date().toISOString()
                });
            }

            if (!isIdleRef.current) {
                return;
            }

            isIdleRef.current = false;
            setLivePollingState('syncing');
            void loadLogs();
        };

        LIVE_LOG_ACTIVITY_EVENTS.forEach(eventName => {
            window.addEventListener(eventName, markActive, { passive: true });
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                markActive();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            LIVE_LOG_ACTIVITY_EVENTS.forEach(eventName => {
                window.removeEventListener(eventName, markActive);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isConnected, isLiveStreamOn, loadLogs, orgId, setLivePollingState]);

    React.useEffect(() => {
        if (!isConnected) {
            return;
        }

        if (!isLiveStreamOn) {
            setLivePollingState('manual_paused');
            return;
        }

        const idleCheckId = window.setInterval(() => {
            const isPastIdleTimeout = Date.now() - lastActivityAtRef.current >= LIVE_LOG_IDLE_TIMEOUT_MS;
            const isPageHidden = document.visibilityState === 'hidden';

            if ((isPastIdleTimeout || isPageHidden) && !isIdleRef.current) {
                isIdleRef.current = true;
                setLivePollingState('idle_paused');
            }
        }, LIVE_LOG_IDLE_CHECK_INTERVAL_MS);

        const pollId = window.setInterval(() => {
            if (isIdleRef.current || document.visibilityState === 'hidden') {
                return;
            }

            void loadLogs();
        }, LIVE_LOG_POLL_INTERVAL_MS);

        return () => {
            window.clearInterval(idleCheckId);
            window.clearInterval(pollId);
        };
    }, [isConnected, isLiveStreamOn, loadLogs, setLivePollingState]);

    return {
        ...state,
        loadOlderLogs
    };
}
