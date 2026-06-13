import { orgService } from "@/background/salesforce/orgService";
import { sessionDetector } from "./sessionDetector";
import { sessionStore } from "./sessionStore";
import type { WorkerRequest, WorkerResponse } from "@/types/workerMessages";

const createSessionResponse = (
    request: WorkerRequest
): WorkerResponse => {
    return {
        type: 'SESSION',
        requestId: request.requestId,
        session: sessionStore.getConnectionInfo()
    };
}

export const isSessionRequest = (request: WorkerRequest) => {
    return request.type === 'GET_SESSION'
        || request.type === 'REFRESH_SESSION'
        || request.type === 'CLEAR_SESSION';
}

export const handleSessionRequest = async (
    request: WorkerRequest
): Promise<WorkerResponse> => {
    if (request.type === 'GET_SESSION') {
        await sessionStore.restore();
        return createSessionResponse(request);
    }

    if (request.type === 'REFRESH_SESSION') {
        const detectedSession = await sessionDetector.detectFromTabContext({
            sourceTabId: request.sourceTabId,
            sourceUrl: request.sourceUrl
        });

        if (detectedSession) {
            await sessionStore.set(detectedSession);

            try {
                const orgName = await orgService.getOrgName();

                await sessionStore.set({
                    ...detectedSession,
                    orgName
                });
            } catch {
                // Keep the detected session even if org-name enrichment fails.
            }
        } else {
            await sessionStore.restore();
        }

        return createSessionResponse(request);
    }

    if (request.type === 'CLEAR_SESSION') {
        await sessionStore.clear();
        return createSessionResponse(request);
    }

    return {
        type: 'ERROR',
        requestId: request.requestId,
        code: 'VALIDATION_ERROR',
        message: `Unsupported session request: ${request.type}`,
        retryable: false
    };
}
