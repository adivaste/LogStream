import {
    type VirtualItem,
    useVirtualizer
} from "@tanstack/react-virtual";
import { AlertCircle, ArrowDown, ArrowUp, SearchX } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
    LOG_ROW_HEIGHT,
    LOG_TABLE_COLUMNS,
    LOG_TABLE_GRID_TEMPLATE_COLUMNS,
    LOG_VIRTUAL_SCROLL_MARGIN,
    NUMERIC_LOG_COLUMNS,
    sortLogs,
    getNextLogIndex,
    formatLogDuration,
    filterLogs
} from "@/lib/logListConfig";
import type { UseLiveLogsResult } from "@/hooks/useLiveLogs";
import { useElementScrollEdges } from "@/hooks/useScrollEdgeFade";
import { useTableUIStore } from "@/store/tableUIStore";
import { type LogEntry, SortBy, SortDirection } from "@/types/ui";
import { LogFilterBar } from "./LogFilterBar";

// Filled enough to cover a typical viewport so the loading state doesn't
// visibly run out of rows before real data replaces it. Column widths cycle
// through a few variants per field instead of one fixed size each, so the
// placeholder reads as "rows of varying real text" rather than a uniform
// grid of identical bars.
const SKELETON_ROW_COUNT = 16;
const SKELETON_OPERATION_WIDTHS = ['78%', '55%', '88%', '46%', '65%', '70%'];
const SKELETON_USER_WIDTHS = ['48%', '35%', '58%', '42%'];
const SKELETON_APP_WIDTHS = ['40%', '58%', '32%'];

const LogListSkeletonRow = React.memo(function LogListSkeletonRow({ index }: { index: number }) {
    return (
        <div
            className="grid items-center gap-4 border-b border-border px-8"
            style={{ height: LOG_ROW_HEIGHT, gridTemplateColumns: LOG_TABLE_GRID_TEMPLATE_COLUMNS }}
        >
            <Skeleton className="h-3.5" style={{ width: SKELETON_OPERATION_WIDTHS[index % SKELETON_OPERATION_WIDTHS.length] }} />
            <Skeleton className="h-3.5" style={{ width: SKELETON_USER_WIDTHS[index % SKELETON_USER_WIDTHS.length] }} />
            <Skeleton className="h-3.5" style={{ width: SKELETON_APP_WIDTHS[index % SKELETON_APP_WIDTHS.length] }} />
            <Skeleton className="h-3.5 w-12 justify-self-end" />
            <Skeleton className="h-5 w-14 justify-self-end rounded" />
            <Skeleton className="h-3.5 w-20" />
        </div>
    );
});

