import type {
    SalesforceLogId,
    SalesforceLogRecord,
    SalesforceOrgId
} from "@/types/salesforce";
import {
    createOrgScopedStorageKey,
    type LogBodyStorageRecord
} from "@/types/storage";
import {
    createReadonlyTransaction,
    createReadwriteTransaction,
    LOGSTREAM_STORES,
    openLogStreamDb,
    requestToPromise,
    transactionDone
} from "./db";

const toStorageRecord = (record: SalesforceLogRecord): LogBodyStorageRecord => {
    return {
        ...record,
        storageKey: createOrgScopedStorageKey(record.orgId, record.logId),
        lastAccessedAt: record.fetchedAt
    };
}

const getAllForOrg = async (orgId: SalesforceOrgId) => {
    const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.logBodies);
    const store = transaction.objectStore(LOGSTREAM_STORES.logBodies);
    const index = store.index('by-org');

    return requestToPromise<LogBodyStorageRecord[]>(
        index.getAll(orgId) as IDBRequest<LogBodyStorageRecord[]>
    );
}

export const logBodyRepository = {
    async save(record: SalesforceLogRecord) {
        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const store = transaction.objectStore(LOGSTREAM_STORES.logBodies);

        store.put(toStorageRecord(record));

        await transactionDone(transaction);
    },

    async get(orgId: SalesforceOrgId, logId: SalesforceLogId) {
        const readTransaction = await createReadonlyTransaction(LOGSTREAM_STORES.logBodies);
        const readStore = readTransaction.objectStore(LOGSTREAM_STORES.logBodies);
        const storageKey = createOrgScopedStorageKey(orgId, logId);
        const record = await requestToPromise<LogBodyStorageRecord | undefined>(
            readStore.get(storageKey) as IDBRequest<LogBodyStorageRecord | undefined>
        );

        if (!record) {
            return null;
        }

        const accessedRecord = {
            ...record,
            lastAccessedAt: new Date().toISOString()
        };

        const writeTransaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const writeStore = writeTransaction.objectStore(LOGSTREAM_STORES.logBodies);

        writeStore.put(accessedRecord);
        await transactionDone(writeTransaction);

        return accessedRecord;
    },

    async totalBytes(orgId: SalesforceOrgId) {
        const records = await getAllForOrg(orgId);

        return records.reduce((totalBytes, record) => {
            return totalBytes + record.byteLength;
        }, 0);
    },

    async deleteOlderThan(orgId: SalesforceOrgId, cutoffIso: string) {
        const records = await getAllForOrg(orgId);
        const recordsToDelete = records.filter(record => record.fetchedAt < cutoffIso);

        if (recordsToDelete.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const store = transaction.objectStore(LOGSTREAM_STORES.logBodies);

        recordsToDelete.forEach(record => {
            store.delete(record.storageKey);
        });

        await transactionDone(transaction);

        return recordsToDelete.map(record => record.logId);
    },

    async enforceByteBudget(orgId: SalesforceOrgId, maxBytes: number) {
        const records = await getAllForOrg(orgId);
        const totalStoredBytes = records.reduce((total, record) => total + record.byteLength, 0);

        if (totalStoredBytes <= maxBytes) {
            return [];
        }

        // Oldest-accessed first (LRU), not oldest-fetched - a log the user
        // keeps reopening should survive being over budget as long as
        // something staler is available to evict instead.
        const sortedByLastAccessed = [...records].sort((firstRecord, secondRecord) => {
            return firstRecord.lastAccessedAt.localeCompare(secondRecord.lastAccessedAt);
        });
        const recordsToDelete: LogBodyStorageRecord[] = [];
        let remainingBytes = totalStoredBytes;

        for (const record of sortedByLastAccessed) {
            if (remainingBytes <= maxBytes) {
                break;
            }

            recordsToDelete.push(record);
            remainingBytes -= record.byteLength;
        }

        if (recordsToDelete.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const store = transaction.objectStore(LOGSTREAM_STORES.logBodies);

        recordsToDelete.forEach(record => {
            store.delete(record.storageKey);
        });

        await transactionDone(transaction);

        return recordsToDelete.map(record => record.logId);
    },

    async deleteOldestFetched(orgId: SalesforceOrgId, deleteCount: number) {
        if (deleteCount <= 0) {
            return [];
        }

        const records = await getAllForOrg(orgId);
        const recordsToDelete = records
            .sort((firstRecord, secondRecord) => {
                return firstRecord.lastAccessedAt.localeCompare(secondRecord.lastAccessedAt);
            })
            .slice(0, deleteCount);

        if (recordsToDelete.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const store = transaction.objectStore(LOGSTREAM_STORES.logBodies);

        recordsToDelete.forEach(record => {
            store.delete(record.storageKey);
        });

        await transactionDone(transaction);

        return recordsToDelete.map(record => record.logId);
    },

    async deleteOrphans(orgId: SalesforceOrgId) {
        const db = await openLogStreamDb();
        const readTransaction = db.transaction(
            [LOGSTREAM_STORES.logs, LOGSTREAM_STORES.logBodies],
            'readonly'
        );
        const logsStore = readTransaction.objectStore(LOGSTREAM_STORES.logs);
        const logBodiesStore = readTransaction.objectStore(LOGSTREAM_STORES.logBodies);
        const logIndex = logsStore.index('by-org');
        const bodyIndex = logBodiesStore.index('by-org');
        const [logRecords, bodyRecords] = await Promise.all([
            requestToPromise<{ storageKey: string }[]>(
                logIndex.getAll(orgId) as IDBRequest<{ storageKey: string }[]>
            ),
            requestToPromise<LogBodyStorageRecord[]>(
                bodyIndex.getAll(orgId) as IDBRequest<LogBodyStorageRecord[]>
            )
        ]);
        const logStorageKeys = new Set(logRecords.map(record => record.storageKey));
        const orphanRecords = bodyRecords.filter(record => {
            return !logStorageKeys.has(record.storageKey);
        });

        if (orphanRecords.length === 0) {
            return [];
        }

        const writeTransaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const writeStore = writeTransaction.objectStore(LOGSTREAM_STORES.logBodies);
        const deletedLogIds: SalesforceLogId[] = [];

        orphanRecords.forEach(record => {
            writeStore.delete(record.storageKey);
            deletedLogIds.push(record.logId);
        });

        await transactionDone(writeTransaction);

        return deletedLogIds;
    },

    async deleteAllForOrg(orgId: SalesforceOrgId) {
        const records = await getAllForOrg(orgId);

        if (records.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logBodies);
        const store = transaction.objectStore(LOGSTREAM_STORES.logBodies);

        records.forEach(record => {
            store.delete(record.storageKey);
        });

        await transactionDone(transaction);

        return records.map(record => record.logId);
    }
};
