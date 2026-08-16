import { broadcastWorkerEvent } from "./broadcast";
import { logRepository } from "./db/logRepository";
import { syncStateRepository } from "./db/syncStateRepository";
import { liveLogPoller } from "./poller";
import { apexLogService } from "./salesforce/apexLogService";
import { apiLimitService } from "./salesforce/apiLimitService";
import { SalesforceSessionExpiredError } from "./salesforce/salesforceClient";
import { traceFlagService } from "./salesforce/traceFlagService";
import {
    handleSessionRequest,
    isSessionRequest
} from "./session/sessionService";
import { sessionStore } from "./session/sessionStore";
import { handleLocalWorkerRequest } from "@/services/localLogStreamBackend";
import type { WorkerErrorResponse, WorkerRequest, WorkerResponse } from "@/types/workerMessages";

// Shared across every on-demand (non-poller) Salesforce call below - the
// poller already handles its own SESSION_EXPIRED broadcast+clear in
// poller.ts, but a session can just as easily die mid-request for log body
// fetches, trace flag mutations, or API budget checks. Routing all of them
// through the same clear+broadcast (and the same friendly message) means
// every surface shows "reconnect" instead of each leaking its own raw
// "401: Session expired..." Salesforce error text.
const SESSION_EXPIRED_MESSAGE = 'Your Salesforce session has expired. Reconnect from the header to continue.';

const handleSessionExpiredError = async (): Promise<void> => {
    await sessionStore.clear();
    broadcastWorkerEvent({ event: 'SESSION_EXPIRED' });
}

const createUnknownErrorResponse = (
    request: WorkerRequest,
    error: unknown
): WorkerResponse => {
    return {
        type: 'ERROR',
        requestId: request.requestId,
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected background worker error.',
        retryable: true
    };
}

const createLogBodyErrorResponse = (
    request: Extract<WorkerRequest, { type: 'GET_LOG_BODY' }>,
    error: unknown
): WorkerResponse => {
    return {
        type: 'LOG_BODY',
        requestId: request.requestId,
        result: {
            logId: request.logId,
            record: null,
            status: 'failed'
        },
        errorMessage: error instanceof Error ? error.message : 'Failed to fetch Salesforce log body.'
    };
}

const createNoSessionErrorResponse = (
    request: WorkerRequest
): WorkerErrorResponse => {
    return {
        type: 'ERROR',
        requestId: request.requestId,
        code: 'NO_SESSION',
        message: 'No Salesforce session is connected. Reconnect an org and try again.',
        retryable: false
    };
}

const createInvalidSessionErrorResponse = (
    request: WorkerRequest
): WorkerErrorResponse => {
    return {
        type: 'ERROR',
        requestId: request.requestId,
        code: 'INVALID_SESSION',
        message: 'The connected Salesforce session no longer matches this org. Reconnect and try again.',
        retryable: false
    };
}

// Requests below require a live Salesforce session that matches `request.orgId`.
// A missing/mismatched session must surface as NO_SESSION/INVALID_SESSION so the
// UI can prompt the user to reconnect - it must never silently fall through to
// the local/mock backend, which would misreport real Salesforce state (e.g. an
// empty "older logs" page reading as "no more history" instead of "lost session").
type SessionGatedRequest = Extract<
    WorkerRequest,
    {
        type:
            | 'GET_LOGS'
            | 'GET_OLDER_LOGS'
            | 'SET_LIVE_POLLING'
            | 'USER_ACTIVITY_HEARTBEAT'
            | 'GET_LOG_BODY'
            | 'MARK_LOG_READ'
            | 'GET_API_BUDGET'
            | 'GET_TRACE_FLAG_USERS'
            | 'REFRESH_TRACE_FLAGS'
            | 'SET_TRACE_FLAG';
    }
>;

const isSessionGatedRequest = (request: WorkerRequest): request is SessionGatedRequest => {
    return (
        request.type === 'GET_LOGS' ||
        request.type === 'GET_OLDER_LOGS' ||
        request.type === 'SET_LIVE_POLLING' ||
        request.type === 'USER_ACTIVITY_HEARTBEAT' ||
        request.type === 'GET_LOG_BODY' ||
        request.type === 'MARK_LOG_READ' ||
        request.type === 'GET_API_BUDGET' ||
        request.type === 'GET_TRACE_FLAG_USERS' ||
        request.type === 'REFRESH_TRACE_FLAGS' ||
        request.type === 'SET_TRACE_FLAG'
    );
}

