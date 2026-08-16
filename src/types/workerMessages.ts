import type {
    SalesforceConnectionInfo,
    SalesforceLogEntry,
    SalesforceLogId,
    SalesforceLogRecord,
    SalesforceOrgId,
    SalesforceUser,
    SalesforceUserId
} from "./salesforce";

export type RequestId = string;
export type LogCursor = string | null;

export type LivePollingState =
    | 'live'
    | 'syncing'
    | 'idle_paused'
    | 'manual_paused'
    | 'api_exceeded'
    | 'session_expired'
    | 'offline';

export type ApiBudgetState =
    | 'ok'
    | 'warn'
    | 'throttle'
    | 'exceeded'
    | 'unknown';

export type LogBodyStatus =
    | 'not_fetched'
    | 'queued'
    | 'fetching'
    | 'cached'
    | 'failed'
    | 'too_large';

export type WorkerErrorCode =
    | 'NO_SESSION'
    | 'INVALID_SESSION'
    | 'REQUEST_LIMIT_EXCEEDED'
    | 'NETWORK_ERROR'
    | 'SALESFORCE_ERROR'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'UNKNOWN_ERROR';

export enum BodyQueuePriority {
    SelectedLog = 0,
    FocusedLog = 1,
    VisibleLog = 2,
    BackgroundPrefetch = 3
}

export type ApiBudgetSnapshot = {
    state: ApiBudgetState;
    used: number | null;
    limit: number | null;
    remainingPercent: number | null;
    updatedAt: string | null;
}

export type LogPage = {
    logs: SalesforceLogEntry[];
    nextCursor: LogCursor;
}

export type LogBodyResult = {
    logId: SalesforceLogId;
    record: SalesforceLogRecord | null;
    status: LogBodyStatus;
}

export type TraceFlagUserSummary = {
    user: SalesforceUser;
    hasTraceFlag: boolean;
    traceFlagId: string | null;
    expiresAt: string | null;
    remainingMs: number | null;
    debugLevelName: string | null;
}

export type WorkerRequest =
    | {
        type: 'GET_SESSION';
        requestId?: RequestId;
    }
    | {
        type: 'REFRESH_SESSION';
        requestId?: RequestId;
        sourceTabId?: number;
        sourceUrl?: string;
    }
    | {
        type: 'CLEAR_SESSION';
        requestId?: RequestId;
    }
    | {
        type: 'GET_LOGS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        cursor?: LogCursor;
        limit: number;
    }
    | {
        type: 'GET_OLDER_LOGS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        beforeStartTime: string;
        afterStartTime?: string;
        limit: number;
    }
    | {
        type: 'GET_LOG_BODY';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
    }
    | {
        type: 'QUEUE_LOG_BODY';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
        priority: BodyQueuePriority;
    }
    | {
        type: 'GET_LOG_BODY_STATUS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
    }
    | {
        type: 'MARK_LOG_READ';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
        readAt: string;
    }
    | {
        type: 'SET_LIVE_POLLING';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        enabled: boolean;
    }
    | {
        type: 'SET_LIVE_POLL_INTERVAL_MS';
        requestId?: RequestId;
        pollIntervalMs: number;
    }
    | {
        type: 'USER_ACTIVITY_HEARTBEAT';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        occurredAt: string;
    }
    | {
        type: 'GET_API_BUDGET';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
    }
    | {
        type: 'GET_TRACE_FLAG_USERS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
    }
    | {
        type: 'REFRESH_TRACE_FLAGS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
    }
    | {
        type: 'SET_TRACE_FLAG';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        userId: SalesforceUserId;
        expiresAt: string;
        debugLevelName: string;
    };

export type WorkerResponse =
    | {
        type: 'SESSION';
        requestId?: RequestId;
        session: SalesforceConnectionInfo | null;
    }
    | {
        type: 'LOGS';
        requestId?: RequestId;
        page: LogPage;
        // Only ever attached by GET_LOGS (which ticks the live poller before
        // reading the cache) - GET_OLDER_LOGS has no polling attempt to report.
        // The cache read below succeeds independently of whether Salesforce
        // was actually reachable, so without this the caller has no way to
        // tell a real "live" result apart from "served from cache while the
        // session was actually dead".
        livePollingState?: LivePollingState;
    }
    | {
        type: 'LOG_BODY';
        requestId?: RequestId;
        result: LogBodyResult;
        errorMessage?: string;
    }
    | {
        type: 'LOG_BODY_STATUS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
        status: LogBodyStatus;
    }
    | {
        type: 'LIVE_POLLING_STATE';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        state: LivePollingState;
    }
    | {
        type: 'API_BUDGET';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        budget: ApiBudgetSnapshot;
    }
    | {
        type: 'TRACE_FLAG_USERS';
        requestId?: RequestId;
        orgId: SalesforceOrgId;
        users: TraceFlagUserSummary[];
    }
    | {
        type: 'ACK';
        requestId?: RequestId;
        requestType: WorkerRequest['type'];
    }
    | WorkerErrorResponse;

export type WorkerErrorResponse = {
    type: 'ERROR';
    requestId?: RequestId;
    code: WorkerErrorCode;
    message: string;
    retryable: boolean;
}

export type WorkerEvent =
    | {
        event: 'SESSION_CHANGED';
        session: SalesforceConnectionInfo | null;
    }
    | {
        event: 'SESSION_EXPIRED';
    }
    | {
        event: 'NEW_LOGS';
        orgId: SalesforceOrgId;
        logs: SalesforceLogEntry[];
    }
    | {
        event: 'LOG_BODY_READY';
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
    }
    | {
        event: 'LOG_BODY_STATUS_CHANGED';
        orgId: SalesforceOrgId;
        logId: SalesforceLogId;
        status: LogBodyStatus;
    }
    | {
        event: 'LIVE_POLLING_STATE_CHANGED';
        orgId: SalesforceOrgId;
        state: LivePollingState;
    }
    | {
        event: 'API_BUDGET_CHANGED';
        orgId: SalesforceOrgId;
        budget: ApiBudgetSnapshot;
    }
    | {
        event: 'TRACE_FLAGS_CHANGED';
        orgId: SalesforceOrgId;
        users: TraceFlagUserSummary[];
    }
    | {
        event: 'WORKER_ERROR';
        orgId?: SalesforceOrgId;
        code: WorkerErrorCode;
        message: string;
        retryable: boolean;
    };
