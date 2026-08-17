import { useVirtualizer } from "@tanstack/react-virtual";
import {
    AlertTriangle,
    Bug,
    Check,
    ChevronDown,
    ChevronUp,
    Code2,
    Copy,
    Download,
    Gauge,
    MoreHorizontal,
    Search,
    WrapText,
    X
} from "lucide-react";
import React from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollAreaScrollbar, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { useElementScrollEdges } from "@/hooks/useScrollEdgeFade";
import { getErrorLineNumbers, parseLimitUsage } from "@/lib/logBodyMeta";
import { getNextLogIndex } from "@/lib/logListConfig";

const LOG_LINE_HEIGHT = 24;
const LOG_VIEWER_OVERSCAN = 24;

// Layout of a row: a fixed 4.5rem line-number column, then the content
// column with 0.75rem (px-3) padding on both sides.
const LOG_LINE_NUMBER_COLUMN_PX = 72;
const LOG_CONTENT_PADDING_PX = 24;
const CHAR_WIDTH_PROBE_LENGTH = 80;

const APEX_TOKEN_PATTERN = /(FATAL_ERROR|EXCEPTION_THROWN|System\.[A-Za-z]+Exception|SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|DML_BEGIN|DML_END|CUMULATIVE_LIMIT_USAGE|LIMIT_USAGE_FOR_NS|USER_DEBUG|METHOD_ENTRY|METHOD_EXIT)/g;
const APEX_TOKEN_EXACT_PATTERN = /^(FATAL_ERROR|EXCEPTION_THROWN|System\.[A-Za-z]+Exception|SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|DML_BEGIN|DML_END|CUMULATIVE_LIMIT_USAGE|LIMIT_USAGE_FOR_NS|USER_DEBUG|METHOD_ENTRY|METHOD_EXIT)$/;
const EXECUTABLE_LINE_PATTERN = /\|(METHOD_ENTRY|METHOD_EXIT|SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|DML_BEGIN|DML_END|USER_DEBUG|EXCEPTION_THROWN|FATAL_ERROR)\|/;

type LogBodyViewerProps = {
    body: string;
    fileName: string;
    // Source line indexes (0-based, stable across wrap toggling and view
    // filtering - never the virtualizer's own row index, which shifts
    // whenever the debug/executable filter changes which rows exist at all).
    pinnedLines: number[];
    onTogglePinnedLine: (_sourceLineIndex: number) => void;
    onClearPinnedLines: () => void;
}

type LogViewFilter = 'all' | 'debug' | 'executable';

const getApexTokenClassName = (token: string) => {
    if (
        token === 'FATAL_ERROR'
        || token === 'EXCEPTION_THROWN'
        || token.startsWith('System.')
    ) {
        return 'text-red-700 dark:text-red-400';
    }

    if (token.startsWith('SOQL_')) {
        return 'text-sky-700 dark:text-sky-400';
    }

    if (token.startsWith('DML_')) {
        return 'text-amber-700 dark:text-amber-400';
    }

    if (token.includes('LIMIT')) {
        return 'text-yellow-700 dark:text-yellow-300';
    }

    if (token === 'USER_DEBUG') {
        return 'text-emerald-700 dark:text-emerald-400';
    }

    return 'text-violet-700 dark:text-violet-300';
}

const splitBySearchTerm = (text: string, searchQuery: string) => {
    if (!searchQuery) {
        return [text];
    }

    const chunks: string[] = [];
    let cursor = 0;
    const lowerText = text.toLowerCase();
    const lowerSearchQuery = searchQuery.toLowerCase();
    let matchIndex = lowerText.indexOf(lowerSearchQuery);

    while (matchIndex >= 0) {
        if (matchIndex > cursor) {
            chunks.push(text.slice(cursor, matchIndex));
        }

        chunks.push(text.slice(matchIndex, matchIndex + searchQuery.length));
        cursor = matchIndex + searchQuery.length;
        matchIndex = lowerText.indexOf(lowerSearchQuery, cursor);
    }

    if (cursor < text.length) {
        chunks.push(text.slice(cursor));
    }

    return chunks;
}

