import {
    type VirtualItem,
    useWindowVirtualizer
} from "@tanstack/react-virtual";
import { AlertCircle, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import React from "react";
import {
    LOG_ROW_HEIGHT,
    LOG_TABLE_COLUMNS,
    LOG_TABLE_GRID_TEMPLATE_COLUMNS,
    LOG_VIRTUAL_SCROLL_MARGIN,
    sortLogs,
    getNextLogIndex,
    formatLogDuration,
    filterLogs
} from "@/lib/logListConfig";
import { useLiveLogs } from "@/hooks/useLiveLogs";
import { useTableUIStore } from "@/store/tableUIStore";
import { type LogEntry, SortBy, SortDirection } from "@/types/ui";
import { LogFilterBar } from "./LogFilterBar";

type LogGridHeaderProps = {
    sortBy: SortBy;
    sortDirection: SortDirection;
    onSort: (_event: React.MouseEvent<HTMLDivElement>) => void;
}

type LogRowProps = {
    log: LogEntry;
    virtualRow: VirtualItem;
    setRowRef: (_logId: string, _element: HTMLDivElement | null) => void;
    onFocus: (_logId: string) => void;
    onKeyDown: (_event: React.KeyboardEvent<HTMLDivElement>, _index: number) => void;
    onSelect: (_log: LogEntry) => void;
}

type HistoryNotice = {
    tone: 'info' | 'error';
    message: string;
}

const LogGridHeader = React.memo(function LogGridHeader({
    sortBy,
    sortDirection,
    onSort
}: LogGridHeaderProps) {
    return (
        <div
            role="row"
            className="grid border-y border-border py-1 px-8 bg-card sticky top-13 z-10"
            style={{ gridTemplateColumns: LOG_TABLE_GRID_TEMPLATE_COLUMNS }}
        >
            {LOG_TABLE_COLUMNS.map((column) => (
                <div
                    key={column}
                    role="columnheader"
                    data-column={column}
                    onClick={onSort}
                    className="
                        text-sans text-xs font-medium uppercase tracking-wider
                        dark:text-neutral-400 py-1 px-2 cursor-pointer rounded
                        focus-visible:ring-emerald-400/70 focus-visible:outline-none
                        focus-visible:ring-1 focus-visible:ring-inset flex items-center
                        font-sans
                    "
                >
                    {column.charAt(0).toUpperCase() + column.slice(1)}

                    {sortBy === column && (
                        sortDirection === SortDirection.ASC ? (
                            <ArrowUp size={16} className="ml-1 text-emerald-500" />
                        ) : (
                            <ArrowDown size={16} className="ml-1 text-emerald-500" />
                        )
                    )}
                </div>
            ))}
        </div>
    );
});

const LogRow = React.memo(function LogRow({
    log,
    virtualRow,
    setRowRef,
    onFocus,
    onKeyDown,
    onSelect
}: LogRowProps) {
    const isActive = useTableUIStore(state => state.focusedLogId === log.id);
    const isSelected = useTableUIStore(state => state.selectedLog?.id === log.id);
    const readAt = useTableUIStore(state => state.logReadAtById[log.id] ?? log.readAt);

    return (
        <div
            key={log.id}
            role="row"
            ref={(element) => setRowRef(log.id, element)}
            tabIndex={isActive ? 0 : -1}
            aria-rowindex={virtualRow.index + 1}
            aria-selected={isSelected}
            onClick={() => onSelect(log)}
            onFocus={() => onFocus(log.id)}
            onKeyDown={(event) => onKeyDown(event, virtualRow.index)}
            className={`
                absolute left-0 top-0 grid w-full gap-4 border-b border-border py-2 px-8
                scroll-mt-24 scroll-mb-4 cursor-pointer transition-colors font-sans
                hover:bg-muted/60 focus-visible:outline-none
                focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500
                ${isSelected ? 'bg-emerald-500/10' : ''}
            `}
            style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start - LOG_VIRTUAL_SCROLL_MARGIN}px)`,
                gridTemplateColumns: LOG_TABLE_GRID_TEMPLATE_COLUMNS
            }}
        >
            <div role="gridcell" className="relative min-w-0 truncate rounded px-2 py-px text-sm text-primary" title={log.operation}>
                {!readAt && (
                    <span
                        aria-label="Unread log"
                        className="absolute -left-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-emerald-400"
                    />
                )}
                {log.operation}
            </div>
            <div role="gridcell" className="min-w-0 truncate text-sm text-primary" title={log.user}>{log.user}</div>
            <div role="gridcell" className="min-w-0 truncate text-sm text-primary" title={log.app}>{log.app}</div>
            <div role="gridcell" className="min-w-0 truncate font-mono text-sm text-primary/70 dark:text-primary/50" title={log.size}>{log.size}</div>
            <div role="gridcell" className="min-w-0">
                <span
                    className="block w-fit max-w-full truncate rounded bg-muted px-2 py-px font-mono text-sm text-muted-foreground"
                    title={log.duration}
                >
                    {formatLogDuration(log.duration)}
                </span>
            </div>
            <div role="gridcell" className="min-w-0 truncate font-mono text-sm text-muted-foreground" title={log.timestamp}>{log.timestamp}</div>
        </div>
    );
});

const HistoryNoticeToast = React.memo(function HistoryNoticeToast({
    notice,
    isLoading
}: {
    notice: HistoryNotice | null;
    isLoading: boolean;
}) {
    const message = isLoading
        ? 'Loading older logs...'
        : notice?.message;
    const tone = notice?.tone ?? 'info';

    if (!message) {
        return null;
    }

    return (
        <div
            role="status"
            aria-live="polite"
            className={`
                fixed bottom-4 right-4 z-50 flex max-w-xs items-center gap-2 rounded-lg border
                bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur font-sans
                ${tone === 'error'
            ? 'border-destructive/25 text-destructive'
            : 'border-border text-muted-foreground'}
            `}
        >
            {isLoading ? (
                <Loader2 size={14} className="shrink-0 animate-spin text-emerald-500" />
            ) : tone === 'error' ? (
                <AlertCircle size={14} className="shrink-0" />
            ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            )}
            <span className="truncate">{message}</span>
        </div>
    );
});

function LogList() {
    const {
        logs,
        isLoading,
        isLoadingOlderLogs,
        errorMessage,
        loadOlderLogs
    } = useLiveLogs();

    const [historyNotice, setHistoryNotice] = React.useState<HistoryNotice | null>(null);

    const historyNoticeTimeoutRef = React.useRef<number | null>(null);
    const lastOlderLoadAttemptKeyRef = React.useRef<string | null>(null);

    const showHistoryNotice = React.useCallback((
        message: string,
        tone: HistoryNotice['tone'] = 'info'
    ) => {
        if (historyNoticeTimeoutRef.current) {
            window.clearTimeout(historyNoticeTimeoutRef.current);
        }

        setHistoryNotice({
            tone,
            message
        });

        historyNoticeTimeoutRef.current = window.setTimeout(() => {
            setHistoryNotice(null);
            historyNoticeTimeoutRef.current = null;
        }, 2600);
    }, []);

    // Store state
    const sortBy: SortBy = useTableUIStore(state => state.sortBy);
    const sortDirection: SortDirection = useTableUIStore(state => state.sortDirection);
    const searchQuery = useTableUIStore(state => state.searchQuery);
    const selectedUser = useTableUIStore(state => state.selectedUser);
    const startTime = useTableUIStore(state => state.startTime);
    const endTime = useTableUIStore(state => state.endTime);
    const isLogPanelOpen = useTableUIStore(state => state.isLogPanelOpen);

    // Store actions
    const setSorting = useTableUIStore(state => state.setSorting);
    const setFocusedLogId = useTableUIStore(state => state.setFocusedLogId);
    const setLogPanelOpen = useTableUIStore(state => state.setLogPanelOpen);
    const selectLog = useTableUIStore(state => state.selectLog);

    // Refs
    const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const pendingFocusLogIdRef = React.useRef<string | null>(null);
    const wasLogPanelOpenRef = React.useRef(isLogPanelOpen);

    // Derived list state
    const filteredLogs = React.useMemo(() => {
        return filterLogs(logs, {
            searchQuery,
            selectedUser,
            startTime,
            endTime
        });
    }, [endTime, logs, searchQuery, selectedUser, startTime]);

    const sortedLogs = React.useMemo(() => {
        return sortLogs(filteredLogs, sortBy, sortDirection);
    }, [filteredLogs, sortBy, sortDirection]);

    const logIndexById = React.useMemo(() => {
        return new Map(sortedLogs.map((log, index) => [log.id, index]));
    }, [sortedLogs]);

    // Virtualization
    const rowVirtualizer = useWindowVirtualizer({
        count: sortedLogs.length,
        estimateSize: () => LOG_ROW_HEIGHT,
        overscan: 12,
        scrollMargin: LOG_VIRTUAL_SCROLL_MARGIN
    });

    const virtualRows = rowVirtualizer.getVirtualItems();

    // Focus helpers
    const setRowRef = React.useCallback((logId: string, element: HTMLDivElement | null) => {
        rowRefs.current[logId] = element;
    }, []);

    const focusMountedRow = React.useCallback((logId: string) => {
        requestAnimationFrame(() => {
            const rowElement = rowRefs.current[logId];

            if (!rowElement) {
                return;
            }

            rowElement.focus({ preventScroll: true });
            rowElement.scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
            });
        });
    }, []);

    const focusLogAtIndex = React.useCallback((index: number, shouldUpdateOpenPanel: boolean) => {
        const log = sortedLogs[index];

        if (!log) {
            return;
        }

        setFocusedLogId(log.id);
        pendingFocusLogIdRef.current = log.id;

        if (shouldUpdateOpenPanel && isLogPanelOpen) {
            selectLog(log);
        }

        rowVirtualizer.scrollToIndex(index, { align: 'auto' });
        focusMountedRow(log.id);
    }, [
        focusMountedRow,
        isLogPanelOpen,
        rowVirtualizer,
        selectLog,
        setFocusedLogId,
        sortedLogs
    ]);

    // Effects
    React.useEffect(() => {
        const focusedLogId = useTableUIStore.getState().focusedLogId;
        const firstLogId = sortedLogs[0]?.id ?? null;

        if (!firstLogId) {
            return;
        }

        if (!focusedLogId || !logIndexById.has(focusedLogId)) {
            setFocusedLogId(firstLogId);
        }
    }, [logIndexById, setFocusedLogId, sortedLogs]);

    React.useEffect(() => {
        const pendingFocusLogId = pendingFocusLogIdRef.current;

        if (!pendingFocusLogId || !rowRefs.current[pendingFocusLogId]) {
            return;
        }

        pendingFocusLogIdRef.current = null;
        focusMountedRow(pendingFocusLogId);
    }, [focusMountedRow, virtualRows]);

    React.useEffect(() => {
        if (isLoading || isLoadingOlderLogs || sortedLogs.length === 0) {
            return;
        }

        if (sortBy !== SortBy.TIMESTAMP || sortDirection !== SortDirection.DESC) {
            return;
        }

        const lastVirtualRow = virtualRows
            .filter(virtualRow => virtualRow.index < sortedLogs.length)
            .at(-1);

        if (!lastVirtualRow) {
            return;
        }

        if (lastVirtualRow.index >= sortedLogs.length - 8) {
            const oldestVisibleLog = sortedLogs.at(-1);

            if (!oldestVisibleLog?.startTime) {
                return;
            }

            const attemptKey = [
                oldestVisibleLog.id,
                oldestVisibleLog.startTime,
                searchQuery.trim(),
                selectedUser ?? '',
                startTime.getTime(),
                endTime.getTime()
            ].join(':');

            if (lastOlderLoadAttemptKeyRef.current === attemptKey) {
                return;
            }

            lastOlderLoadAttemptKeyRef.current = attemptKey;

            void loadOlderLogs({
                beforeStartTime: oldestVisibleLog.startTime,
                afterStartTime: startTime.toISOString()
            }).then(result => {
                if (result.status === 'empty') {
                    showHistoryNotice('No older logs found.');
                }

                if (result.status === 'failed') {
                    showHistoryNotice(result.message, 'error');
                }
            });
        }
    }, [
        endTime,
        isLoading,
        isLoadingOlderLogs,
        loadOlderLogs,
        searchQuery,
        selectedUser,
        showHistoryNotice,
        sortBy,
        sortDirection,
        startTime,
        sortedLogs,
        sortedLogs.length,
        virtualRows
    ]);

    React.useEffect(() => {
        return () => {
            if (historyNoticeTimeoutRef.current) {
                window.clearTimeout(historyNoticeTimeoutRef.current);
            }
        };
    }, []);

    React.useEffect(() => {
        const wasLogPanelOpen = wasLogPanelOpenRef.current;

        wasLogPanelOpenRef.current = isLogPanelOpen;

        const selectedLogId = useTableUIStore.getState().selectedLog?.id ?? null;

        if (!wasLogPanelOpen || isLogPanelOpen || !selectedLogId) {
            return;
        }

        const selectedLogIndex = logIndexById.get(selectedLogId) ?? -1;

        if (selectedLogIndex >= 0) {
            focusLogAtIndex(selectedLogIndex, false);
        }
    }, [focusLogAtIndex, isLogPanelOpen, logIndexById]);

    // Event handlers
    const handleSort = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const newSortBy = event.currentTarget.getAttribute('data-column') as SortBy;
        const newSortDirection = sortBy === newSortBy
            ? (sortDirection === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC)
            : SortDirection.ASC;

        setSorting(newSortBy, newSortDirection);
    }, [setSorting, sortBy, sortDirection]);

    const handleRowFocus = React.useCallback((logId: string) => {
        setFocusedLogId(logId);
    }, [setFocusedLogId]);

    const handleRowSelect = React.useCallback((log: LogEntry) => {
        setFocusedLogId(log.id);
        selectLog(log);
        focusMountedRow(log.id);
    }, [focusMountedRow, selectLog, setFocusedLogId]);

    const handleRowKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
        if (event.key === 'Enter' || event.key === ' ') {
            const log = sortedLogs[index];

            event.preventDefault();

            if (log) {
                handleRowSelect(log);
            }

            return;
        }

        if (event.key === 'Escape' && isLogPanelOpen) {
            event.preventDefault();
            setLogPanelOpen(false);
            return;
        }

        const nextIndex = getNextLogIndex({
            currentIndex: index,
            key: event.key,
            totalLogs: sortedLogs.length
        });

        if (nextIndex === index) {
            return;
        }

        event.preventDefault();
        focusLogAtIndex(nextIndex, true);
    }, [focusLogAtIndex, handleRowSelect, isLogPanelOpen, setLogPanelOpen, sortedLogs]);

    // Render
    return (
        <section className="flex-1">
            <LogFilterBar logs={logs} filteredLogCount={filteredLogs.length} />

            <div
                role="grid"
                aria-rowcount={sortedLogs.length}
                className="w-full scroll-p-4"
            >
                <LogGridHeader
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                />

                <div
                    role="rowgroup"
                    className="relative block"
                    style={{
                        height: isLoading || errorMessage
                            ? `${LOG_ROW_HEIGHT * 3}px`
                            : `${rowVirtualizer.getTotalSize()}px`
                    }}
                >
                    {isLoading && (
                        <div className="px-8 py-6 text-sm text-muted-foreground font-sans">
                            Loading logs from local cache...
                        </div>
                    )}

                    {errorMessage && (
                        <div className="px-8 py-6 text-sm text-destructive">
                            {errorMessage}
                        </div>
                    )}

                    {!isLoading && !errorMessage && logs.length > 0 && sortedLogs.length === 0 && (
                        <div className="px-8 py-6 text-sm text-muted-foreground font-sans">
                            No logs match the current filters.
                        </div>
                    )}

                    {virtualRows.map((virtualRow) => {
                        const log = sortedLogs[virtualRow.index];

                        if (!log) {
                            return null;
                        }

                        return (
                            <LogRow
                                key={log.id}
                                log={log}
                                virtualRow={virtualRow}
                                setRowRef={setRowRef}
                                onFocus={handleRowFocus}
                                onKeyDown={handleRowKeyDown}
                                onSelect={handleRowSelect}
                            />
                        );
                    })}
                </div>
            </div>

            <HistoryNoticeToast
                notice={historyNotice}
                isLoading={isLoadingOlderLogs}
            />
        </section>
    );
}

export { LogList };
