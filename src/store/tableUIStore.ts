import { create } from "zustand";
import {
    persistLogTableSortingPreference,
    readAppPreferences
} from "@/lib/appPreferences";
import { sendWorkerRequest } from "@/services/backgroundBridge";
import { useUIStore } from "@/store/uiStore";
import {
    type LogEntry,
    SortBy,
    SortDirection
} from "../types/ui";

// Persists read state to IndexedDB (via the background worker) so a reload
// doesn't show every log as unread again - `logReadAtById` alone only lived
// in this tab's in-memory store. Fire-and-forget: the local state update
// already reflects "read" immediately, this just makes it survive a reload.
const persistLogRead = (logId: string, readAt: string) => {
    const orgId = useUIStore.getState().connectionInfo?.orgId;

    if (!orgId) {
        return;
    }

    sendWorkerRequest({
        type: 'MARK_LOG_READ',
        orgId,
        logId,
        readAt
    }).catch(() => {});
}


// State
type TableUIState = {
    sortBy: SortBy;
    sortDirection: SortDirection;
    searchQuery: string;
    selectedUser: string | null;
    startTime: Date;
    endTime: Date;
    minSizeBytes: number | null;
    maxSizeBytes: number | null;
    focusedLogId: string | null;
    selectedLog: LogEntry | null;
    logReadAtById: Record<string, string>;
    isLogPanelOpen: boolean;
    // Keyed by log id (not the log body viewer's own state) so pins survive
    // closing and reopening the log panel - LogBodyViewer fully unmounts on
    // close, which resets everything local to it. Session-only: intentionally
    // not persisted to IndexedDB, since a pin is a marker for the debugging
    // pass you're doing right now, not a permanent bookmark.
    pinnedLinesByLogId: Record<string, number[]>;
}
type TableUIActions = {
    setSorting(_sortBy: SortBy, _sortDirection: SortDirection): void;
    setSearchQuery(_query: string): void;
    setSelectedUser(_user: string | null): void;
    setTimeRange(_startTime: Date, _endTime: Date): void;
    setSizeRange(_minSizeBytes: number | null, _maxSizeBytes: number | null): void;
    clearFilters(): void;
    isDefaultFilterRange(): boolean;
    setFocusedLogId(_logId: string | null): void;
    setLogPanelOpen(_isOpen: boolean): void;
    selectLog(_log: LogEntry): void;
    markLogRead(_log: LogEntry): LogEntry;
    togglePinnedLine(_logId: string, _sourceLineIndex: number): void;
    clearPinnedLines(_logId: string): void;
}
type TableUIStore = TableUIState & TableUIActions;


// Defaults
const preferences = readAppPreferences();
const DEFAULT_SORT_BY:SortBy = preferences.logTable.sortBy;
const DEFAULT_SORT_DIRECTION:SortDirection = preferences.logTable.sortDirection;
const DEFAULT_SEARCH_QUERY:string = '';

const createDefaultFilterStartTime = () => {
    const startTime = new Date();
    startTime.setHours(0, 0, 0, 0);

    return startTime;
}

const createDefaultFilterEndTime = () => {
    const endTime = new Date();
    endTime.setHours(23, 59, 59, 999);

    return endTime;
}


export const useTableUIStore = create<TableUIStore>((set) => ({

    // Initial State
    sortBy: DEFAULT_SORT_BY,
    sortDirection: DEFAULT_SORT_DIRECTION,
    searchQuery: DEFAULT_SEARCH_QUERY,
    selectedUser: null,
    startTime: createDefaultFilterStartTime(),
    endTime: createDefaultFilterEndTime(),
    minSizeBytes: null,
    maxSizeBytes: null,
    focusedLogId: null,
    selectedLog: null,
    logReadAtById: {},
    isLogPanelOpen: false,
    pinnedLinesByLogId: {},
    
    // Actions
    setSorting: (sortBy: SortBy, sortDirection: SortDirection) => {
        persistLogTableSortingPreference(sortBy, sortDirection);
        set({ sortBy, sortDirection });
    },
    setSearchQuery: (query: string) => set({ searchQuery: query }),
    setSelectedUser: (selectedUser: string | null) => set({ selectedUser }),
    setTimeRange: (startTime: Date, endTime: Date) => set({ startTime, endTime }),
    setSizeRange: (minSizeBytes: number | null, maxSizeBytes: number | null) => set({ minSizeBytes, maxSizeBytes }),
    clearFilters: () => set({
        searchQuery: DEFAULT_SEARCH_QUERY,
        selectedUser: null,
        startTime: createDefaultFilterStartTime(),
        endTime: createDefaultFilterEndTime(),
        minSizeBytes: null,
        maxSizeBytes: null
    }),
    isDefaultFilterRange: () => {
        const state = useTableUIStore.getState();
        const defaultStartTime = createDefaultFilterStartTime();
        const defaultEndTime = createDefaultFilterEndTime();

        return state.startTime.getTime() === defaultStartTime.getTime()
            && state.endTime.getTime() === defaultEndTime.getTime()
            && state.minSizeBytes === null
            && state.maxSizeBytes === null;
    },
    setFocusedLogId: (logId: string | null) => set(state => (
        state.focusedLogId === logId ? state : { focusedLogId: logId }
    )),
    setLogPanelOpen: (isOpen: boolean) => set(state => (
        state.isLogPanelOpen === isOpen ? state : { isLogPanelOpen: isOpen }
    )),
    markLogRead: (log: LogEntry) => {
        const readAt = log.readAt ?? new Date().toISOString();
        const readLog = { ...log, readAt };

        if (!log.readAt) {
            persistLogRead(log.id, readAt);
        }

        set(state => {
            if (!log.readAt) {
                state.logReadAtById[log.id] = readAt;
            }

            return {
                logReadAtById: state.logReadAtById,
                selectedLog: state.selectedLog?.id === log.id ? readLog : state.selectedLog
            };
        });

        return readLog;
    },
    selectLog: (log: LogEntry) => {
        const readAt = log.readAt ?? new Date().toISOString();
        const readLog = { ...log, readAt };

        if (!log.readAt) {
            persistLogRead(log.id, readAt);
        }

        set(state => {
            if (!log.readAt) {
                state.logReadAtById[log.id] = readAt;
            }

            return {
                selectedLog: readLog,
                isLogPanelOpen: true,
                logReadAtById: state.logReadAtById
            };
        });
    },
    togglePinnedLine: (logId: string, sourceLineIndex: number) => set(state => {
        const currentPins = state.pinnedLinesByLogId[logId] ?? [];
        const nextPins = currentPins.includes(sourceLineIndex)
            ? currentPins.filter(pinnedIndex => pinnedIndex !== sourceLineIndex)
            : [...currentPins, sourceLineIndex].sort((a, b) => a - b);

        return {
            pinnedLinesByLogId: {
                ...state.pinnedLinesByLogId,
                [logId]: nextPins
            }
        };
    }),
    clearPinnedLines: (logId: string) => set(state => ({
        pinnedLinesByLogId: {
            ...state.pinnedLinesByLogId,
            [logId]: []
        }
    }))

}));
