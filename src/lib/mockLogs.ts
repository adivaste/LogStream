import type { LogEntry } from "@/types/ui";

const LOG_COUNT = 10000;

const LOG_OPERATIONS = [
    'UniversalPerfLogger',
    'SessionManager',
    'UserProfileUpdate',
    'AuthTokenRefresh',
    'DataGridLoader',
    'ImageResourceFetch',
    'ConfigService',
    'PreferenceSync',
    'TelemetryPush',
    'SidebarHydration',
    'FontLoader',
    'CacheInvalidator'
];

const formatTimestamp = (secondsFromStart: number) => {
    const hours = Math.floor(secondsFromStart / 3600) % 24;
    const minutes = Math.floor((secondsFromStart % 3600) / 60);
    const seconds = secondsFromStart % 60;

    return [
        String(hours).padStart(2, '0'),
        String(minutes).padStart(2, '0'),
        String(seconds).padStart(2, '0')
    ].join(':');
}

const createMockLog = (index: number): LogEntry => {
    const logNumber = index + 1;
    const operation = LOG_OPERATIONS[index % LOG_OPERATIONS.length];
    const duration = 20 + ((index * 37) % 1600);
    const sizeValue = 1 + ((index * 13) % 980);
    const secondsFromStart = (18 * 60 * 60) + (index * 7);

    const byteLength = sizeValue > 700
        ? Math.round((sizeValue / 100) * 1024 * 1024)
        : Math.round(sizeValue * 1024);

    return {
        id: `log-${String(logNumber).padStart(5, '0')}`,
        operationType: index % 4 === 0 ? 'U' : 'R',
        operation: operation ?? 'UnknownOperation',
        user: index % 7 === 0 ? 'Jane Smith' : 'Aditya Vaste',
        app: index % 5 === 0 ? 'Salesforce' : 'Browser',
        size: sizeValue > 700 ? `${(sizeValue / 100).toFixed(1)}MB` : `${sizeValue}.4KB`,
        duration: `${duration}ms`,
        timestamp: formatTimestamp(secondsFromStart),
        readAt: index % 3 === 0 ? null : formatTimestamp(secondsFromStart + 30),
        byteLength,
        durationMs: duration,
        status: index % 11 === 0 ? 'OperationFailed' : 'Success',
        hasErrors: index % 11 === 0
    };
}

export const MOCK_LOGS: LogEntry[] = Array.from({ length: LOG_COUNT }, (_, index) => {
    return createMockLog(index);
});
