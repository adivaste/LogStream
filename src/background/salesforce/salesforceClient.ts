import { sessionStore } from "@/background/session/sessionStore";
import type { SalesforceQueryResponse } from "@/types/salesforce";

type SalesforceErrorResponse = {
    errorCode?: string;
    message?: string;
}

// A 401 from Salesforce means the session ID itself is no longer valid
// (expired, revoked, or the org's session-timeout policy kicked in) - distinct
// from every other failure (rate limits, bad SOQL, network hiccups), which are
// transient and worth retrying. Callers that only catch generic `Error` would
// otherwise treat an expired session the same as a blip and keep retrying
// forever, which is exactly what caused the live-polling state to cycle
// between "syncing" and "offline" instead of surfacing "session expired".
export class SalesforceSessionExpiredError extends Error {}

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

const assertResponseOk = async (response: Response) => {
    if (response.ok) {
        return;
    }

    const message = await parseSalesforceErrorMessage(response);

    if (response.status === 401) {
        throw new SalesforceSessionExpiredError(message);
    }

    throw new Error(message);
}

const fetchNextRecordsPage = async <TRecord>(nextRecordsUrl: string) => {
    const session = sessionStore.get() ?? await sessionStore.restore();

    if (!session) {
        throw new Error('No Salesforce session is available.');
    }

    const url = new URL(nextRecordsUrl, session.instanceUrl);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${session.sessionId}`,
            Accept: 'application/json'
        }
    });

    await assertResponseOk(response);

    return response.json() as Promise<SalesforceQueryResponse<TRecord>>;
}

// Salesforce query APIs only return the first ~200-2000 records per response
// even when the SOQL LIMIT is higher, and require following `nextRecordsUrl`
// to get the rest. Any caller expecting *all* matching records must page
// through it instead of returning `response.records` directly.
const drainQueryPages = async <TRecord>(
    firstPage: SalesforceQueryResponse<TRecord>
): Promise<TRecord[]> => {
    const records = [...firstPage.records];
    let isDone = firstPage.done;
    let nextRecordsUrl = firstPage.nextRecordsUrl;

    while (!isDone && nextRecordsUrl) {
        const page = await fetchNextRecordsPage<TRecord>(nextRecordsUrl);

        records.push(...page.records);
        isDone = page.done;
        nextRecordsUrl = page.nextRecordsUrl;
    }

    return records;
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

        await assertResponseOk(response);

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
                Accept: 'application/json',
                // Ask for Salesforce's max page size (2000) instead of the default
                // 200, so a typical result set arrives in a single API call rather
                // than requiring several nextRecordsUrl round trips.
                'Sforce-Query-Options': 'batchSize=2000'
            }
        });

        await assertResponseOk(response);

        return response.json() as Promise<SalesforceQueryResponse<TRecord>>;
    },

    async restQueryAll<TRecord>(soql: string) {
        return drainQueryPages(await this.restQuery<TRecord>(soql));
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

        await assertResponseOk(response);

        return response.json() as Promise<SalesforceQueryResponse<TRecord>>;
    },

    async toolingCreate<TBody extends Record<string, unknown>>(sobject: string, body: TBody) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const url = new URL(
            `/services/data/v${session.apiVersion}/tooling/sobjects/${sobject}/`,
            session.instanceUrl
        );

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.sessionId}`,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        await assertResponseOk(response);

        return response.json() as Promise<{ id: string; success: boolean }>;
    },

    async toolingUpdate<TBody extends Record<string, unknown>>(sobject: string, id: string, body: TBody) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const url = new URL(
            `/services/data/v${session.apiVersion}/tooling/sobjects/${sobject}/${id}`,
            session.instanceUrl
        );

        const response = await fetch(url.toString(), {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${session.sessionId}`,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        await assertResponseOk(response);
    },

    async toolingDelete(sobject: string, id: string) {
        const session = sessionStore.get() ?? await sessionStore.restore();

        if (!session) {
            throw new Error('No Salesforce session is available.');
        }

        const url = new URL(
            `/services/data/v${session.apiVersion}/tooling/sobjects/${sobject}/${id}`,
            session.instanceUrl
        );

        const response = await fetch(url.toString(), {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${session.sessionId}`
            }
        });

        if (response.status !== 404) {
            await assertResponseOk(response);
        }
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

        await assertResponseOk(response);

        return response.text();
    }
};
