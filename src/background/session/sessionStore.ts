import type {
    SalesforceConnectionInfo,
    SalesforceSession
} from "@/types/salesforce";

const SALESFORCE_SESSION_STORAGE_KEY = 'logstream.salesforceSession';

type ChromeStorageArea = {
    get: (_key: string) => Promise<Record<string, SalesforceSession | undefined>>;
    set: (_items: Record<string, SalesforceSession>) => Promise<void>;
    remove: (_key: string) => Promise<void>;
}

type ChromeApi = {
    storage?: {
        session?: ChromeStorageArea;
    };
}

let currentSession: SalesforceSession | null = null;

const getChromeStorageSession = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome?.storage?.session;
}

const toConnectionInfo = (
    session: SalesforceSession | null
): SalesforceConnectionInfo | null => {
    if (!session) {
        return null;
    }

    return {
        orgId: session.orgId,
        orgName: session.orgName,
        userId: session.userId,
        instanceUrl: session.instanceUrl,
        apiVersion: session.apiVersion,
        environment: session.environment,
        connectedAt: session.connectedAt
    };
}

export const sessionStore = {
    async restore() {
        const chromeStorageSession = getChromeStorageSession();

        if (!chromeStorageSession) {
            return currentSession;
        }

        const storedSession = await chromeStorageSession.get(SALESFORCE_SESSION_STORAGE_KEY);

        currentSession = storedSession[SALESFORCE_SESSION_STORAGE_KEY] ?? null;

        return currentSession;
    },

    async set(session: SalesforceSession) {
        currentSession = session;

        const chromeStorageSession = getChromeStorageSession();

        if (chromeStorageSession) {
            await chromeStorageSession.set({
                [SALESFORCE_SESSION_STORAGE_KEY]: session
            });
        }

        return session;
    },

    get() {
        return currentSession;
    },

    getConnectionInfo() {
        return toConnectionInfo(currentSession);
    },

    async clear() {
        currentSession = null;

        const chromeStorageSession = getChromeStorageSession();

        if (chromeStorageSession) {
            await chromeStorageSession.remove(SALESFORCE_SESSION_STORAGE_KEY);
        }
    }
};