const renderHighlightedLine = (line: string, searchQuery: string) => {
    const apexParts = line.split(APEX_TOKEN_PATTERN);

    return apexParts.map((part, partIndex) => {
        const tokenClassName = APEX_TOKEN_EXACT_PATTERN.test(part)
            ? getApexTokenClassName(part)
            : '';

        return splitBySearchTerm(part, searchQuery).map((chunk, chunkIndex) => {
            const isSearchMatch = Boolean(searchQuery)
                && chunk.toLowerCase() === searchQuery.toLowerCase();

            return (
                <span
                    key={`${partIndex}-${chunkIndex}`}
                    className={isSearchMatch ? 'bg-emerald-300/80 text-emerald-950 dark:bg-emerald-500/60 dark:text-emerald-100' : tokenClassName}
                >
                    {chunk}
                </span>
            );
        });
    });
}

const isDebugLine = (line: string) => {
    return line.includes('|USER_DEBUG|');
}

const isExecutableLine = (line: string) => {
    return EXECUTABLE_LINE_PATTERN.test(line);
}

function LogBodyViewer({ body, fileName, pinnedLines, onTogglePinnedLine, onClearPinnedLines }: LogBodyViewerProps) {
    const scrollParentRef = React.useRef<HTMLDivElement | null>(null);
    const charWidthProbeRef = React.useRef<HTMLSpanElement | null>(null);
    const copyFeedbackTimeoutRef = React.useRef<number | null>(null);
    const downloadFeedbackTimeoutRef = React.useRef<number | null>(null);
    // TanStack Virtual skips remeasuring rows while the user is actively
    // scrolling (a deliberate perf trade-off), so a newly-revealed wrapped
    // row keeps using its *initial estimate* until scrolling settles. If
    // that estimate is way off (a flat 24px vs. a line that actually wraps
    // into 6 visual lines), the row visibly overlaps the one below it until
    // it "catches up". The fix is to make the estimate itself accurate:
    // measure the monospace character width once, track the available
    // content width, and estimate each wrapped row's height from its exact
    // character count - close enough that there's nothing visible to correct.
    const charWidthPxRef = React.useRef(LOG_LINE_HEIGHT * 0.42);
    const contentWidthPxRef = React.useRef(0);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);
    const [viewFilter, setViewFilter] = React.useState<LogViewFilter>('all');
    const [isWrapEnabled, setIsWrapEnabled] = React.useState(false);
    const [isCopyFeedbackVisible, setIsCopyFeedbackVisible] = React.useState(false);
    const [isDownloadFeedbackVisible, setIsDownloadFeedbackVisible] = React.useState(false);
    const [activePinIndex, setActivePinIndex] = React.useState(-1);
    const [activeErrorIndex, setActiveErrorIndex] = React.useState(-1);
    const [isLimitSummaryOpen, setIsLimitSummaryOpen] = React.useState(false);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);
    // Set when a pinned/error line is hidden by the current debug/executable
    // filter - navigating to it has to lift the filter first, then wait for
    // the next render (when `visibleLineIndexes` reflects "all") before it
    // has a real virtual row to scroll to. Shared by both features since only
    // one navigation can ever be in flight before its own effect clears it.
    const pendingScrollRef = React.useRef<number | null>(null);
    // Roving-tabindex keyboard navigation (same model LogList's rows use):
    // exactly one row is ever a real tab stop, arrows move it instead of the
    // browser's own Tab order, so a keyboard user can enter the log body,
    // walk it line by line, and use native Shift+arrow/Ctrl+A text selection
    // once a line has real DOM focus - no custom caret or selection model
    // needed for that part, the browser already does it once focus lands.
    const [focusedSourceLineIndex, setFocusedSourceLineIndex] = React.useState<number | null>(null);
    const rowRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
    const pendingFocusSourceIndexRef = React.useRef<number | null>(null);
    const scrollEdges = useElementScrollEdges(scrollParentRef);

    const lines = React.useMemo(() => {
        // Log bodies almost always end with a trailing newline, which
        // `.split` turns into one extra empty "line" at the end - strip a
        // single trailing newline first so that phantom blank line doesn't
        // show up (genuine blank lines elsewhere in the body are untouched).
        return body.replace(/\r?\n$/, '').split(/\r?\n/);
    }, [body]);

    const visibleLineIndexes = React.useMemo(() => {
        if (viewFilter === 'all') {
            return null;
        }

        const lineFilter = viewFilter === 'debug' ? isDebugLine : isExecutableLine;
        const indexes: number[] = [];

        lines.forEach((line, index) => {
            if (lineFilter(line)) {
                indexes.push(index);
            }
        });

        return indexes;
    }, [lines, viewFilter]);

    const pinnedLineSet = React.useMemo(() => new Set(pinnedLines), [pinnedLines]);
    const sortedPinnedLines = React.useMemo(() => [...pinnedLines].sort((a, b) => a - b), [pinnedLines]);

    // `getErrorLineNumbers` returns 1-based line numbers over the same line
    // split `lines` above uses (trailing-newline handling doesn't change the
    // numbering of any line before it), so -1 lands exactly on source index.
    const errorSourceLineIndexes = React.useMemo(
        () => getErrorLineNumbers(body).map(lineNumber => lineNumber - 1),
        [body]
    );
    const errorLineSet = React.useMemo(() => new Set(errorSourceLineIndexes), [errorSourceLineIndexes]);

    const limitUsageMetrics = React.useMemo(() => parseLimitUsage(body), [body]);

    // O(1) source-index -> visible-index lookups for pin navigation, instead
    // of an indexOf scan per jump - only built while a filter is actually
    // narrowing the view; `visibleLineIndexes` is null under 'all'.
    const visibleIndexBySourceIndex = React.useMemo(() => {
        if (!visibleLineIndexes) {
            return null;
        }

        const map = new Map<number, number>();
        visibleLineIndexes.forEach((sourceIndex, visibleIndex) => map.set(sourceIndex, visibleIndex));

        return map;
    }, [visibleLineIndexes]);

    const visibleLineCount = visibleLineIndexes?.length ?? lines.length;

    const getSourceLineIndex = React.useCallback((visibleLineIndex: number) => {
        return visibleLineIndexes?.[visibleLineIndex] ?? visibleLineIndex;
    }, [visibleLineIndexes]);

    const trimmedSearchQuery = searchQuery.trim();
    const deferredSearchQuery = React.useDeferredValue(trimmedSearchQuery);

    const matchingLineIndexes = React.useMemo(() => {
        if (!deferredSearchQuery) {
            return [];
        }

        const lowerSearchQuery = deferredSearchQuery.toLowerCase();
        const indexes: number[] = [];

        for (let visibleIndex = 0; visibleIndex < visibleLineCount; visibleIndex += 1) {
            const sourceLineIndex = getSourceLineIndex(visibleIndex);
            const line = lines[sourceLineIndex];

            if (!line) {
                continue;
            }

            if (line.toLowerCase().includes(lowerSearchQuery)) {
                indexes.push(visibleIndex);
            }
        }

        return indexes;
    }, [deferredSearchQuery, getSourceLineIndex, lines, visibleLineCount]);

    const lineVirtualizer = useVirtualizer({
        count: visibleLineCount,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: (index) => {
            if (!isWrapEnabled) {
                return LOG_LINE_HEIGHT;
            }

            const availableWidthPx = contentWidthPxRef.current - LOG_LINE_NUMBER_COLUMN_PX - LOG_CONTENT_PADDING_PX;
            const charsPerLine = Math.max(1, Math.floor(availableWidthPx / charWidthPxRef.current));
            const line = lines[getSourceLineIndex(index)] ?? '';
            const wrappedLineCount = Math.max(1, Math.ceil(line.length / charsPerLine));

            return wrappedLineCount * LOG_LINE_HEIGHT;
        },
        overscan: LOG_VIEWER_OVERSCAN
    });

    const virtualLines = lineVirtualizer.getVirtualItems();

    // Measure the monospace character's advance width once - it's uniform
    // for every character, which is what makes an accurate char-count-based
    // height estimate possible at all.
    React.useLayoutEffect(() => {
        const probe = charWidthProbeRef.current;

        if (!probe) {
            return;
        }

        const probeWidth = probe.getBoundingClientRect().width;

        if (probeWidth > 0) {
            charWidthPxRef.current = probeWidth / CHAR_WIDTH_PROBE_LENGTH;
        }
    }, []);

    // Wrapped rows have variable height (react-virtual measures them via
    // measureElement below), so any previously cached height is invalidated
    // the moment wrap is toggled or the panel is resized - the number of
    // visual lines a row wraps into depends on the container width. The
    // content width must be set (synchronously, in this same effect) *before*
    // calling measure() - otherwise estimateSize briefly reads a stale/zero
    // width and every row estimates as 1 char per line.
    React.useEffect(() => {
        const scrollElement = scrollParentRef.current;

        if (!isWrapEnabled || !scrollElement) {
            lineVirtualizer.measure();
            return;
        }

        contentWidthPxRef.current = scrollElement.clientWidth;
        lineVirtualizer.measure();

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const resizeObserver = new ResizeObserver((entries) => {
            const nextWidth = entries[0]?.contentRect.width;

            if (nextWidth) {
                contentWidthPxRef.current = nextWidth;
            }

            lineVirtualizer.measure();
        });

        resizeObserver.observe(scrollElement);

        return () => {
            resizeObserver.disconnect();
        };
    }, [isWrapEnabled, lineVirtualizer]);

    const activeMatchLineIndex = matchingLineIndexes[activeMatchIndex] ?? -1;

    React.useEffect(() => {
        setActiveMatchIndex(-1);
        lineVirtualizer.scrollToIndex(0);
    }, [deferredSearchQuery, lineVirtualizer, viewFilter]);

    React.useEffect(() => {
        if (matchingLineIndexes.length === 0) {
            setActiveMatchIndex(-1);
            return;
        }

        if (activeMatchIndex >= matchingLineIndexes.length) {
            setActiveMatchIndex(matchingLineIndexes.length - 1);
        }
    }, [activeMatchIndex, matchingLineIndexes.length]);

    React.useEffect(() => {
        return () => {
            if (copyFeedbackTimeoutRef.current) {
                window.clearTimeout(copyFeedbackTimeoutRef.current);
            }

            if (downloadFeedbackTimeoutRef.current) {
                window.clearTimeout(downloadFeedbackTimeoutRef.current);
            }
        };
    }, []);

    const showCopyFeedback = React.useCallback(() => {
        if (copyFeedbackTimeoutRef.current) {
            window.clearTimeout(copyFeedbackTimeoutRef.current);
        }

        setIsCopyFeedbackVisible(true);
        copyFeedbackTimeoutRef.current = window.setTimeout(() => {
            setIsCopyFeedbackVisible(false);
        }, 1200);
    }, []);

    const showDownloadFeedback = React.useCallback(() => {
        if (downloadFeedbackTimeoutRef.current) {
            window.clearTimeout(downloadFeedbackTimeoutRef.current);
        }

        setIsDownloadFeedbackVisible(true);
        downloadFeedbackTimeoutRef.current = window.setTimeout(() => {
            setIsDownloadFeedbackVisible(false);
        }, 1200);
    }, []);

    const moveToMatch = React.useCallback((direction: 1 | -1) => {
        if (matchingLineIndexes.length === 0) {
            return;
        }

        const nextMatchIndex = activeMatchIndex < 0
            ? (direction === 1 ? 0 : matchingLineIndexes.length - 1)
            : (
                activeMatchIndex
                + direction
                + matchingLineIndexes.length
            ) % matchingLineIndexes.length;

        setActiveMatchIndex(nextMatchIndex);
        const nextLineIndex = matchingLineIndexes[nextMatchIndex];

        if (nextLineIndex === undefined) {
            return;
        }

        lineVirtualizer.scrollToIndex(nextLineIndex, {
            align: 'center'
        });
    }, [activeMatchIndex, lineVirtualizer, matchingLineIndexes]);

    const handleSearchKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        moveToMatch(event.shiftKey ? -1 : 1);
    }, [moveToMatch]);

    const scrollToSourceIndex = React.useCallback((sourceIndex: number) => {
        if (!visibleIndexBySourceIndex) {
            // No filter active - source index and visible index are the same.
            lineVirtualizer.scrollToIndex(sourceIndex, { align: 'center' });
            return;
        }

        const visibleIndex = visibleIndexBySourceIndex.get(sourceIndex);

        if (visibleIndex !== undefined) {
            lineVirtualizer.scrollToIndex(visibleIndex, { align: 'center' });
            return;
        }

        // The pinned line exists but the current debug/executable filter is
        // hiding it - a pin the user set must stay reachable regardless of
        // whatever view filter happens to be on, so lift it and finish the
        // jump once the next render has a real row for it (see effect below).
        pendingScrollRef.current = sourceIndex;
        setViewFilter('all');
    }, [lineVirtualizer, visibleIndexBySourceIndex]);

    React.useEffect(() => {
        const pendingSourceIndex = pendingScrollRef.current;

        if (pendingSourceIndex === null) {
            return;
        }

        pendingScrollRef.current = null;
        // `visibleLineIndexes` is null now that the filter was just lifted to
        // 'all', so the source index doubles as the visible index directly.
        lineVirtualizer.scrollToIndex(pendingSourceIndex, { align: 'center' });
    }, [lineVirtualizer, visibleLineIndexes]);

    // Clamp like `activeMatchIndex` does for search matches above - if pins
    // were removed out from under the current position, land on the last
    // valid one instead of pointing past the end of the array.
    React.useEffect(() => {
        if (sortedPinnedLines.length === 0) {
            setActivePinIndex(-1);
            return;
        }

        if (activePinIndex >= sortedPinnedLines.length) {
            setActivePinIndex(sortedPinnedLines.length - 1);
        }
    }, [activePinIndex, sortedPinnedLines.length]);

    const moveToPin = React.useCallback((direction: 1 | -1) => {
        if (sortedPinnedLines.length === 0) {
            return;
        }

        const nextPinIndex = activePinIndex < 0
            ? (direction === 1 ? 0 : sortedPinnedLines.length - 1)
            : (
                activePinIndex
                + direction
                + sortedPinnedLines.length
            ) % sortedPinnedLines.length;

        setActivePinIndex(nextPinIndex);
        const sourceIndex = sortedPinnedLines[nextPinIndex];

        if (sourceIndex !== undefined) {
            scrollToSourceIndex(sourceIndex);
        }
    }, [activePinIndex, scrollToSourceIndex, sortedPinnedLines]);

    React.useEffect(() => {
        if (errorSourceLineIndexes.length === 0) {
            setActiveErrorIndex(-1);
            return;
        }

        if (activeErrorIndex >= errorSourceLineIndexes.length) {
            setActiveErrorIndex(errorSourceLineIndexes.length - 1);
        }
    }, [activeErrorIndex, errorSourceLineIndexes.length]);

    const moveToError = React.useCallback((direction: 1 | -1) => {
        if (errorSourceLineIndexes.length === 0) {
            return;
        }

        const nextErrorIndex = activeErrorIndex < 0
            ? (direction === 1 ? 0 : errorSourceLineIndexes.length - 1)
            : (
                activeErrorIndex
                + direction
                + errorSourceLineIndexes.length
            ) % errorSourceLineIndexes.length;

        setActiveErrorIndex(nextErrorIndex);
        const sourceIndex = errorSourceLineIndexes[nextErrorIndex];

        if (sourceIndex !== undefined) {
            scrollToSourceIndex(sourceIndex);
        }
    }, [activeErrorIndex, errorSourceLineIndexes, scrollToSourceIndex]);

    const setRowRef = React.useCallback((sourceIndex: number, element: HTMLDivElement | null) => {
        rowRefs.current[sourceIndex] = element;
    }, []);

    const focusMountedRow = React.useCallback((sourceIndex: number) => {
        requestAnimationFrame(() => {
            const rowElement = rowRefs.current[sourceIndex];

            if (!rowElement) {
                return;
            }

            rowElement.focus({ preventScroll: true });
        });
    }, []);

    // Same two-step pattern LogList's row navigation uses: virtualization
    // means the target row may not exist in the DOM the instant scrollToIndex
    // is called, so the immediate rAF focus attempt above can miss - this
    // effect re-attempts once the row actually renders (watches `virtualLines`,
    // which changes whenever the visible set of mounted rows does).
    React.useEffect(() => {
        const pendingSourceIndex = pendingFocusSourceIndexRef.current;

        if (pendingSourceIndex === null || !rowRefs.current[pendingSourceIndex]) {
            return;
        }

        pendingFocusSourceIndexRef.current = null;
        focusMountedRow(pendingSourceIndex);
    }, [focusMountedRow, virtualLines]);

    const focusLineAtVisibleIndex = React.useCallback((visibleIndex: number) => {
        const sourceIndex = getSourceLineIndex(visibleIndex);

        setFocusedSourceLineIndex(sourceIndex);
        pendingFocusSourceIndexRef.current = sourceIndex;
        lineVirtualizer.scrollToIndex(visibleIndex, { align: 'auto' });
        focusMountedRow(sourceIndex);
    }, [focusMountedRow, getSourceLineIndex, lineVirtualizer]);

    const handleRowKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>, sourceIndex: number) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onTogglePinnedLine(sourceIndex);
            return;
        }

        const currentVisibleIndex = visibleIndexBySourceIndex?.get(sourceIndex) ?? sourceIndex;
        const nextVisibleIndex = getNextLogIndex({
            currentIndex: currentVisibleIndex,
            key: event.key,
            totalLogs: visibleLineCount
        });

        if (nextVisibleIndex === currentVisibleIndex) {
            return;
        }

        event.preventDefault();
        focusLineAtVisibleIndex(nextVisibleIndex);
    }, [focusLineAtVisibleIndex, onTogglePinnedLine, visibleIndexBySourceIndex, visibleLineCount]);

    const handleRowFocus = React.useCallback((sourceIndex: number) => {
        setFocusedSourceLineIndex(sourceIndex);
    }, []);

    const handleCopyFullLog = React.useCallback(async () => {
        await navigator.clipboard.writeText(body);
        showCopyFeedback();
    }, [body, showCopyFeedback]);

    const handleDownload = React.useCallback(() => {
        const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        showDownloadFeedback();
    }, [body, fileName, showDownloadFeedback]);

    const getActionButtonClassName = (isFeedbackVisible = false) => {
        return `
            rounded-md border-0 p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500
            ${isFeedbackVisible
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        : 'bg-input/80 dark:bg-input/80 text-muted-foreground hover:text-primary hover:bg-input/90 dark:hover:bg-input/90'}
        `;
    }

    const getFilterButtonClassName = (filter: LogViewFilter) => {
        return getActionButtonClassName(viewFilter === filter);
    }

    // The one row that's Tab-reachable. Falls back to the first visible line
    // whenever the previously-focused line isn't part of the current
    // debug/executable filter - otherwise toggling the filter could leave zero
    // rows with tabIndex 0, making the log body impossible to Tab back into.
    const isFocusedLineVisible = focusedSourceLineIndex !== null && (
        !visibleIndexBySourceIndex || visibleIndexBySourceIndex.has(focusedSourceLineIndex)
    );
    const rovingSourceLineIndex = isFocusedLineVisible
        ? focusedSourceLineIndex
        : getSourceLineIndex(0);

    return (
        <section className="relative flex min-h-0 flex-1 flex-col border-t border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <div className="
                    flex h-8 min-w-0 flex-1 items-center gap-2 border-0 rounded-md bg-input/80 dark:bg-input/80 px-2
                    focus-within:ring-[2px] focus-within:ring-ring/40
                ">
                    <Search size={15} className="shrink-0 text-muted-foreground" />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search log..."
                        aria-label="Search log body"
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground font-sans"
                    />
                    {trimmedSearchQuery && (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {matchingLineIndexes.length === 0
                                ? '0'
                                : `${Math.max(activeMatchIndex + 1, 0)}/${matchingLineIndexes.length}`}
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    title="Debug lines"
                    aria-label="Show debug lines only"
                    aria-pressed={viewFilter === 'debug'}
                    onClick={() => setViewFilter(viewFilter === 'debug' ? 'all' : 'debug')}
                    className={getFilterButtonClassName('debug')}
                >
                    <Bug size={15} />
                </button>

                <button
                    type="button"
                    title="Executable lines"
                    aria-label="Show executable lines only"
                    aria-pressed={viewFilter === 'executable'}
                    onClick={() => setViewFilter(viewFilter === 'executable' ? 'all' : 'executable')}
                    className={getFilterButtonClassName('executable')}
                >
                    <Code2 size={15} />
                </button>

                <button
                    type="button"
                    title="Wrap lines"
                    aria-label="Toggle line wrapping"
                    aria-pressed={isWrapEnabled}
                    onClick={() => setIsWrapEnabled(wrapped => !wrapped)}
                    className={getActionButtonClassName(isWrapEnabled)}
                >
                    <WrapText size={15} />
                </button>

                {/* Only worth showing once there's something to show - a log
                    with no parsed CUMULATIVE_LIMIT_USAGE block (purged, or an
                    older API version) shouldn't offer an empty toggle. */}
                {limitUsageMetrics.length > 0 && (
                    <button
                        type="button"
                        title="Limit usage"
                        aria-label="Toggle governor limit usage summary"
                        aria-pressed={isLimitSummaryOpen}
                        onClick={() => setIsLimitSummaryOpen(open => !open)}
                        className={getActionButtonClassName(isLimitSummaryOpen)}
                    >
                        <Gauge size={15} />
                    </button>
                )}

                {/* Less-frequent, one-shot actions live behind this menu
                    instead of the primary row - keeps the toolbar from growing
                    an icon for every feature added over time. This is the one
                    control here that gets a text label, since its whole job is
                    to be the discoverable entry point to everything else. */}
                <Popover open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            title="More actions"
                            aria-label="More actions"
                            aria-expanded={isMoreMenuOpen}
                            className={`
                                flex h-8 shrink-0 items-center gap-1.5 rounded-md border-0 bg-input/80 px-2.5 text-xs
                                font-medium text-muted-foreground hover:bg-input/90 hover:text-primary
                                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500
                                dark:bg-input/80 dark:hover:bg-input/90
                            `}
                        >
                            <MoreHorizontal size={15} />
                            More
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 border-border bg-popover p-1 font-sans">
                        <button
                            type="button"
                            onClick={() => {
                                void handleCopyFullLog();
                                setIsMoreMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                            {isCopyFeedbackVisible ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
                            {isCopyFeedbackVisible ? 'Copied' : 'Copy full log'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                handleDownload();
                                setIsMoreMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                            {isDownloadFeedbackVisible ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Download size={14} />}
                            {isDownloadFeedbackVisible ? 'Downloaded' : 'Download log'}
                        </button>
                    </PopoverContent>
                </Popover>
            </div>

            {/* User-activated - sits right below the toolbar, above the log
                body, so it's easy to reach but never takes up space unless
                someone actually asked to see it. Same stat-tile shape and
                type scale as ApiLimitPopover's usage grid (11px sans label,
                text-sm mono value) rather than a one-off treatment. */}
            {isLimitSummaryOpen && limitUsageMetrics.length > 0 && (
                <div className="grid grid-cols-4 gap-2 border-b border-border bg-muted/30 px-4 py-3 font-sans">
                    {limitUsageMetrics.map(metric => {
                        const usageRatio = metric.limit > 0 ? metric.used / metric.limit : 0;
                        const valueToneClassName = usageRatio >= 0.95
                            ? 'text-red-700 dark:text-red-400'
                            : usageRatio >= 0.75
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-primary';

                        return (
                            <div key={metric.key} className="rounded-md border border-border bg-background p-2">
                                <div className="text-[11px] text-muted-foreground">{metric.label}</div>
                                <div className={`mt-1 font-mono text-sm ${valueToneClassName}`}>
                                    {metric.used.toLocaleString()}<span className="text-muted-foreground">/{metric.limit.toLocaleString()}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ScrollArea className="min-h-0 flex-1 bg-sidebar font-mono text-sm">
                <ScrollAreaViewport ref={scrollParentRef} className="overscroll-contain">
                    <span
                        ref={charWidthProbeRef}
                        aria-hidden="true"
                        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre text-sm"
                    >
                        {'M'.repeat(CHAR_WIDTH_PROBE_LENGTH)}
                    </span>

                    {/* Sticky within the scrolling ancestor above, not the page -
                        fades in only once there's cut-off content in that direction. */}
                    <div
                        aria-hidden="true"
                        className={`
                            pointer-events-none sticky top-0 z-10 -mb-4 h-4
                            bg-gradient-to-b from-sidebar to-transparent
                            transition-opacity duration-150
                            ${scrollEdges.atTop ? 'opacity-0' : 'opacity-100'}
                        `}
                    />

                    <div
                        className="relative"
                        style={{ height: `${lineVirtualizer.getTotalSize()}px` }}
                    >
                        {virtualLines.map((virtualLine) => {
                            const sourceLineIndex = getSourceLineIndex(virtualLine.index);
                            const line = lines[sourceLineIndex] ?? '';
                            const lineNumber = sourceLineIndex + 1;
                            const isActiveMatchLine = virtualLine.index === activeMatchLineIndex;
                            const isPinned = pinnedLineSet.has(sourceLineIndex);
                            const isErrorLine = errorLineSet.has(sourceLineIndex);

                            return (
                                <div
                                    key={virtualLine.key}
                                    data-index={virtualLine.index}
                                    ref={(element) => {
                                        setRowRef(sourceLineIndex, element);

                                        if (isWrapEnabled) {
                                            lineVirtualizer.measureElement(element);
                                        }
                                    }}
                                    tabIndex={sourceLineIndex === rovingSourceLineIndex ? 0 : -1}
                                    aria-label={`Line ${lineNumber}`}
                                    onKeyDown={(event) => handleRowKeyDown(event, sourceLineIndex)}
                                    onFocus={() => handleRowFocus(sourceLineIndex)}
                                    className={`
                                        absolute left-0 top-0 grid
                                        ${isWrapEnabled
                                    ? 'w-full grid-cols-[4.5rem_minmax(0,1fr)] items-start'
                                    : 'min-w-full grid-cols-[4.5rem_max-content] whitespace-pre'}
                                        ${isActiveMatchLine ? 'bg-orange-500/10' : isErrorLine ? 'bg-red-500/10' : isPinned ? 'bg-emerald-500/10' : ''}
                                        outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500
                                    `}
                                    style={{
                                        // Fixed-height rows are cheap to position with a fixed height;
                                        // wrapped rows are measured, so let content define the height
                                        // instead of forcing the (now stale) estimate.
                                        height: isWrapEnabled ? undefined : `${virtualLine.size}px`,
                                        transform: `translateY(${virtualLine.start}px)`,
                                        // The accent bar stays even when a search match's orange
                                        // background is winning the row's bg color above - it's the
                                        // one marker that always says "this line is pinned/an error"
                                        // regardless of whatever else is highlighting the row right
                                        // now. A pin is a deliberate user mark, so it wins the bar over
                                        // an auto-detected error on the rare line that's both.
                                        boxShadow: isPinned
                                            ? 'inset 3px 0 0 0 var(--color-emerald-500)'
                                            : isErrorLine
                                                ? 'inset 3px 0 0 0 var(--color-red-500)'
                                                : undefined
                                    }}
                                >
                                    <div
                                        role="button"
                                        title={isPinned ? `Unpin line ${lineNumber}` : `Pin line ${lineNumber}`}
                                        aria-label={isPinned ? `Unpin line ${lineNumber}` : `Pin line ${lineNumber}`}
                                        aria-pressed={isPinned}
                                        onClick={() => onTogglePinnedLine(sourceLineIndex)}
                                        className={`
                                            sticky left-0 z-10 cursor-pointer select-none border-r pr-3 text-right text-sm leading-6
                                            transition-colors
                                            ${isPinned
                                    ? 'border-border bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300'
                                    : isErrorLine
                                        ? 'border-border bg-red-500/10 font-medium text-red-700 dark:text-red-400'
                                        : 'border-border/70 bg-sidebar text-muted-foreground/70 hover:bg-muted/60 hover:text-muted-foreground'}
                                        `}
                                    >
                                        {lineNumber}
                                    </div>
                                    <div
                                        className={`px-3 text-sm leading-6 text-muted-foreground ${isWrapEnabled ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}
                                    >
                                        {renderHighlightedLine(line, deferredSearchQuery)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div
                        aria-hidden="true"
                        className={`
                            pointer-events-none sticky bottom-0 z-10 -mt-4 h-4
                            bg-gradient-to-t from-sidebar to-transparent
                            transition-opacity duration-150
                            ${scrollEdges.atBottom ? 'opacity-0' : 'opacity-100'}
                        `}
                    />
                </ScrollAreaViewport>
                <ScrollAreaScrollbar />
            </ScrollArea>

            {/* Only rendered once something is actually pinned - no permanent
                chrome for a feature that isn't in use on this log. */}
            {sortedPinnedLines.length > 0 && (
                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-0.5 rounded-md border border-border bg-popover/95 p-1 shadow-lg backdrop-blur-sm">
                    <button
                        type="button"
                        title="Previous pinned line"
                        aria-label="Previous pinned line"
                        onClick={() => moveToPin(-1)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <span className="min-w-8 px-1 text-center font-mono text-[11px] text-muted-foreground">
                        {activePinIndex >= 0 ? activePinIndex + 1 : '-'}/{sortedPinnedLines.length}
                    </span>
                    <button
                        type="button"
                        title="Next pinned line"
                        aria-label="Next pinned line"
                        onClick={() => moveToPin(1)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                        <ChevronDown size={14} />
                    </button>
                    <div className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
                    <button
                        type="button"
                        title="Clear all pinned lines"
                        aria-label="Clear all pinned lines"
                        onClick={onClearPinnedLines}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Bottom-left, mirroring the pin navigator's bottom-right spot -
                errors are auto-detected rather than user-set, so there's no
                clear-all control here, just previous/next. */}
            {errorSourceLineIndexes.length > 0 && (
                <div className="absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-md border border-red-500/30 bg-popover/95 p-1 shadow-lg backdrop-blur-sm">
                    <AlertTriangle size={13} className="mx-1 text-red-600 dark:text-red-400" />
                    <button
                        type="button"
                        title="Previous error"
                        aria-label="Previous error"
                        onClick={() => moveToError(-1)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <span className="min-w-8 px-1 text-center font-mono text-[11px] text-muted-foreground">
                        {activeErrorIndex >= 0 ? activeErrorIndex + 1 : '-'}/{errorSourceLineIndexes.length}
                    </span>
                    <button
                        type="button"
                        title="Next error"
                        aria-label="Next error"
                        onClick={() => moveToError(1)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                        <ChevronDown size={14} />
                    </button>
                </div>
            )}
        </section>
    );
}

export { LogBodyViewer };
