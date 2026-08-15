import React from "react";

import { DEFAULT_TRACE_FLAG_DEBUG_LEVEL_NAME } from "@/lib/traceFlagConfig";
import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import type { SalesforceUserId } from "@/types/salesforce";
import type { TraceFlagUserSummary, WorkerEvent } from "@/types/workerMessages";

type UseTraceFlagUsersState = {
    users: TraceFlagUserSummary[];
    isLoading: boolean;
    errorMessage: string | null;
}

const INITIAL_STATE: UseTraceFlagUsersState = {
    users: [],
    isLoading: false,
    errorMessage: null
};

const upsertUsers = (
    currentUsers: TraceFlagUserSummary[],
    updatedUsers: TraceFlagUserSummary[]
) => {
    const updatedById = new Map(updatedUsers.map(summary => [summary.user.id, summary]));
    const merged = currentUsers.map(summary => updatedById.get(summary.user.id) ?? summary);
    const knownIds = new Set(currentUsers.map(summary => summary.user.id));

    updatedUsers.forEach(summary => {
        if (!knownIds.has(summary.user.id)) {
            merged.push(summary);
        }
    });

    return merged;
}

export type SetTraceFlagResult =
    | { status: 'ok' }
    | { status: 'failed'; message: string };

export const useTraceFlagUsers = (isEnabled: boolean) => {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const orgId = connectionInfo?.orgId ?? null;
    const [state, setState] = React.useState<UseTraceFlagUsersState>(INITIAL_STATE);
    const [mutatingUserId, setMutatingUserId] = React.useState<SalesforceUserId | null>(null);

    const refreshUsers = React.useCallback(async () => {
        if (!orgId) {
            setState({
                users: [],
                isLoading: false,
                errorMessage: 'Connect to Salesforce to manage trace flags.'
            });
            return;
        }

        setState(currentState => ({
            ...currentState,
            isLoading: true,
            errorMessage: null
        }));

        try {
            const response = await sendWorkerRequest({
                type: 'GET_TRACE_FLAG_USERS',
                orgId
            });

            if (response.type === 'TRACE_FLAG_USERS') {
                setState({
                    users: response.users,
                    isLoading: false,
                    errorMessage: null
                });
                return;
            }

            if (response.type === 'ERROR') {
                setState({
                    users: [],
                    isLoading: false,
                    errorMessage: response.message
                });
                return;
            }

            setState({
                users: [],
                isLoading: false,
                errorMessage: 'Unexpected worker response while loading trace flag users.'
            });
        } catch (error) {
            setState({
                users: [],
                isLoading: false,
                errorMessage: error instanceof Error ? error.message : 'Failed to load trace flag users.'
            });
        }
    }, [orgId]);

    React.useEffect(() => {
        if (!isEnabled) {
            return;
        }

        void refreshUsers();
    }, [isEnabled, refreshUsers]);

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
            if (message.event === 'TRACE_FLAGS_CHANGED' && message.orgId === orgId) {
                setState(currentState => ({
                    users: upsertUsers(currentState.users, message.users),
                    isLoading: false,
                    errorMessage: null
                }));
            }
        };

        runtime.onMessage.addListener(handleWorkerEvent);

        return () => {
            runtime.onMessage?.removeListener(handleWorkerEvent);
        };
    }, [orgId]);

    const setTraceFlag = React.useCallback(async (
        userId: SalesforceUserId,
        expiresAt: string,
        debugLevelName: string = DEFAULT_TRACE_FLAG_DEBUG_LEVEL_NAME
    ): Promise<SetTraceFlagResult> => {
        if (!orgId) {
            return { status: 'failed', message: 'Connect to Salesforce to manage trace flags.' };
        }

        setMutatingUserId(userId);

        try {
            const response = await sendWorkerRequest({
                type: 'SET_TRACE_FLAG',
                orgId,
                userId,
                expiresAt,
                debugLevelName
            });

            if (response.type === 'TRACE_FLAG_USERS') {
                setState(currentState => ({
                    users: upsertUsers(currentState.users, response.users),
                    isLoading: false,
                    errorMessage: null
                }));
                return { status: 'ok' };
            }

            if (response.type === 'ERROR') {
                return { status: 'failed', message: response.message };
            }

            return { status: 'failed', message: 'Unexpected worker response while updating the trace flag.' };
        } catch (error) {
            return {
                status: 'failed',
                message: error instanceof Error ? error.message : 'Failed to update the trace flag.'
            };
        } finally {
            setMutatingUserId(null);
        }
    }, [orgId]);

    return {
        ...state,
        refreshUsers,
        setTraceFlag,
        mutatingUserId,
        isConnected: Boolean(connectionInfo)
    };
}
