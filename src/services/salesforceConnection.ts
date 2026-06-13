import { sendWorkerRequest } from "@/services/backgroundBridge";
import type { SalesforceConnectionInfo } from "@/types/salesforce";

export type ConnectSalesforceOrgResult =
    | {
        status: 'connected';
        connectionInfo: SalesforceConnectionInfo;
    }
    | {
        status: 'not_found';
        connectionInfo: null;
    };

export const connectSalesforceOrg = async (): Promise<ConnectSalesforceOrgResult> => {
    const urlParams = new URLSearchParams(window.location.search);
    const sourceTabId = Number(urlParams.get('sourceTabId'));
    const sourceUrl = urlParams.get('sourceUrl') ?? undefined;
    const response = await sendWorkerRequest({
        type: 'REFRESH_SESSION',
        sourceTabId: Number.isFinite(sourceTabId) ? sourceTabId : undefined,
        sourceUrl
    });

    if (response.type === 'SESSION' && response.session) {
        return {
            status: 'connected',
            connectionInfo: response.session
        };
    }

    return {
        status: 'not_found',
        connectionInfo: null
    };
}
