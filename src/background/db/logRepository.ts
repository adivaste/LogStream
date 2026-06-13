import type {
    SalesforceLogEntry,
    SalesforceLogId,
    SalesforceOrgId
} from "@/types/salesforce";
import {
    createOrgScopedStorageKey,
    type LogPageCursor,
    type LogPageCursorData,
    type LogStorageRecord
} from "@/types/storage";
import {
    createReadonlyTransaction,
    createReadwriteTransaction,
    LOGSTREAM_STORES,
    requestToPromise,
    transactionDone
} from "./db";

const encodeCursor = (record: SalesforceLogEntry): LogPageCursor => {
    return JSON.stringify({
        startTime: record.startTime,
        logId: record.id
    } satisfies LogPageCursorData);
}

const decodeCursor = (cursor: LogPageCursor): LogPageCursorData | null => {
    if (!cursor) {
        return null;
    }

    try {
        return JSON.parse(cursor) as LogPageCursorData;
    } catch {
        return null;
    }
}

const compareLogsDescending = (
    firstLog: SalesforceLogEntry,
    secondLog: SalesforceLogEntry
) => {
    const startTimeComparison = secondLog.startTime.localeCompare(firstLog.startTime);

    if (startTimeComparison !== 0) {
        return startTimeComparison;
    }

    return secondLog.id.localeCompare(firstLog.id);
}

const compareLogsAscending = (
    firstLog: SalesforceLogEntry,
    secondLog: SalesforceLogEntry
) => {
    const startTimeComparison = firstLog.startTime.localeCompare(secondLog.startTime);

    if (startTimeComparison !== 0) {
        return startTimeComparison;
    }

    return firstLog.id.localeCompare(secondLog.id);
}

const isAfterCursor = (
    log: SalesforceLogEntry,
    cursor: LogPageCursorData | null
) => {
    if (!cursor) {
        return true;
    }

    if (log.startTime < cursor.startTime) {
        return true;
    }

    if (log.startTime === cursor.startTime && log.id < cursor.logId) {
        return true;
    }

    return false;
}

const toStorageRecord = (log: SalesforceLogEntry): LogStorageRecord => {
    return {
        ...log,
        storageKey: createOrgScopedStorageKey(log.orgId, log.id),
        updatedAt: new Date().toISOString()
    };
}

const getAllForOrg = async (orgId: SalesforceOrgId) => {
    const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.logs);
    const store = transaction.objectStore(LOGSTREAM_STORES.logs);
    const index = store.index('by-org');
    const records = await requestToPromise<LogStorageRecord[]>(
        index.getAll(orgId) as IDBRequest<LogStorageRecord[]>
    );

    return records;
}

export const logRepository = {
    async upsertMany(logs: SalesforceLogEntry[]) {
        if (logs.length === 0) {
            return;
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logs);
        const store = transaction.objectStore(LOGSTREAM_STORES.logs);

        logs.forEach(log => {
            store.put(toStorageRecord(log));
        });

        await transactionDone(transaction);
    },

    async getById(orgId: SalesforceOrgId, logId: SalesforceLogId) {
        const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.logs);
        const store = transaction.objectStore(LOGSTREAM_STORES.logs);
        const storageKey = createOrgScopedStorageKey(orgId, logId);

        return requestToPromise<LogStorageRecord | undefined>(
            store.get(storageKey) as IDBRequest<LogStorageRecord | undefined>
        );
    },

    async getPage(
        orgId: SalesforceOrgId,
        cursor: LogPageCursor = null,
        limit = 50
    ) {
        const cursorData = decodeCursor(cursor);
        const records = await getAllForOrg(orgId);
        const pageSize = Math.max(1, limit);
        const sortedLogs = records.sort(compareLogsDescending);
        const page = sortedLogs
            .filter(log => isAfterCursor(log, cursorData))
            .slice(0, pageSize);
        const hasNextPage = sortedLogs.some(log => {
            const lastPageLog = page[page.length - 1];

            if (!lastPageLog) {
                return false;
            }

            return isAfterCursor(log, {
                startTime: lastPageLog.startTime,
                logId: lastPageLog.id
            });
        });
        const lastLog = page[page.length - 1];

        return {
            logs: page,
            nextCursor: hasNextPage && lastLog ? encodeCursor(lastLog) : null
        };
    },

    async count(orgId: SalesforceOrgId) {
        const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.logs);
        const store = transaction.objectStore(LOGSTREAM_STORES.logs);
        const index = store.index('by-org');

        return requestToPromise(index.count(orgId));
    },

    async getOldest(orgId: SalesforceOrgId) {
        const records = await getAllForOrg(orgId);

        return records.sort(compareLogsAscending)[0] ?? null;
    },

    async deleteOldest(orgId: SalesforceOrgId, deleteCount: number) {
        if (deleteCount <= 0) {
            return [];
        }

        const records = await getAllForOrg(orgId);
        const recordsToDelete = records
            .sort(compareLogsAscending)
            .slice(0, deleteCount);

        if (recordsToDelete.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logs);
        const store = transaction.objectStore(LOGSTREAM_STORES.logs);

        recordsToDelete.forEach(record => {
            store.delete(record.storageKey);
        });

        await transactionDone(transaction);

        return recordsToDelete.map(record => record.id);
    },

    async deleteAllForOrg(orgId: SalesforceOrgId) {
        const records = await getAllForOrg(orgId);

        if (records.length === 0) {
            return [];
        }

        const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.logs);
        const store = transaction.objectStore(LOGSTREAM_STORES.logs);

        records.forEach(record => {
            store.delete(record.storageKey);
        });

        await transactionDone(transaction);

        return records.map(record => record.id);
    }
};
