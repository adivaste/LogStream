// --- Theme ----
export type Theme = "light" | "dark";

// --- Sort ----
export enum SortBy {
    OPERATION = 'operation',
    USER = 'user',
    APP = 'app',
    SIZE = 'size',
    DURATION = 'duration',
    TIMESTAMP = 'timestamp'
}
export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc'
}

// --- Logs ----
export type LogEntry = {
    id: string;
    operationType: string;
    operation: string;
    user: string;
    app: string;
    size: string;
    duration: string;
    timestamp: string;
    startTime?: string;
    readAt: string | null;
}
