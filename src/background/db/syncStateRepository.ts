import type { ApexLogCursor, SalesforceOrgId } from "@/types/salesforce";
import { createOrgScopedStorageKey, type SyncStateRecord } from "@/types/storage";
import {
    createReadonlyTransaction,
    createReadwriteTransaction,
    LOGSTREAM_STORES,
    requestToPromise,
    transactionDone
} from "./db";

const SYNC_STATE_KEY = 'apexlog';

const DEFAULT_CURSOR: ApexLogCursor = {
    lastStartTime: null,
    seenLogIdsAtLastStartTime: []
};

const createDefaultSyncState = (orgId: SalesforceOrgId): SyncStateRecord => {
    return {
        storageKey: createOrgScopedStorageKey(orgId, SYNC_STATE_KEY),
        orgId,
        key: SYNC_STATE_KEY,
        cursor: DEFAULT_CURSOR,
        lastSyncedAt: null,
        isManualPaused: false,
        isIdlePaused: false
    };
}

const saveSyncState = async (record: SyncStateRecord) => {
    const transaction = await createReadwriteTransaction(LOGSTREAM_STORES.syncState);
    const store = transaction.objectStore(LOGSTREAM_STORES.syncState);

    store.put(record);

    await transactionDone(transaction);

    return record;
}

export const syncStateRepository = {
    async get(orgId: SalesforceOrgId) {
        const transaction = await createReadonlyTransaction(LOGSTREAM_STORES.syncState);
        const store = transaction.objectStore(LOGSTREAM_STORES.syncState);
        const storageKey = createOrgScopedStorageKey(orgId, SYNC_STATE_KEY);
        const record = await requestToPromise<SyncStateRecord | undefined>(
            store.get(storageKey) as IDBRequest<SyncStateRecord | undefined>
        );

        return record ?? createDefaultSyncState(orgId);
    },

    async save(record: SyncStateRecord) {
        return saveSyncState(record);
    },

    async updateCursor(
        orgId: SalesforceOrgId,
        cursor: ApexLogCursor,
        lastSyncedAt = new Date().toISOString()
    ) {
        const current = await this.get(orgId);

        return saveSyncState({
            ...current,
            cursor,
            lastSyncedAt
        });
    },

    async setManualPaused(orgId: SalesforceOrgId, isManualPaused: boolean) {
        const current = await this.get(orgId);

        return saveSyncState({
            ...current,
            isManualPaused
        });
    },

    async setIdlePaused(orgId: SalesforceOrgId, isIdlePaused: boolean) {
        const current = await this.get(orgId);

        return saveSyncState({
            ...current,
            isIdlePaused
        });
    }
};