const handleSessionGatedRequest = async (
    request: SessionGatedRequest
): Promise<WorkerResponse> => {
    const session = sessionStore.get() ?? await sessionStore.restore();

    if (!session) {
        return createNoSessionErrorResponse(request);
    }

    if (session.orgId !== request.orgId) {
        return createInvalidSessionErrorResponse(request);
    }

    if (request.type === 'GET_LOGS') {
        const tickResult = await liveLogPoller.tick();
        const page = await logRepository.getPage(
            request.orgId,
            request.cursor ?? null,
            request.limit
        );

        return {
            type: 'LOGS',
            requestId: request.requestId,
            page,
            livePollingState: tickResult.state ?? undefined
        };
    }

    if (request.type === 'GET_OLDER_LOGS') {
        const logs = await apexLogService.fetchOlderLogs(
            session,
            request.beforeStartTime,
            request.afterStartTime ?? null,
            request.limit
        );

        return {
            type: 'LOGS',
            requestId: request.requestId,
            page: {
                logs,
                nextCursor: logs.at(-1)?.id ?? null
            }
        };
    }

    if (request.type === 'SET_LIVE_POLLING') {
        await liveLogPoller.setLivePolling(request.orgId, request.enabled);

        return {
            type: 'LIVE_POLLING_STATE',
            requestId: request.requestId,
            orgId: request.orgId,
            state: request.enabled ? 'live' : 'manual_paused'
        };
    }

    if (request.type === 'USER_ACTIVITY_HEARTBEAT') {
        await syncStateRepository.setIdlePaused(request.orgId, false);

        return {
            type: 'ACK',
            requestId: request.requestId,
            requestType: request.type
        };
    }

    if (request.type === 'GET_LOG_BODY') {
        try {
            const record = await apexLogService.getLogBody(session, request.logId);

            return {
                type: 'LOG_BODY',
                requestId: request.requestId,
                result: {
                    logId: request.logId,
                    record,
                    status: 'cached'
                }
            };
        } catch (error) {
            if (error instanceof SalesforceSessionExpiredError) {
                await handleSessionExpiredError();
                return createLogBodyErrorResponse(request, new Error(SESSION_EXPIRED_MESSAGE));
            }

            return createLogBodyErrorResponse(request, error);
        }
    }

    if (request.type === 'MARK_LOG_READ') {
        await logRepository.markRead(request.orgId, request.logId, request.readAt);

        return {
            type: 'ACK',
            requestId: request.requestId,
            requestType: request.type
        };
    }

    if (request.type === 'GET_API_BUDGET') {
        return {
            type: 'API_BUDGET',
            requestId: request.requestId,
            orgId: request.orgId,
            budget: await apiLimitService.getApiBudget()
        };
    }

    if (request.type === 'GET_TRACE_FLAG_USERS' || request.type === 'REFRESH_TRACE_FLAGS') {
        const users = await traceFlagService.getTraceFlagUsers();

        return {
            type: 'TRACE_FLAG_USERS',
            requestId: request.requestId,
            orgId: request.orgId,
            users
        };
    }

    const updatedUser = await traceFlagService.setTraceFlag(
        session,
        request.userId,
        request.expiresAt,
        request.debugLevelName
    );

    // Broadcast/return only the one changed user instead of refetching the
    // whole org - callers merge this into their existing list by user id.
    broadcastWorkerEvent({
        event: 'TRACE_FLAGS_CHANGED',
        orgId: request.orgId,
        users: [updatedUser]
    });

    return {
        type: 'TRACE_FLAG_USERS',
        requestId: request.requestId,
        orgId: request.orgId,
        users: [updatedUser]
    };
}

export const handleWorkerMessage = async (
    request: WorkerRequest
): Promise<WorkerResponse> => {
    try {
        if (request.type === 'SET_LIVE_POLL_INTERVAL_MS') {
            await liveLogPoller.setPollIntervalMs(request.pollIntervalMs);

            return {
                type: 'ACK',
                requestId: request.requestId,
                requestType: request.type
            };
        }

        if (isSessionRequest(request)) {
            return await handleSessionRequest(request);
        }

        if (isSessionGatedRequest(request)) {
            return await handleSessionGatedRequest(request);
        }

        return await handleLocalWorkerRequest(request);
    } catch (error) {
        if (error instanceof SalesforceSessionExpiredError) {
            await handleSessionExpiredError();

            return {
                type: 'ERROR',
                requestId: request.requestId,
                code: 'INVALID_SESSION',
                message: SESSION_EXPIRED_MESSAGE,
                retryable: false
            };
        }

        return createUnknownErrorResponse(request, error);
    }
}
