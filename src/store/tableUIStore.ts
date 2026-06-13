import { create } from "zustand";
import {
    persistLogTableSortingPreference,
    readAppPreferences
} from "@/lib/appPreferences";
import { 
    type LogEntry,
    SortBy,
    SortDirection
} from "../types/ui";


// State
type TableUIState = {
    sortBy: SortBy;
    sortDirection: SortDirection;
    searchQuery: string;
    selectedUser: string | null;
    startTime: Date;
    endTime: Date;
    focusedLogId: string | null;
    selectedLog: LogEntry | null;
    logReadAtById: Record<string, string>;
    isLogPanelOpen: boolean;
}
type TableUIActions = {
    setSorting(_sortBy: SortBy, _sortDirection: SortDirection): void;
    setSearchQuery(_query: string): void;
    setSelectedUser(_user: string | null): void;
    setTimeRange(_startTime: Date, _endTime: Date): void;
    clearFilters(): void;
    isDefaultFilterRange(): boolean;
    setFocusedLogId(_logId: string | null): void;
    setLogPanelOpen(_isOpen: boolean): void;
    selectLog(_log: LogEntry): void;
    markLogRead(_log: LogEntry): LogEntry;
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
    focusedLogId: null,
    selectedLog: null,
    logReadAtById: {},
    isLogPanelOpen: false,
    
    // Actions
    setSorting: (sortBy: SortBy, sortDirection: SortDirection) => {
        persistLogTableSortingPreference(sortBy, sortDirection);
        set({ sortBy, sortDirection });
    },
    setSearchQuery: (query: string) => set({ searchQuery: query }),
    setSelectedUser: (selectedUser: string | null) => set({ selectedUser }),
    setTimeRange: (startTime: Date, endTime: Date) => set({ startTime, endTime }),
    clearFilters: () => set({
        searchQuery: DEFAULT_SEARCH_QUERY,
        selectedUser: null,
        startTime: createDefaultFilterStartTime(),
        endTime: createDefaultFilterEndTime()
    }),
    isDefaultFilterRange: () => {
        const state = useTableUIStore.getState();
        const defaultStartTime = createDefaultFilterStartTime();
        const defaultEndTime = createDefaultFilterEndTime();

        return state.startTime.getTime() === defaultStartTime.getTime()
            && state.endTime.getTime() === defaultEndTime.getTime();
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
    }

}));
