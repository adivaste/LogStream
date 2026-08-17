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

const CLEANUP_ERROR_MESSAGE = 'Failed to clean up storage.';
const HARD_CLEAR_ERROR_MESSAGE = 'Failed to clear storage.';

export const useStorageUsage = (isEnabled: boolean) => {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const [state, setState] = React.useState<UseStorageUsageState>(INITIAL_STORAGE_USAGE_STATE);
    // Separate from `isLoading` - that one gates the "Loading storage
    // usage..." full-panel message on first fetch, but a manual cleanup
    // should keep the donut/stats visible and just show its own transient
    // feedback on the button, not blank the whole panel.
    const [isCleaningUp, setIsCleaningUp] = React.useState(false);
    const [isHardClearing, setIsHardClearing] = React.useState(false);

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

    const runCleanupNow = React.useCallback(async (): Promise<boolean> => {
        if (!connectionInfo) {
            return false;
        }

        setIsCleaningUp(true);

        try {
            const response = await sendWorkerRequest({
                type: 'RUN_STORAGE_CLEANUP',
                orgId: connectionInfo.orgId
            });

            if (response.type === 'STORAGE_USAGE') {
                setState({
                    usage: response.usage,
                    isLoading: false,
                    errorMessage: null
                });
                return true;
            }

            setState(currentState => ({
                ...currentState,
                errorMessage: response.type === 'ERROR' ? response.message : CLEANUP_ERROR_MESSAGE
            }));
            return false;
        } catch (error) {
            setState(currentState => ({
                ...currentState,
                errorMessage: error instanceof Error ? error.message : CLEANUP_ERROR_MESSAGE
            }));
            return false;
        } finally {
            setIsCleaningUp(false);
        }
    }, [connectionInfo]);

    const runHardClearNow = React.useCallback(async (): Promise<boolean> => {
        if (!connectionInfo) {
            return false;
        }

        setIsHardClearing(true);

        try {
            const response = await sendWorkerRequest({
                type: 'HARD_CLEAR_STORAGE',
                orgId: connectionInfo.orgId
            });

            if (response.type === 'STORAGE_USAGE') {
                setState({
                    usage: response.usage,
                    isLoading: false,
                    errorMessage: null
                });
                return true;
            }

            setState(currentState => ({
                ...currentState,
                errorMessage: response.type === 'ERROR' ? response.message : HARD_CLEAR_ERROR_MESSAGE
            }));
            return false;
        } catch (error) {
            setState(currentState => ({
                ...currentState,
                errorMessage: error instanceof Error ? error.message : HARD_CLEAR_ERROR_MESSAGE
            }));
            return false;
        } finally {
            setIsHardClearing(false);
        }
    }, [connectionInfo]);

    React.useEffect(() => {
        if (!isEnabled) {
            return;
        }

        void refreshUsage();
    }, [isEnabled, refreshUsage]);

    return {
        ...state,
        isCleaningUp,
        isHardClearing,
        refreshUsage,
        setRetentionDays,
        runCleanupNow,
        runHardClearNow,
        isConnected: Boolean(connectionInfo)
    };
}
