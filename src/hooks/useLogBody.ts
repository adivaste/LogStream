import React from "react";

import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import type { LogBodyStatus } from "@/types/workerMessages";

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

                setState({
                    body: '',
                    status: 'failed',
                    errorMessage: error instanceof Error ? error.message : 'Failed to load log body.'
                });
            });

        return () => {
            isCurrentRequest = false;
        };
    }, [isEnabled, logId, orgId]);

    return state;
}
