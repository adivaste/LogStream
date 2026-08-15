import { useVirtualizer } from "@tanstack/react-virtual";
import { Bug, Check, Code2, Copy, Download, Search, WrapText } from "lucide-react";
import React from "react";

import { ScrollArea, ScrollAreaScrollbar, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { useElementScrollEdges } from "@/hooks/useScrollEdgeFade";

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

function LogBodyViewer({ body, fileName }: LogBodyViewerProps) {
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

    return (
        <section className="flex min-h-0 flex-1 flex-col border-t border-border">
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
                    title={isCopyFeedbackVisible ? 'Copied' : 'Copy full log'}
                    aria-label={isCopyFeedbackVisible ? 'Copied full log' : 'Copy full log'}
                    onClick={handleCopyFullLog}
                    className={getActionButtonClassName(isCopyFeedbackVisible)}
                >
                    {isCopyFeedbackVisible ? <Check size={15} /> : <Copy size={15} />}
                </button>

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

                <button
                    type="button"
                    title={isDownloadFeedbackVisible ? 'Downloaded' : 'Download log'}
                    aria-label={isDownloadFeedbackVisible ? 'Downloaded log' : 'Download log'}
                    onClick={handleDownload}
                    className={getActionButtonClassName(isDownloadFeedbackVisible)}
                >
                    {isDownloadFeedbackVisible ? <Check size={15} /> : <Download size={15} />}
                </button>
            </div>

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

                            return (
                                <div
                                    key={virtualLine.key}
                                    data-index={virtualLine.index}
                                    ref={isWrapEnabled ? lineVirtualizer.measureElement : undefined}
                                    className={`
                                        absolute left-0 top-0 grid
                                        ${isWrapEnabled
                                    ? 'w-full grid-cols-[4.5rem_minmax(0,1fr)] items-start'
                                    : 'min-w-full grid-cols-[4.5rem_max-content] whitespace-pre'}
                                        ${isActiveMatchLine ? 'bg-orange-500/10' : ''}
                                    `}
                                    style={{
                                        // Fixed-height rows are cheap to position with a fixed height;
                                        // wrapped rows are measured, so let content define the height
                                        // instead of forcing the (now stale) estimate.
                                        height: isWrapEnabled ? undefined : `${virtualLine.size}px`,
                                        transform: `translateY(${virtualLine.start}px)`
                                    }}
                                >
                                    <div className="sticky left-0 z-10 select-none border-r border-border/70 bg-sidebar pr-3 text-right text-sm leading-6 text-muted-foreground/70">
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
        </section>
    );
}

export { LogBodyViewer };
