import { sessionStore } from "@/background/session/sessionStore";
import type { SalesforceQueryResponse } from "@/types/salesforce";

type SalesforceErrorResponse = {
    errorCode?: string;
    message?: string;
}

const parseSalesforceErrorMessage = async (response: Response) => {
    try {
        const body = await response.json() as SalesforceErrorResponse[];
        const firstError = body[0];

        if (firstError?.message) {
            return `${firstError.errorCode ?? response.status}: ${firstError.message}`;
        }
    } catch {
        // Fall back to status text below.
    }

    return `${response.status} ${response.statusText}`;
}

export const salesforceClient = {
    async restGet<TResponse>(path: string) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const url = new URL(
            `/services/data/v${session.apiVersion}/${path.replace(/^\//, '')}`,
            session.instanceUrl
        );

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${session.sessionId}`,
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(await parseSalesforceErrorMessage(response));
        }

        return response.json() as Promise<TResponse>;
    },

    async restQuery<TRecord>(soql: string) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const queryUrl = new URL(
            `/services/data/v${session.apiVersion}/query/`,
            session.instanceUrl
        );

        queryUrl.searchParams.set('q', soql);

        const response = await fetch(queryUrl.toString(), {
            headers: {
                Authorization: `Bearer ${session.sessionId}`,
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(await parseSalesforceErrorMessage(response));
        }

        return response.json() as Promise<SalesforceQueryResponse<TRecord>>;
    },

    async toolingQuery<TRecord>(soql: string) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const queryUrl = new URL(
            `/services/data/v${session.apiVersion}/tooling/query/`,
            session.instanceUrl
        );

        queryUrl.searchParams.set('q', soql);

        const response = await fetch(queryUrl.toString(), {
            headers: {
                Authorization: `Bearer ${session.sessionId}`,
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(await parseSalesforceErrorMessage(response));
        }

        return response.json() as Promise<SalesforceQueryResponse<TRecord>>;
    },

    async toolingText(path: string) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const url = new URL(
            `/services/data/v${session.apiVersion}/tooling/${path.replace(/^\//, '')}`,
            session.instanceUrl
        );

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${session.sessionId}`,
                Accept: 'text/plain'
            }
        });

        if (!response.ok) {
            throw new Error(await parseSalesforceErrorMessage(response));
        }

        return response.text();
    }
};
