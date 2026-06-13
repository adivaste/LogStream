import { logRepository } from "./db/logRepository";
import { syncStateRepository } from "./db/syncStateRepository";
import { liveLogPoller } from "./poller";
import { apexLogService } from "./salesforce/apexLogService";
import { apiLimitService } from "./salesforce/apiLimitService";
import {
    handleSessionRequest,
    isSessionRequest
} from "./session/sessionService";
import { sessionStore } from "./session/sessionStore";
import { handleLocalWorkerRequest } from "@/services/localLogStreamBackend";
import type { WorkerRequest, WorkerResponse } from "@/types/workerMessages";

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

export const handleWorkerMessage = async (
    request: WorkerRequest
): Promise<WorkerResponse> => {
    try {
        if (isSessionRequest(request)) {
            return await handleSessionRequest(request);
        }

        if (request.type === 'GET_LOGS') {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (session && session.orgId === request.orgId) {
                await liveLogPoller.tick();
                const page = await logRepository.getPage(
                    request.orgId,
                    request.cursor ?? null,
                    request.limit
                );

                return {
                    type: 'LOGS',
                    requestId: request.requestId,
                    page
                };
            }
        }

        if (request.type === 'GET_OLDER_LOGS') {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (session && session.orgId === request.orgId) {
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
        }

        if (request.type === 'SET_LIVE_POLLING') {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (session && session.orgId === request.orgId) {
                await liveLogPoller.setLivePolling(request.orgId, request.enabled);

                return {
                    type: 'LIVE_POLLING_STATE',
                    requestId: request.requestId,
                    orgId: request.orgId,
                    state: request.enabled ? 'live' : 'manual_paused'
                };
            }
        }

        if (request.type === 'USER_ACTIVITY_HEARTBEAT') {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (session && session.orgId === request.orgId) {
                await syncStateRepository.setIdlePaused(request.orgId, false);

                return {
                    type: 'ACK',
                    requestId: request.requestId,
                    requestType: request.type
                };
            }
        }

        if (request.type === 'GET_LOG_BODY') {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (session && session.orgId === request.orgId) {
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
                    return createLogBodyErrorResponse(request, error);
                }
            }
        }

        if (request.type === 'GET_API_BUDGET') {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (session && session.orgId === request.orgId) {
                return {
                    type: 'API_BUDGET',
                    requestId: request.requestId,
                    orgId: request.orgId,
                    budget: await apiLimitService.getApiBudget()
                };
            }
        }

        return await handleLocalWorkerRequest(request);
    } catch (error) {
        return createUnknownErrorResponse(request, error);
    }
}
