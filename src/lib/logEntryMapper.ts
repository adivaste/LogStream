import type { SalesforceLogEntry } from "@/types/salesforce";
import type { LogEntry } from "@/types/ui";

const MOCK_ORG_ID = 'mock-org';

const parseByteLength = (size: string) => {
    const normalizedSize = size.trim().toLowerCase();
    const numericSize = Number.parseFloat(normalizedSize);

    if (Number.isNaN(numericSize)) {
        return 0;
    }

    if (normalizedSize.endsWith('mb')) {
        return Math.round(numericSize * 1024 * 1024);
    }

    if (normalizedSize.endsWith('kb')) {
        return Math.round(numericSize * 1024);
    }

    return Math.round(numericSize);
}

const formatByteSize = (byteLength: number) => {
    if (byteLength >= 1024 * 1024) {
        return `${(byteLength / 1024 / 1024).toFixed(1)}MB`;
    }

    if (byteLength >= 1024) {
        return `${(byteLength / 1024).toFixed(1)}KB`;
    }

    return `${byteLength}B`;
}

const parseDurationMs = (duration: string) => {
    const durationMs = Number.parseFloat(duration);

    return Number.isNaN(durationMs) ? null : durationMs;
}

const formatTimestamp = (startTime: string) => {
    const date = new Date(startTime);

    if (Number.isNaN(date.getTime())) {
        return startTime;
    }

    return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

const createMockStartTime = (timestamp: string) => {
    return `2026-05-21T${timestamp}.000Z`;
}

export const mapUiLogToSalesforceLog = (log: LogEntry): SalesforceLogEntry => {
    return {
        id: log.id,
        orgId: MOCK_ORG_ID,
        startTime: createMockStartTime(log.timestamp),
        application: log.app,
        durationMs: parseDurationMs(log.duration),
        byteLength: parseByteLength(log.size),
        logUserId: log.user,
        logUserName: log.user,
        operation: log.operation,
        request: log.operationType,
        requestIdentifier: null,
        status: 'Success',
        hasErrors: false,
        readAt: log.readAt,
        bodyStatus: 'not_fetched'
    };
}

export const mapSalesforceLogToUiLog = (log: SalesforceLogEntry): LogEntry => {
    return {
        id: log.id,
        operationType: log.request ?? '',
        operation: log.operation,
        user: log.logUserName ?? log.logUserId,
        app: log.application ?? 'Salesforce',
        size: formatByteSize(log.byteLength),
        duration: log.durationMs === null ? '-' : `${log.durationMs}ms`,
        timestamp: formatTimestamp(log.startTime),
        startTime: log.startTime,
        readAt: log.readAt
    };
}

export { MOCK_ORG_ID };
