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

// --- Log body ----
// Which view the log panel's body is showing: the raw log text, or the
// call tree derived from it.
export type LogBodyViewMode = 'raw' | 'tree';

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
