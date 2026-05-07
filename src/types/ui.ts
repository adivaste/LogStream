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