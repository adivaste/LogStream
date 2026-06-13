import React from "react";

import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import type { ApiBudgetSnapshot } from "@/types/workerMessages";

type UseApiBudgetState = {
    budget: ApiBudgetSnapshot | null;
    isLoading: boolean;
    errorMessage: string | null;
}

const INITIAL_API_BUDGET_STATE: UseApiBudgetState = {
    budget: null,
    isLoading: false,
    errorMessage: null
};

export const useApiBudget = (isEnabled: boolean) => {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const [state, setState] = React.useState<UseApiBudgetState>(INITIAL_API_BUDGET_STATE);

    const refreshBudget = React.useCallback(async () => {
        if (!connectionInfo) {
            setState({
                budget: null,
                isLoading: false,
                errorMessage: 'Connect to Salesforce to view limits.'
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
                type: 'GET_API_BUDGET',
                orgId: connectionInfo.orgId
            });

            if (response.type === 'API_BUDGET') {
                setState({
                    budget: response.budget,
                    isLoading: false,
                    errorMessage: null
                });
                return;
            }

            if (response.type === 'ERROR') {
                setState({
                    budget: null,
                    isLoading: false,
                    errorMessage: response.message
                });
                return;
            }

            setState({
                budget: null,
                isLoading: false,
                errorMessage: 'Unexpected worker response while loading API limits.'
            });
        } catch (error) {
            setState({
                budget: null,
                isLoading: false,
                errorMessage: error instanceof Error ? error.message : 'Failed to load API limits.'
            });
        }
    }, [connectionInfo]);

    React.useEffect(() => {
        if (!isEnabled) {
            return;
        }

        void refreshBudget();
    }, [isEnabled, refreshBudget]);

    return {
        ...state,
        refreshBudget,
        isConnected: Boolean(connectionInfo)
    };
}
