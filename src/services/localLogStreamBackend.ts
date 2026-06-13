import { logRepository } from "@/background/db/logRepository";
import { logBodyRepository } from "@/background/db/logBodyRepository";
import { queueRepository } from "@/background/db/queueRepository";
import { getErrorLineNumbers, countLogBodyLines } from "@/lib/logBodyMeta";
import { getMockLogBody } from "@/lib/mockLogBodyService";
import {
    mapSalesforceLogToUiLog,
    MOCK_ORG_ID
} from "@/lib/logEntryMapper";
import type { SalesforceLogRecord } from "@/types/salesforce";
import {
    BodyQueuePriority,
    type LogBodyStatus,
    type WorkerRequest,
    type WorkerResponse
} from "@/types/workerMessages";

const createErrorResponse = (
    request: WorkerRequest,
    message: string
): WorkerResponse => {
    return {
        type: 'ERROR',
        requestId: request.requestId,
        code: 'VALIDATION_ERROR',
        message,
        retryable: false
    };
}

const createLogBodyRecord = (
    orgId: string,
    logId: string,
    body: string
): SalesforceLogRecord => {
    return {
        orgId,
        logId,
        body,
        byteLength: body.length,
        lineCount: countLogBodyLines(body),
        errorLineNumbers: getErrorLineNumbers(body),
        fetchedAt: new Date().toISOString()
    };
}

const fetchAndCacheMockLogBody = async (
    orgId: string,
    logId: string
) => {
    await queueRepository.enqueue(orgId, logId, BodyQueuePriority.SelectedLog);
    await queueRepository.dequeue(orgId, 1);

    try {
        const body = await getMockLogBody(logId);
        const record = createLogBodyRecord(orgId, logId, body);

        await logBodyRepository.save(record);
        await queueRepository.remove(orgId, logId);

        return record;
    } catch (error) {
        const nextAttemptAt = new Date(Date.now() + 5_000).toISOString();

        await queueRepository.markFailed(
            orgId,
            logId,
            error instanceof Error ? error.message : 'Failed to fetch log body.',
            nextAttemptAt
        );

        throw error;
    }
}

const getLogBodyStatus = async (
    orgId: string,
    logId: string
): Promise<LogBodyStatus> => {
    const cachedBody = await logBodyRepository.get(orgId, logId);

    if (cachedBody) {
        return 'cached';
    }

    return queueRepository.getStatus(orgId, logId);
}

export const handleLocalWorkerRequest = async (
    request: WorkerRequest
): Promise<WorkerResponse> => {
    if (request.type === 'GET_LOGS') {
        const page = await logRepository.getPage(
            request.orgId,
            request.cursor ?? null,
            request.limit
        );

        return {
            type: 'LOGS',
            requestId: request.requestId,
            page: {
                logs: page.logs,
                nextCursor: page.nextCursor
            }
        };
    }

    if (request.type === 'GET_OLDER_LOGS') {
        return {
            type: 'LOGS',
            requestId: request.requestId,
            page: {
                logs: [],
                nextCursor: null
            }
        };
    }

    if (request.type === 'GET_LOG_BODY') {
        const cachedRecord = await logBodyRepository.get(request.orgId, request.logId);

        if (cachedRecord) {
            return {
                type: 'LOG_BODY',
                requestId: request.requestId,
                result: {
                    logId: request.logId,
                    record: cachedRecord,
                    status: 'cached'
                }
            };
        }

        try {
            const record = await fetchAndCacheMockLogBody(request.orgId, request.logId);

            return {
                type: 'LOG_BODY',
                requestId: request.requestId,
                result: {
                    logId: request.logId,
                    record,
                    status: 'cached'
                }
            };
        } catch {
            return {
                type: 'LOG_BODY',
                requestId: request.requestId,
                result: {
                    logId: request.logId,
                    record: null,
                    status: 'failed'
                }
            };
        }
    }

    if (request.type === 'QUEUE_LOG_BODY') {
        await queueRepository.enqueue(
            request.orgId,
            request.logId,
            request.priority
        );

        void fetchAndCacheMockLogBody(request.orgId, request.logId);

        return {
            type: 'ACK',
            requestId: request.requestId,
            requestType: request.type
        };
    }

    if (request.type === 'GET_LOG_BODY_STATUS') {
        return {
            type: 'LOG_BODY_STATUS',
            requestId: request.requestId,
            orgId: request.orgId,
            logId: request.logId,
            status: await getLogBodyStatus(request.orgId, request.logId)
        };
    }

    if (request.type === 'GET_SESSION') {
        return {
            type: 'SESSION',
            requestId: request.requestId,
            session: null
        };
    }

    if (request.type === 'GET_API_BUDGET') {
        return {
            type: 'API_BUDGET',
            requestId: request.requestId,
            orgId: request.orgId,
            budget: {
                state: 'unknown',
                used: null,
                limit: null,
                remainingPercent: null,
                updatedAt: null
            }
        };
    }

    return createErrorResponse(
        request,
        `Local backend does not handle ${request.type} yet.`
    );
}

export const getLocalLogsForUi = async () => {
    const response = await handleLocalWorkerRequest({
        type: 'GET_LOGS',
        orgId: MOCK_ORG_ID,
        limit: 10000
    });

    if (response.type !== 'LOGS') {
        return [];
    }

    return response.page.logs.map(mapSalesforceLogToUiLog);
}

export { MOCK_ORG_ID };
