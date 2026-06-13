const LOGSTREAM_DB_NAME = 'logstream';
const LOGSTREAM_DB_VERSION = 1;

export const LOGSTREAM_STORES = {
    logs: 'logs',
    logBodies: 'logBodies',
    bodyQueue: 'bodyQueue',
    syncState: 'syncState'
} as const;

type LogStreamStoreName = typeof LOGSTREAM_STORES[keyof typeof LOGSTREAM_STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

const createIndexIfMissing = (
    store: IDBObjectStore,
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters
) => {
    if (!store.indexNames.contains(name)) {
        store.createIndex(name, keyPath, options);
    }
}

const createStoreIfMissing = (
    db: IDBDatabase,
    storeName: LogStreamStoreName,
    options: IDBObjectStoreParameters
) => {
    if (db.objectStoreNames.contains(storeName)) {
        return null;
    }

    return db.createObjectStore(storeName, options);
}

const upgradeDatabase = (db: IDBDatabase) => {
    const logsStore = createStoreIfMissing(db, LOGSTREAM_STORES.logs, {
        keyPath: 'storageKey'
    });

    if (logsStore) {
        createIndexIfMissing(logsStore, 'by-org', 'orgId');
        createIndexIfMissing(logsStore, 'by-org-start-time', ['orgId', 'startTime']);
        createIndexIfMissing(logsStore, 'by-org-user', ['orgId', 'logUserId']);
        createIndexIfMissing(logsStore, 'by-org-operation', ['orgId', 'operation']);
        createIndexIfMissing(logsStore, 'by-org-status', ['orgId', 'status']);
        createIndexIfMissing(logsStore, 'by-org-read-at', ['orgId', 'readAt']);
    }

    const logBodiesStore = createStoreIfMissing(db, LOGSTREAM_STORES.logBodies, {
        keyPath: 'storageKey'
    });

    if (logBodiesStore) {
        createIndexIfMissing(logBodiesStore, 'by-org', 'orgId');
        createIndexIfMissing(logBodiesStore, 'by-org-fetched-at', ['orgId', 'fetchedAt']);
        createIndexIfMissing(logBodiesStore, 'by-org-last-accessed-at', ['orgId', 'lastAccessedAt']);
    }

    const bodyQueueStore = createStoreIfMissing(db, LOGSTREAM_STORES.bodyQueue, {
        keyPath: 'storageKey'
    });

    if (bodyQueueStore) {
        createIndexIfMissing(bodyQueueStore, 'by-org', 'orgId');
        createIndexIfMissing(bodyQueueStore, 'by-org-priority', ['orgId', 'priority']);
        createIndexIfMissing(bodyQueueStore, 'by-org-status-next-attempt', ['orgId', 'status', 'nextAttemptAt']);
        createIndexIfMissing(bodyQueueStore, 'by-org-queued-at', ['orgId', 'queuedAt']);
    }

    const syncStateStore = createStoreIfMissing(db, LOGSTREAM_STORES.syncState, {
        keyPath: 'storageKey'
    });

    if (syncStateStore) {
        createIndexIfMissing(syncStateStore, 'by-org', 'orgId');
    }
}

export const openLogStreamDb = () => {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(LOGSTREAM_DB_NAME, LOGSTREAM_DB_VERSION);

        request.onupgradeneeded = () => {
            upgradeDatabase(request.result);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };

        request.onblocked = () => {
            reject(new Error('LogStream IndexedDB upgrade was blocked by another open tab.'));
        };
    });

    return dbPromise;
}

export const createReadonlyTransaction = async (
    storeName: LogStreamStoreName
) => {
    const db = await openLogStreamDb();

    return db.transaction(storeName, 'readonly');
}

export const createReadwriteTransaction = async (
    storeName: LogStreamStoreName
) => {
    const db = await openLogStreamDb();

    return db.transaction(storeName, 'readwrite');
}

export const requestToPromise = <TResult>(request: IDBRequest<TResult>) => {
    return new Promise<TResult>((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

export const transactionDone = (transaction: IDBTransaction) => {
    return new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error);
        };

        transaction.onabort = () => {
            reject(transaction.error);
        };
    });
}

export type { LogStreamStoreName };
