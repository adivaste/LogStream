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

// Where keyboard focus should land when the log panel opens.
// 'body'    - the user committed to reading this log (Enter), so focus moves
//             into the log body and they can traverse it immediately.
// 'preview' - they're still scanning the list (Space, or a mouse click), so
//             focus must stay where it is or the next arrow key would be
//             swallowed by the panel.
export type LogPanelFocusIntent = 'body' | 'preview';

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
    // Raw values carried alongside the formatted ones above. `size` and
    // `duration` are display strings ("1.2MB", "450ms"), which can only be
    // matched as text - real >/</between comparisons need the numbers, and
    // status/hasErrors were being dropped by the mapper entirely even though
    // "hide the successful ones" is the most common thing to filter on.
    byteLength: number;
    durationMs: number | null;
    status: string;
    hasErrors: boolean;
}
