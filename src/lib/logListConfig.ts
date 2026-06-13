import { type LogEntry, SortBy, SortDirection } from "@/types/ui";

export const LOG_ROW_HEIGHT = 37;
export const LOG_VIRTUAL_SCROLL_MARGIN = 96;
export const LOG_PAGE_NAVIGATION_SIZE = 10;
export const LOG_TABLE_GRID_TEMPLATE_COLUMNS = 'minmax(18rem,2.2fr) minmax(9rem,1fr) minmax(8rem,1fr) 8rem 8rem 8rem';

export const LOG_TABLE_COLUMNS: SortBy[] = [
    SortBy.OPERATION,
    SortBy.USER,
    SortBy.APP,
    SortBy.SIZE,
    SortBy.DURATION,
    SortBy.TIMESTAMP
];

export const formatLogDuration = (duration: string) => {
    const durationMs = Number.parseFloat(duration);

    if (Number.isNaN(durationMs)) {
        return duration;
    }

    if (durationMs > 9999) {
        return '>9999ms';
    }

    return duration;
}

type LogFilterOptions = {
    searchQuery: string;
    selectedUser: string | null;
    startTime: Date;
    endTime: Date;
}

const getLogTimeMs = (log: LogEntry) => {
    const date = log.startTime ? new Date(log.startTime) : new Date(`1970-01-01T${log.timestamp}Z`);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.getTime();
}

const isWithinTimeRange = (
    log: LogEntry,
    startTime: Date,
    endTime: Date
) => {
    const logTimeMs = getLogTimeMs(log);

    if (logTimeMs === null) {
        return true;
    }

    const startTimeMs = startTime.getTime();
    const endTimeMs = endTime.getTime();

    if (Number.isNaN(startTimeMs) || Number.isNaN(endTimeMs)) {
        return true;
    }

    if (startTimeMs > endTimeMs) {
        return false;
    }

    return logTimeMs >= startTimeMs && logTimeMs <= endTimeMs;
}

const matchesSearchQuery = (log: LogEntry, searchQuery: string) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
        return true;
    }

    return [
        log.operationType,
        log.operation,
        log.user,
        log.app,
        log.size,
        log.duration,
        log.timestamp
    ].some(value => value.toLowerCase().includes(normalizedQuery));
}

export const filterLogs = (
    logs: LogEntry[],
    {
        searchQuery,
        selectedUser,
        startTime,
        endTime
    }: LogFilterOptions
) => {
    return logs.filter(log => {
        if (selectedUser && log.user !== selectedUser) {
            return false;
        }

        if (!matchesSearchQuery(log, searchQuery)) {
            return false;
        }

        return isWithinTimeRange(log, startTime, endTime);
    });
}

type GetNextLogIndexOptions = {
    currentIndex: number;
    key: string;
    totalLogs: number;
}

export const getNextLogIndex = ({
    currentIndex,
    key,
    totalLogs
}: GetNextLogIndexOptions) => {
    const lastIndex = totalLogs - 1;

    if (key === 'ArrowDown') {
        return Math.min(currentIndex + 1, lastIndex);
    }

    if (key === 'ArrowUp') {
        return Math.max(currentIndex - 1, 0);
    }

    if (key === 'PageDown') {
        return Math.min(currentIndex + LOG_PAGE_NAVIGATION_SIZE, lastIndex);
    }

    if (key === 'PageUp') {
        return Math.max(currentIndex - LOG_PAGE_NAVIGATION_SIZE, 0);
    }

    if (key === 'Home') {
        return 0;
    }

    if (key === 'End') {
        return lastIndex;
    }

    return currentIndex;
}

export const sortLogs = (
    logs: LogEntry[],
    sortBy: SortBy,
    sortDirection: SortDirection
) => {
    return [...logs].sort((a, b) => {
        let compareValue = 0;

        if (sortBy === SortBy.SIZE) {
            compareValue = parseFloat(a.size) - parseFloat(b.size);
        } else if (sortBy === SortBy.DURATION) {
            compareValue = parseFloat(a.duration) - parseFloat(b.duration);
        } else if (sortBy === SortBy.TIMESTAMP) {
            const timeA = new Date(a.startTime ?? `1970-01-01T${a.timestamp}Z`).getTime();
            const timeB = new Date(b.startTime ?? `1970-01-01T${b.timestamp}Z`).getTime();
            compareValue = timeA - timeB;
        } else {
            compareValue = a[sortBy].localeCompare(b[sortBy]);
        }

        return sortDirection === SortDirection.ASC ? compareValue : -compareValue;
    });
}
