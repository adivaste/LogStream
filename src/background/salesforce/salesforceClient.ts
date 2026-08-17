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

// A 403 with this specific errorCode means the org's daily API request limit
// has actually been hit (not a soft warning threshold - Salesforce itself is
// refusing further calls). Distinguishing it lets live polling stop and
// surface "limit reached" instead of retrying into more failures.
export class SalesforceApiLimitExceededError extends Error {}

const parseSalesforceError = async (response: Response) => {
    try {
        const body = await response.json() as SalesforceErrorResponse[];
        const firstError = body[0];

        if (firstError?.message) {
            return {
                message: `${firstError.errorCode ?? response.status}: ${firstError.message}`,
                errorCode: firstError.errorCode
            };
        }
    } catch {
        // Fall back to status text below.
    }

    return { message: `${response.status} ${response.statusText}`, errorCode: undefined };
}

const assertResponseOk = async (response: Response) => {
    if (response.ok) {
        return;
    }

    const { message, errorCode } = await parseSalesforceError(response);

    if (response.status === 401) {
        throw new SalesforceSessionExpiredError(message);
    }

    if (response.status === 403 && errorCode === 'REQUEST_LIMIT_EXCEEDED') {
        throw new SalesforceApiLimitExceededError(message);
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
    },

    // Log bodies are the one response in this client large enough (up to
    // several MB) that a user benefits from knowing it's still moving rather
    // than staring at an indefinite spinner - every other tooling call here
    // returns a small JSON payload where progress reporting would be noise.
    // `response.text()` can't report progress mid-flight, so this reads the
    // stream manually and decodes once at the end (rather than per-chunk)
    // to avoid splitting a multi-byte UTF-8 character across chunk
    // boundaries.
    async toolingTextWithProgress(
        path: string,
        onProgress: (_receivedBytes: number, _totalBytes: number | null) => void
    ) {
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

        // Salesforce doesn't always send Content-Length (edge-transformed
        // responses can be chunked) - callers get `null` and can still show
        // "X received so far" without a percentage.
        const totalBytesHeader = response.headers.get('Content-Length');
        const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;

        if (!response.body) {
            const text = await response.text();
            onProgress(text.length, totalBytes);
            return text;
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            chunks.push(value);
            receivedBytes += value.byteLength;
            onProgress(receivedBytes, totalBytes);
        }

        const combined = new Uint8Array(receivedBytes);
        let offset = 0;

        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
        }

        return new TextDecoder('utf-8').decode(combined);
    }
};
