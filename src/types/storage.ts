import type {
    ApexLogCursor,
    SalesforceLogEntry,
    SalesforceLogId,
    SalesforceLogRecord,
    SalesforceOrgId
} from "./salesforce";
import type { BodyQueuePriority, LogBodyStatus } from "./workerMessages";

export type StorageKey = string;

export type LogPageCursor = string | null;

export type LogPageCursorData = {
    startTime: string;
    logId: SalesforceLogId;
}

export type LogStorageRecord = SalesforceLogEntry & {
    storageKey: StorageKey;
    updatedAt: string;
}

export type LogBodyStorageRecord = SalesforceLogRecord & {
    storageKey: StorageKey;
    lastAccessedAt: string;
}

export type BodyQueueStatus =
    | 'queued'
    | 'fetching'
    | 'failed';

export type BodyQueueEntry = {
    storageKey: StorageKey;
    orgId: SalesforceOrgId;
    logId: SalesforceLogId;
    priority: BodyQueuePriority;
    status: BodyQueueStatus;
    attempts: number;
    queuedAt: string;
    updatedAt: string;
    nextAttemptAt: string;
    lastError: string | null;
}

export type SyncStateRecord = {
    storageKey: StorageKey;
    orgId: SalesforceOrgId;
    key: 'apexlog';
    cursor: ApexLogCursor;
    lastSyncedAt: string | null;
    isManualPaused: boolean;
    isIdlePaused: boolean;
}

export type BodyStatusRecord = {
    orgId: SalesforceOrgId;
    logId: SalesforceLogId;
    status: LogBodyStatus;
}

export const createOrgScopedStorageKey = (
    orgId: SalesforceOrgId,
    id: string
) => {
    return `${orgId}:${id}`;
}