type LogGridHeaderProps = {
    sortBy: SortBy;
    sortDirection: SortDirection;
    onSort: (_event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;
    showScrolledShadow: boolean;
}

type LogRowProps = {
    log: LogEntry;
    virtualRow: VirtualItem;
    setRowRef: (_logId: string, _element: HTMLDivElement | null) => void;
    onFocus: (_logId: string) => void;
    onKeyDown: (_event: React.KeyboardEvent<HTMLDivElement>, _index: number) => void;
    onSelect: (_log: LogEntry) => void;
}

const LogGridHeader = React.memo(function LogGridHeader({
    sortBy,
    sortDirection,
    onSort,
    showScrolledShadow
}: LogGridHeaderProps) {
    return (
        <div
            role="row"
            className="relative grid gap-4 border-y border-border py-1 px-8 bg-card sticky top-13 z-10"
            style={{ gridTemplateColumns: LOG_TABLE_GRID_TEMPLATE_COLUMNS }}
        >
            {/* The header is opaque, so this isn't for revealing cut-off text (see
                LogBodyViewer's fade) - it's a drop-shadow cue that rows are now
                scrolled behind the sticky header, shown only once you've scrolled. */}
            <div
                aria-hidden="true"
                className={`
                    pointer-events-none absolute inset-x-0 -bottom-4 h-4
                    bg-gradient-to-b from-black/10 dark:from-black/40 to-transparent
                    transition-opacity duration-150
                    ${showScrolledShadow ? 'opacity-100' : 'opacity-0'}
                `}
            />

            {LOG_TABLE_COLUMNS.map((column) => (
                <div
                    key={column}
                    role="columnheader"
                    aria-sort={
                        sortBy !== column
                            ? 'none'
                            : sortDirection === SortDirection.ASC ? 'ascending' : 'descending'
                    }
                    data-column={column}
                    tabIndex={0}
                    onClick={onSort}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSort(event);
                        }
                    }}
                    className={`
                        text-sans text-xs font-medium uppercase tracking-wider
                        dark:text-neutral-400 py-1 px-2 cursor-pointer rounded
                        focus-visible:ring-emerald-400/70 focus-visible:outline-none
                        focus-visible:ring-1 focus-visible:ring-inset flex items-center
                        font-sans
                        ${NUMERIC_LOG_COLUMNS.has(column) ? 'justify-end text-right' : ''}
                    `}
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
            {!readAt && (
                <span
                    aria-label="Unread log"
                    className="absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full bg-emerald-400"
                />
            )}
            <div role="gridcell" className="min-w-0 truncate rounded px-2 py-px text-sm text-primary" title={log.operation}>
                {log.operation}
            </div>
            <div role="gridcell" className="min-w-0 truncate text-sm text-primary" title={log.user}>{log.user}</div>
            <div role="gridcell" className="min-w-0 truncate text-sm text-primary" title={log.app}>{log.app}</div>
            <div role="gridcell" className="min-w-0 truncate text-right font-mono text-sm text-primary/70 dark:text-primary/50" title={log.size}>{log.size}</div>
            <div role="gridcell" className="flex min-w-0 justify-end">
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

type LogListProps = UseLiveLogsResult & {
    // The main content area (Insights + LogList) shares one Base UI ScrollArea
    // owned by App.tsx, so its virtualizer scrolls that element instead of
    // the window - see the layout notes near the bottom fade below.
    scrollElementRef: React.RefObject<HTMLDivElement | null>;
}

function LogList({
    logs,
    isLoading,
    isLoadingOlderLogs,
    errorMessage,
    loadOlderLogs,
    scrollElementRef
}: LogListProps) {

    const lastOlderLoadAttemptKeyRef = React.useRef<string | null>(null);

    // Store state
    const sortBy: SortBy = useTableUIStore(state => state.sortBy);
    const sortDirection: SortDirection = useTableUIStore(state => state.sortDirection);
    const searchQuery = useTableUIStore(state => state.searchQuery);
    // Filtering/sorting the full log array is synchronous work that scales
    // with however much history is loaded - deferring it (same pattern as
    // TraceFlagPopover's user search) keeps each keystroke in the search box
    // responsive instead of blocking on a full re-filter every time.
    const deferredSearchQuery = React.useDeferredValue(searchQuery);
    const selectedUser = useTableUIStore(state => state.selectedUser);
    const startTime = useTableUIStore(state => state.startTime);
    const endTime = useTableUIStore(state => state.endTime);
    const minSizeBytes = useTableUIStore(state => state.minSizeBytes);
    const maxSizeBytes = useTableUIStore(state => state.maxSizeBytes);
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
            searchQuery: deferredSearchQuery,
            selectedUser,
            startTime,
            endTime,
            minSizeBytes,
            maxSizeBytes
        });
    }, [deferredSearchQuery, endTime, logs, maxSizeBytes, minSizeBytes, selectedUser, startTime]);

    const sortedLogs = React.useMemo(() => {
        return sortLogs(filteredLogs, sortBy, sortDirection);
    }, [filteredLogs, sortBy, sortDirection]);

    const logIndexById = React.useMemo(() => {
        return new Map(sortedLogs.map((log, index) => [log.id, index]));
    }, [sortedLogs]);

    const scrollEdges = useElementScrollEdges(scrollElementRef);

    // Virtualization
    const rowVirtualizer = useVirtualizer({
        count: sortedLogs.length,
        getScrollElement: () => scrollElementRef.current,
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

        const lastVirtualRow = virtualRows
            .filter(virtualRow => virtualRow.index < sortedLogs.length)
            .at(-1);

        if (!lastVirtualRow) {
            return;
        }

        if (lastVirtualRow.index < sortedLogs.length - 8) {
            return;
        }

        if (sortBy !== SortBy.TIMESTAMP || sortDirection !== SortDirection.DESC) {
            // Loading older history only makes sense in newest-first timestamp order —
            // "oldest visible row" isn't meaningful under any other sort. Tell the user
            // instead of silently doing nothing when they hit the bottom.
            const attemptKey = `unsupported-sort:${sortBy}:${sortDirection}`;

            if (lastOlderLoadAttemptKeyRef.current !== attemptKey) {
                lastOlderLoadAttemptKeyRef.current = attemptKey;
                toast.info('Sort by Timestamp (newest first) to load older logs.', {
                    id: 'unsupported-sort-history-load'
                });
            }

            return;
        }

        {
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

            const toastId = toast.loading('Loading older logs...');

            void loadOlderLogs({
                beforeStartTime: oldestVisibleLog.startTime,
                afterStartTime: startTime.toISOString()
            }).then(result => {
                if (result.status === 'loaded') {
                    toast.success(`Loaded ${result.count} older log${result.count === 1 ? '' : 's'}.`, {
                        id: toastId
                    });
                } else if (result.status === 'empty') {
                    toast.info('No older logs found.', { id: toastId });
                } else if (result.status === 'failed') {
                    toast.error(result.message, { id: toastId });
                } else {
                    toast.dismiss(toastId);
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
        sortBy,
        sortDirection,
        startTime,
        sortedLogs,
        sortedLogs.length,
        virtualRows
    ]);

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
                    showScrolledShadow={!scrollEdges.atTop}
                />

                {/* A load failure while cached logs already exist (session expired
                    mid-session, background poll failed, etc) must not hide those
                    logs - showing the last-known logs during an outage is a
                    deliberate feature, not a fallback to apologize for. So the
                    error only takes over the full row area below when there is
                    nothing cached to fall back to; otherwise it stays silent
                    here and the rows just keep rendering as-is. */}

                <div
                    role="rowgroup"
                    className="relative block"
                    style={{
                        height: isLoading
                            ? `${SKELETON_ROW_COUNT * LOG_ROW_HEIGHT}px`
                            : (errorMessage && sortedLogs.length === 0) || (logs.length > 0 && sortedLogs.length === 0)
                                ? '240px'
                                : `${rowVirtualizer.getTotalSize()}px`
                    }}
                >
                    {isLoading && (
                        <div aria-label="Loading logs" className="animate-in fade-in-0 duration-300">
                            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                                <LogListSkeletonRow key={index} index={index} />
                            ))}
                        </div>
                    )}

                    {errorMessage && sortedLogs.length === 0 && (
                        <EmptyState
                            className="absolute inset-0"
                            icon={AlertCircle}
                            tone="destructive"
                            title="Couldn't load logs"
                            description={errorMessage}
                        />
                    )}

                    {!isLoading && !errorMessage && logs.length > 0 && sortedLogs.length === 0 && (
                        <EmptyState
                            className="absolute inset-0"
                            icon={SearchX}
                            title="No logs match your filters"
                            description="Try adjusting the search, user, time range, or size filters."
                        />
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

            {/* Sticky within the shared scroll viewport (see App.tsx) rather than
                fixed to the browser viewport - shown only while there are rows
                cut off below the fold. */}
            <div
                aria-hidden="true"
                className={`
                    pointer-events-none sticky bottom-0 z-10 -mt-6 h-6
                    bg-gradient-to-t from-background to-transparent
                    transition-opacity duration-150
                    ${scrollEdges.atBottom ? 'opacity-0' : 'opacity-100'}
                `}
            />
        </section>
    );
}

export { LogList };
