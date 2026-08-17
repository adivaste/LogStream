import React from "react";

import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import type { StorageUsageSnapshot } from "@/types/workerMessages";

type UseStorageUsageState = {
    usage: StorageUsageSnapshot | null;
    isLoading: boolean;
    errorMessage: string | null;
}

const INITIAL_STORAGE_USAGE_STATE: UseStorageUsageState = {
    usage: null,
    isLoading: false,
    errorMessage: null
};

export const useStorageUsage = (isEnabled: boolean) => {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const [state, setState] = React.useState<UseStorageUsageState>(INITIAL_STORAGE_USAGE_STATE);

    const refreshUsage = React.useCallback(async () => {
        if (!connectionInfo) {
            setState({
                usage: null,
                isLoading: false,
                errorMessage: 'Connect to Salesforce to view storage usage.'
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
                type: 'GET_STORAGE_USAGE',
                orgId: connectionInfo.orgId
            });

            if (response.type === 'STORAGE_USAGE') {
                setState({
                    usage: response.usage,
                    isLoading: false,
                    errorMessage: null
                });
                return;
            }

            if (response.type === 'ERROR') {
                setState({
                    usage: null,
                    isLoading: false,
                    errorMessage: response.message
                });
                return;
            }

            setState({
                usage: null,
                isLoading: false,
                errorMessage: 'Unexpected worker response while loading storage usage.'
            });
        } catch (error) {
            setState({
                usage: null,
                isLoading: false,
                errorMessage: error instanceof Error ? error.message : 'Failed to load storage usage.'
            });
        }
    }, [connectionInfo]);

    const setRetentionDays = React.useCallback(async (retentionDays: number) => {
        await sendWorkerRequest({
            type: 'SET_RETENTION_DAYS',
            retentionDays
        });

        // Reflect the new value immediately rather than waiting on a full
        // re-fetch - the byte/count totals it's paired with haven't changed,
        // only the policy going forward has.
        setState(currentState => (
            currentState.usage
                ? { ...currentState, usage: { ...currentState.usage, retentionDays } }
                : currentState
        ));
    }, []);

    React.useEffect(() => {
        if (!isEnabled) {
            return;
        }

        void refreshUsage();
    }, [isEnabled, refreshUsage]);

    return {
        ...state,
        refreshUsage,
        setRetentionDays,
        isConnected: Boolean(connectionInfo)
    };
}
