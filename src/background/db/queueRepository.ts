import type {
    SalesforceLogId,
    SalesforceOrgId
} from "@/types/salesforce";
import {
    createOrgScopedStorageKey,
    type BodyQueueEntry
} from "@/types/storage";
import {
    createReadonlyTransaction,
    createReadwriteTransaction,
    LOGSTREAM_STORES,
    requestToPromise,
    transactionDone
} from "./db";
import { BodyQueuePriority, type LogBodyStatus } from "@/types/workerMessages";

const getAllForOrg = async (orgId: SalesforceOrgId) => {
    const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.bodyQueue);
    const store = transaction.objectStore(LOGSTREAM_STORES.bodyQueue);
    const index = store.index('by-org');

    return requestToPromise<BodyQueueEntry[]>(
        index.getAll(orgId) as IDBRequest<BodyQueueEntry[]>
    );
}

const sortQueueEntries = (
    firstEntry: BodyQueueEntry,
    secondEntry: BodyQueueEntry
) => {
    if (firstEntry.priority !== secondEntry.priority) {
        return firstEntry.priority - secondEntry.priority;
    }

    return firstEntry.queuedAt.localeCompare(secondEntry.queuedAt);
}

export const queueRepository = {
    async enqueue(
        orgId: SalesforceOrgId,
        logId: SalesforceLogId,
        priority: BodyQueuePriority
    ) {
        const storageKey = createOrgScopedStorageKey(orgId, logId);
        const readTransaction = await createReadonlyTransaction(LOGSTREAM_STORES.bodyQueue);
        const readStore = readTransaction.objectStore(LOGSTREAM_STORES.bodyQueue);
        const existingEntry = await requestToPromise<BodyQueueEntry | undefined>(
            readStore.get(storageKey) as IDBRequest<BodyQueueEntry | undefined>
        );
        const now = new Date().toISOString();
        const entry: BodyQueueEntry = existingEntry
            ? {
                ...existingEntry,
                priority: Math.min(existingEntry.priority, priority),
                status: existingEntry.status === 'fetching' ? 'fetching' : 'queued',
                updatedAt: now,
                nextAttemptAt: now
            }
            : {
                storageKey,
                orgId,
                logId,
                priority,
                status: 'queued',
                attempts: 0,
                queuedAt: now,
                updatedAt: now,
                nextAttemptAt: now,
                lastError: null
            };

        const writeTransaction = await createReadwriteTransaction(LOGSTREAM_STORES.bodyQueue);
        const writeStore = writeTransaction.objectStore(LOGSTREAM_STORES.bodyQueue);

        writeStore.put(entry);
        await transactionDone(writeTransaction);

        return entry;
    },

    async dequeue(orgId: SalesforceOrgId, limit = 1, nowIso = new Date().toISOString()) {
        const entries = await getAllForOrg(orgId);
        const entriesToFetch = entries
            .filter(entry => {
                return entry.status !== 'fetching' && entry.nextAttemptAt <= nowIso;
            })
            .sort(sortQueueEntries)
            .slice(0, Math.max(1, limit));

        if (entriesToFetch.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.bodyQueue);
        const store = transaction.objectStore(LOGSTREAM_STORES.bodyQueue);
        const updatedAt = new Date().toISOString();
        const fetchingEntries = entriesToFetch.map(entry => ({
            ...entry,
            status: 'fetching' as const,
            updatedAt
        }));

        fetchingEntries.forEach(entry => {
            store.put(entry);
        });

        await transactionDone(transaction);

        return fetchingEntries;
    },

    async remove(orgId: SalesforceOrgId, logId: SalesforceLogId) {
        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.bodyQueue);
        const store = transaction.objectStore(LOGSTREAM_STORES.bodyQueue);
        const storageKey = createOrgScopedStorageKey(orgId, logId);

        store.delete(storageKey);

        await transactionDone(transaction);
    },

    async markFailed(
        orgId: SalesforceOrgId,
        logId: SalesforceLogId,
        errorMessage: string,
        nextAttemptAt: string
    ) {
        const storageKey = createOrgScopedStorageKey(orgId, logId);
        const readTransaction = await createReadonlyTransaction(LOGSTREAM_STORES.bodyQueue);
        const readStore = readTransaction.objectStore(LOGSTREAM_STORES.bodyQueue);
        const existingEntry = await requestToPromise<BodyQueueEntry | undefined>(
            readStore.get(storageKey) as IDBRequest<BodyQueueEntry | undefined>
        );

        if (!existingEntry) {
            return null;
        }

        const failedEntry: BodyQueueEntry = {
            ...existingEntry,
            status: 'failed',
            attempts: existingEntry.attempts + 1,
            updatedAt: new Date().toISOString(),
            nextAttemptAt,
            lastError: errorMessage
        };

        const writeTransaction = await createReadwriteTransaction(LOGSTREAM_STORES.bodyQueue);
        const writeStore = writeTransaction.objectStore(LOGSTREAM_STORES.bodyQueue);

        writeStore.put(failedEntry);
        await transactionDone(writeTransaction);

        return failedEntry;
    },

    async getStatus(orgId: SalesforceOrgId, logId: SalesforceLogId): Promise<LogBodyStatus> {
        const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.bodyQueue);
        const store = transaction.objectStore(LOGSTREAM_STORES.bodyQueue);
        const storageKey = createOrgScopedStorageKey(orgId, logId);
        const entry = await requestToPromise<BodyQueueEntry | undefined>(
            store.get(storageKey) as IDBRequest<BodyQueueEntry | undefined>
        );

        if (!entry) {
            return 'not_fetched';
        }

        if (entry.status === 'fetching') {
            return 'fetching';
        }

        if (entry.status === 'failed') {
            return 'failed';
        }

        return 'queued';
    },

    async size(orgId: SalesforceOrgId) {
        const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.bodyQueue);
        const store = transaction.objectStore(LOGSTREAM_STORES.bodyQueue);
        const index = store.index('by-org');

        return requestToPromise(index.count(orgId));
    },

    async deleteAllForOrg(orgId: SalesforceOrgId) {
        const entries = await getAllForOrg(orgId);

        if (entries.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.bodyQueue);
        const store = transaction.objectStore(LOGSTREAM_STORES.bodyQueue);

        entries.forEach(entry => {
            store.delete(entry.storageKey);
        });

        await transactionDone(transaction);

        return entries.map(entry => entry.logId);
    }
};
