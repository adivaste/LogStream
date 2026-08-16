import { type LogEntry, SortBy, SortDirection } from "@/types/ui";

export const LOG_ROW_HEIGHT = 37;
export const LOG_VIRTUAL_SCROLL_MARGIN = 96;
export const LOG_PAGE_NAVIGATION_SIZE = 10;

// Default for the user-configurable "slow log" threshold (Settings >
// Preferences) - see appPreferences.ts's `polling` section.
export const DEFAULT_SLOW_LOG_THRESHOLD_MS = 2_000;
export const LOG_TABLE_GRID_TEMPLATE_COLUMNS = 'minmax(18rem,2.2fr) minmax(9rem,1fr) minmax(8rem,1fr) 8rem 8rem 8rem';

export const LOG_TABLE_COLUMNS: SortBy[] = [
    SortBy.OPERATION,
    SortBy.USER,
    SortBy.APP,
    SortBy.SIZE,
    SortBy.DURATION,
    SortBy.TIMESTAMP
];

// Numeric-valued columns are right-aligned (header + cells), matching the
// standard table convention of right-aligning numbers and left-aligning text.
export const NUMERIC_LOG_COLUMNS = new Set<SortBy>([SortBy.SIZE, SortBy.DURATION]);

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

// `log.size` is a formatted string like "512B" / "1.2KB" / "3.4MB" (see
// formatByteSize in logEntryMapper.ts) - a plain parseFloat only reads the
// leading number and ignores the unit, so "1.2MB" sorts as 1.2 against
// "500KB" as 500 (backwards, since 1.2MB is actually the larger value).
export const parseSizeBytes = (size: string): number => {
    const match = /^([\d.]+)\s*(b|kb|mb)?$/i.exec(size.trim());

    if (!match) {
        return 0;
    }

    const [, rawValue, unit] = match;
    const value = Number.parseFloat(rawValue!);

    if (Number.isNaN(value)) {
        return 0;
    }

    if (unit?.toLowerCase() === 'mb') {
        return value * 1024 * 1024;
    }

    if (unit?.toLowerCase() === 'kb') {
        return value * 1024;
    }

    return value;
}

type LogFilterOptions = {
    searchQuery: string;
    selectedUser: string | null;
    startTime: Date;
    endTime: Date;
    minSizeBytes: number | null;
    maxSizeBytes: number | null;
}

// `log.timestamp` is a locale-formatted local time string with no date/timezone
// info (see formatTimestamp in logEntryMapper.ts) — it must never be parsed as UTC.
// `log.startTime` is the only field with real date+timezone information, so a
// missing `startTime` means the log's absolute time genuinely can't be known.
const getLogTimeMs = (log: LogEntry) => {
    if (!log.startTime) {
        return null;
    }

    const date = new Date(log.startTime);

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
    const startTimeMs = startTime.getTime();
    const endTimeMs = endTime.getTime();

    if (Number.isNaN(startTimeMs) || Number.isNaN(endTimeMs)) {
        // The picker's own range is invalid, not the log's data — don't hide logs for it.
        return true;
    }

    const logTimeMs = getLogTimeMs(log);

    if (logTimeMs === null) {
        // Log has no reliable absolute time — exclude it from range filtering
        // rather than always showing it, which previously masked bad timestamps.
        return false;
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

const isWithinSizeRange = (
    log: LogEntry,
    minSizeBytes: number | null,
    maxSizeBytes: number | null
) => {
    if (minSizeBytes === null && maxSizeBytes === null) {
        return true;
    }

    const sizeBytes = parseSizeBytes(log.size);

    if (minSizeBytes !== null && sizeBytes < minSizeBytes) {
        return false;
    }

    if (maxSizeBytes !== null && sizeBytes > maxSizeBytes) {
        return false;
    }

    return true;
}

export const filterLogs = (
    logs: LogEntry[],
    {
        searchQuery,
        selectedUser,
        startTime,
        endTime,
        minSizeBytes,
        maxSizeBytes
    }: LogFilterOptions
) => {
    return logs.filter(log => {
        if (selectedUser && log.user !== selectedUser) {
            return false;
        }

        if (!matchesSearchQuery(log, searchQuery)) {
            return false;
        }

        if (!isWithinSizeRange(log, minSizeBytes, maxSizeBytes)) {
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
            compareValue = parseSizeBytes(a.size) - parseSizeBytes(b.size);
        } else if (sortBy === SortBy.DURATION) {
            compareValue = parseFloat(a.duration) - parseFloat(b.duration);
        } else if (sortBy === SortBy.TIMESTAMP) {
            const timeA = getLogTimeMs(a);
            const timeB = getLogTimeMs(b);

            // Logs without a reliable absolute time sort last regardless of direction.
            if (timeA === null && timeB === null) {
                compareValue = 0;
            } else if (timeA === null) {
                compareValue = sortDirection === SortDirection.ASC ? 1 : -1;
            } else if (timeB === null) {
                compareValue = sortDirection === SortDirection.ASC ? -1 : 1;
            } else {
                compareValue = timeA - timeB;
            }
        } else {
            compareValue = a[sortBy].localeCompare(b[sortBy]);
        }

        return sortDirection === SortDirection.ASC ? compareValue : -compareValue;
    });
}
