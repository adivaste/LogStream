import { useVirtualizer } from "@tanstack/react-virtual";
import {
    AlertTriangle,
    AlignLeft,
    Bug,
    Check,
    ChevronDown,
    ChevronsDownUp,
    ChevronUp,
    Code2,
    Copy,
    Download,
    Gauge,
    Hash,
    ListTree,
    MoreHorizontal,
    Pin,
    Regex,
    Search,
    WrapText,
    X,
    ZoomIn,
    ZoomOut
} from "lucide-react";
import React from "react";

import { LogCallTree } from "@/components/layout/LogCallTree";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollAreaScrollbar, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { useCallTree } from "@/hooks/useCallTree";
import { useDelayedLoadingGate } from "@/hooks/useDelayedLoadingGate";
import { useElementScrollEdges } from "@/hooks/useScrollEdgeFade";
import { collectCollapsibleNodeIds, hasTreeableEvents } from "@/lib/callTreeParser";
import {
    DEFAULT_LOG_BODY_FONT_SIZE_PX,
    MAX_LOG_BODY_FONT_SIZE_PX,
    MIN_LOG_BODY_FONT_SIZE_PX
} from "@/lib/appPreferences";
import {
    compileSearchPattern,
    getActionButtonClassName,
    LOG_LINE_HEIGHT,
    LOG_VIEWER_OVERSCAN,
    renderHighlightedLine
} from "@/lib/logBodyHighlight";
import { getErrorLineNumbers, parseLimitUsage } from "@/lib/logBodyMeta";
import { getNextLogIndex } from "@/lib/logListConfig";
import { isEditableTarget } from "@/lib/utils";
import { useTableUIStore } from "@/store/tableUIStore";
import { useUIStore } from "@/store/uiStore";

const FONT_SIZE_STEP_PX = 1;

// Layout of a row: a fixed 4.5rem line-number column, then the content
// column with 0.75rem (px-3) padding on both sides.
// NOTE: keep in sync with the literal `4.5rem` in the row grid templates
// below and in LogPanel's LogBodySkeleton - a dynamic Tailwind class can't be
// used here because the JIT only sees statically-written class strings.
const LOG_LINE_NUMBER_COLUMN_PX = 72;
const LOG_CONTENT_PADDING_PX = 24;
const CHAR_WIDTH_PROBE_LENGTH = 80;

const EXECUTABLE_LINE_PATTERN = /\|(METHOD_ENTRY|METHOD_EXIT|SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|DML_BEGIN|DML_END|USER_DEBUG|EXCEPTION_THROWN|FATAL_ERROR)\|/;

const JUMP_HIGHLIGHT_DURATION_MS = 1600;

type LogBodyViewerProps = {
    body: string;
    fileName: string;
    logId: string;
    // True when the panel was opened with Enter, i.e. the user meant to read
    // this log rather than glance at it.
    shouldFocusOnOpen: boolean;
    onReturnFocusToList: () => void;
    // Source line indexes (0-based, stable across wrap toggling and view
    // filtering - never the virtualizer's own row index, which shifts
    // whenever the debug/executable filter changes which rows exist at all).
    pinnedLines: number[];
    onTogglePinnedLine: (_sourceLineIndex: number) => void;
    onClearPinnedLines: () => void;
    collapsedCallTreeNodes: number[];
    onToggleCallTreeNode: (_nodeId: number) => void;
    onSetCallTreeCollapsedNodes: (_nodeIds: number[]) => void;
}

type LogViewFilter = 'all' | 'debug' | 'executable';

const isDebugLine = (line: string) => {
    return line.includes('|USER_DEBUG|');
}

const isExecutableLine = (line: string) => {
    return EXECUTABLE_LINE_PATTERN.test(line);
}

function LogBodyViewer({
    body,
    fileName,
    logId,
    shouldFocusOnOpen,
    onReturnFocusToList,
    pinnedLines,
    onTogglePinnedLine,
    onClearPinnedLines,
    collapsedCallTreeNodes,
    onToggleCallTreeNode,
    onSetCallTreeCollapsedNodes
}: LogBodyViewerProps) {
    const sectionRef = React.useRef<HTMLElement | null>(null);
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
    // content width, and estimate each wrapped row's height from its
    // character count. Word-aware wrapping (`break-words`, not `break-all`)
    // means real line breaks land at whitespace rather than at the exact
    // char-count cutoff, so this is an approximation rather than exact math
    // now - close enough that `measureElement` only ever needs to correct it
    // by a line, and only for the rare row with unusually long/short words.
    const charWidthPxRef = React.useRef(LOG_LINE_HEIGHT * 0.42);
    const contentWidthPxRef = React.useRef(0);
    const logBodyPreferences = useUIStore(state => state.logBodyPreferences);
    const updateLogBodyPreferences = useUIStore(state => state.updateLogBodyPreferences);
    const viewMode = useTableUIStore(state => state.logBodyViewMode);
    const setViewMode = useTableUIStore(state => state.setLogBodyViewMode);
    // Set when a call-tree row asks to jump into the raw log. The mode swap
    // has to settle before there's anything to scroll to, so this hands off to
    // the effect below rather than scrolling inline - the same deferred shape
    // pendingScrollRef already uses for the filter lift, one stage earlier.
    const pendingModeScrollRef = React.useRef<number | null>(null);
    const jumpHighlightTimeoutRef = React.useRef<number | null>(null);
    const [highlightedJumpLineIndex, setHighlightedJumpLineIndex] = React.useState<number | null>(null);
    // Selecting a frame is separate from navigating to it - a click highlights
    // the row and stays in the tree, so reading the tree doesn't keep throwing
    // you back into the raw log.
    const [selectedCallTreeNodeId, setSelectedCallTreeNodeId] = React.useState<number | null>(null);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isRegexEnabled, setIsRegexEnabled] = React.useState(false);
    const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);
    // Wrap/filter/font-size are global user preferences (not per-log), so the
    // store is the source of truth - local state here only exists because a
    // handful of derived values (estimateSize, filtering) need a plain value
    // to read synchronously rather than a store subscription in a memo dep.
    const [viewFilter, setViewFilterState] = React.useState<LogViewFilter>(logBodyPreferences.viewFilter);
    const [isWrapEnabled, setIsWrapEnabledState] = React.useState(logBodyPreferences.wrapEnabled);
    const [fontSizePx, setFontSizePxState] = React.useState(logBodyPreferences.fontSizePx);
    const [isCopyFeedbackVisible, setIsCopyFeedbackVisible] = React.useState(false);
    const [isDownloadFeedbackVisible, setIsDownloadFeedbackVisible] = React.useState(false);
    const [isPinCopyFeedbackVisible, setIsPinCopyFeedbackVisible] = React.useState(false);
    const [activePinIndex, setActivePinIndex] = React.useState(-1);
    const [activeErrorIndex, setActiveErrorIndex] = React.useState(-1);
    const [isLimitSummaryOpen, setIsLimitSummaryOpen] = React.useState(false);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);
    const [goToLineQuery, setGoToLineQuery] = React.useState('');
    const [activeGoToLineIndex, setActiveGoToLineIndex] = React.useState(-1);
    // Pins and errors used to render as two separate floating bars (bottom-
    // right/bottom-left) - one consolidated bar reads cleaner, with an icon
    // to flip which line-set it's navigating when both exist on this log.
    // Lazily default to whichever set is more likely non-empty on first
    // render (errors, when there are no pins yet) - avoids a one-frame flash
    // where the bar shows "pins" with a "-/0" count before the
    // empty-set-correction effect below flips it to errors.
    const [navigatorMode, setNavigatorMode] = React.useState<'pins' | 'errors'>(
        () => pinnedLines.length > 0 ? 'pins' : 'errors'
    );

    const setViewFilter = React.useCallback((next: LogViewFilter | ((_prev: LogViewFilter) => LogViewFilter)) => {
        setViewFilterState(prev => {
            const resolved = typeof next === 'function' ? next(prev) : next;
            updateLogBodyPreferences({ viewFilter: resolved });
            return resolved;
        });
    }, [updateLogBodyPreferences]);

    const setIsWrapEnabled = React.useCallback((next: boolean | ((_prev: boolean) => boolean)) => {
        setIsWrapEnabledState(prev => {
            const resolved = typeof next === 'function' ? next(prev) : next;
            updateLogBodyPreferences({ wrapEnabled: resolved });
            return resolved;
        });
    }, [updateLogBodyPreferences]);

    const setFontSizePx = React.useCallback((next: number | ((_prev: number) => number)) => {
        setFontSizePxState(prev => {
            const resolved = Math.min(
                MAX_LOG_BODY_FONT_SIZE_PX,
                Math.max(MIN_LOG_BODY_FONT_SIZE_PX, typeof next === 'function' ? next(prev) : next)
            );
            updateLogBodyPreferences({ fontSizePx: resolved });
            return resolved;
        });
    }, [updateLogBodyPreferences]);
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

    const deferredSearchPattern = React.useMemo(
        () => compileSearchPattern(deferredSearchQuery, isRegexEnabled),
        [deferredSearchQuery, isRegexEnabled]
    );
    const isInvalidRegex = isRegexEnabled && Boolean(trimmedSearchQuery) && !deferredSearchPattern;

    const matchingLineIndexes = React.useMemo(() => {
        if (!deferredSearchQuery) {
            return [];
        }

        // Regex mode with an unparsable pattern falls back to "no matches"
        // rather than silently degrading to a literal-text search - that
        // silent fallback would be more confusing than an empty result with
        // the "invalid pattern" hint shown next to the search box.
        if (isRegexEnabled && !deferredSearchPattern) {
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

            const isMatch = deferredSearchPattern
                ? (deferredSearchPattern.lastIndex = 0, deferredSearchPattern.test(line))
                : line.toLowerCase().includes(lowerSearchQuery);

            if (isMatch) {
                indexes.push(visibleIndex);
            }
        }

        return indexes;
    }, [deferredSearchPattern, deferredSearchQuery, getSourceLineIndex, isRegexEnabled, lines, visibleLineCount]);

    const trimmedGoToLineQuery = goToLineQuery.trim();

    // Apex source line numbers (the `[47]` markers Salesforce embeds in
    // METHOD_ENTRY/USER_DEBUG/etc. lines) rather than raw log line numbers -
    // the same class line can execute many times (loops, repeated calls), so
    // this is a multi-match navigator like pins/errors, not a single jump.
    const goToLineSourceIndexes = React.useMemo(() => {
        if (!trimmedGoToLineQuery || !/^\d+$/.test(trimmedGoToLineQuery)) {
            return [];
        }

        const targetToken = `[${trimmedGoToLineQuery}]`;
        const indexes: number[] = [];

        lines.forEach((line, sourceIndex) => {
            if (line.includes(targetToken)) {
                indexes.push(sourceIndex);
            }
        });

        return indexes;
    }, [lines, trimmedGoToLineQuery]);

    // Row height scales with the zoom level so wrapped-row estimates and
    // fixed-row heights stay proportional to the actual rendered text size.
    const lineHeightPx = Math.round(LOG_LINE_HEIGHT * (fontSizePx / DEFAULT_LOG_BODY_FONT_SIZE_PX));

    const lineVirtualizer = useVirtualizer({
        count: visibleLineCount,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: (index) => {
            if (!isWrapEnabled) {
                return lineHeightPx;
            }

            const availableWidthPx = contentWidthPxRef.current - LOG_LINE_NUMBER_COLUMN_PX - LOG_CONTENT_PADDING_PX;
            const charsPerLine = Math.max(1, Math.floor(availableWidthPx / charWidthPxRef.current));
            const line = lines[getSourceLineIndex(index)] ?? '';
            const wrappedLineCount = Math.max(1, Math.ceil(line.length / charsPerLine));

            return wrappedLineCount * lineHeightPx;
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
    }, [fontSizePx, isWrapEnabled, lineVirtualizer]);

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
    }, [lineVirtualizer, setViewFilter, visibleIndexBySourceIndex]);

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

    // Derived from the raw body, NOT from the parse result: the parse is lazy
    // and only runs once tree mode is active, so gating entry to tree mode on
    // it would deadlock (no tree until you switch, no switch until there's a
    // tree). A substring probe answers the same question without parsing.
    const hasCallTree = React.useMemo(() => hasTreeableEvents(body), [body]);
    const callTree = useCallTree(lines, logId, viewMode === 'tree');
    const shouldShowCallTreeSkeleton = useDelayedLoadingGate(!callTree.isParsing);

    // Whether a log has a call tree at all depends on the trace flag level it
    // was captured at, so a sticky tree mode has to yield to the log actually
    // in front of the user rather than stranding them on an empty view. Uses
    // the same probe as the toggle above so this can't fight it: a log that
    // enables the button is never bounced straight back out of tree mode.
    React.useEffect(() => {
        if (viewMode === 'tree' && !hasCallTree) {
            setViewMode('raw');
        }
    }, [hasCallTree, setViewMode, viewMode]);

    React.useEffect(() => {
        return () => {
            if (jumpHighlightTimeoutRef.current) {
                window.clearTimeout(jumpHighlightTimeoutRef.current);
            }
        };
    }, []);

    const handleJumpToSourceLine = React.useCallback((sourceLineIndex: number) => {
        setHighlightedJumpLineIndex(sourceLineIndex);

        if (jumpHighlightTimeoutRef.current) {
            window.clearTimeout(jumpHighlightTimeoutRef.current);
        }

        jumpHighlightTimeoutRef.current = window.setTimeout(() => {
            setHighlightedJumpLineIndex(null);
        }, JUMP_HIGHLIGHT_DURATION_MS);

        if (viewMode === 'raw') {
            scrollToSourceIndex(sourceLineIndex);
            return;
        }

        pendingModeScrollRef.current = sourceLineIndex;
        setViewMode('raw');
    }, [scrollToSourceIndex, setViewMode, viewMode]);

    React.useEffect(() => {
        if (viewMode !== 'raw') {
            return;
        }

        const pendingSourceIndex = pendingModeScrollRef.current;

        if (pendingSourceIndex === null) {
            return;
        }

        pendingModeScrollRef.current = null;

        // One frame so the raw body is laid out (it renders `hidden` in tree
        // mode, so it has no measurable height until this commit paints)
        // before asking the virtualizer to scroll. Handing off to
        // scrollToSourceIndex rather than scrolling directly means a target
        // that's *also* hidden by the debug/executable filter still resolves -
        // that function arms pendingScrollRef and the effect above finishes it.
        const frameId = requestAnimationFrame(() => {
            scrollToSourceIndex(pendingSourceIndex);
        });

        return () => cancelAnimationFrame(frameId);
    }, [scrollToSourceIndex, viewMode]);

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

    React.useEffect(() => {
        setActiveGoToLineIndex(-1);
    }, [trimmedGoToLineQuery]);

    const moveToGoToLine = React.useCallback((direction: 1 | -1) => {
        if (goToLineSourceIndexes.length === 0) {
            return;
        }

        setActiveGoToLineIndex(current => {
            const nextIndex = current < 0
                ? (direction === 1 ? 0 : goToLineSourceIndexes.length - 1)
                : (current + direction + goToLineSourceIndexes.length) % goToLineSourceIndexes.length;

            const sourceIndex = goToLineSourceIndexes[nextIndex];

            if (sourceIndex !== undefined) {
                scrollToSourceIndex(sourceIndex);
            }

            return nextIndex;
        });
    }, [goToLineSourceIndexes, scrollToSourceIndex]);

    const handleGoToLineKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        moveToGoToLine(event.shiftKey ? -1 : 1);
    }, [moveToGoToLine]);

    // If the active mode's set empties out (last pin removed, or a fresh log
    // with no errors) but the other one still has entries, fall back to it
    // rather than showing a bar stuck on an empty list.
    React.useEffect(() => {
        if (navigatorMode === 'pins' && sortedPinnedLines.length === 0 && errorSourceLineIndexes.length > 0) {
            setNavigatorMode('errors');
        } else if (navigatorMode === 'errors' && errorSourceLineIndexes.length === 0 && sortedPinnedLines.length > 0) {
            setNavigatorMode('pins');
        }
    }, [errorSourceLineIndexes.length, navigatorMode, sortedPinnedLines.length]);

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

    const showPinCopyFeedback = React.useCallback(() => {
        setIsPinCopyFeedbackVisible(true);
        window.setTimeout(() => setIsPinCopyFeedbackVisible(false), 1200);
    }, []);

    const handleCopyPinnedLines = React.useCallback(async () => {
        if (sortedPinnedLines.length === 0) {
            return;
        }

        const text = sortedPinnedLines
            .map(sourceIndex => `${sourceIndex + 1}: ${lines[sourceIndex] ?? ''}`)
            .join('\n');

        await navigator.clipboard.writeText(text);
        showPinCopyFeedback();
    }, [lines, showPinCopyFeedback, sortedPinnedLines]);

    // Ctrl/Cmd+Shift+C (pinned lines) and Ctrl/Cmd+C on a focused, unselected
    // row (that one line) both need to live above the global shortcut
    // manager's bare-letter bindings (d/c/f/s...) - those fire on any
    // non-editable target, including a focused log row, so this feature has
    // to use modifier combos the global manager doesn't already claim.
    // Scoped to focus being inside this log body's own DOM subtree - without
    // that check, this previously hijacked Ctrl+Shift+C (Chrome's "Inspect
    // Element") and the browser's native Ctrl+=/-/0 zoom shortcuts anywhere
    // on the page for as long as any log was open, not just while a user was
    // actually interacting with this component.
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const isModifierPressed = event.ctrlKey || event.metaKey;

            if (!isModifierPressed) {
                return;
            }

            if (!sectionRef.current?.contains(document.activeElement)) {
                return;
            }

            if (event.key === 'c' || event.key === 'C') {
                if (event.shiftKey) {
                    event.preventDefault();
                    void handleCopyPinnedLines();
                    return;
                }

                if (
                    focusedSourceLineIndex !== null
                    && rowRefs.current[focusedSourceLineIndex] === document.activeElement
                    && window.getSelection()?.isCollapsed !== false
                ) {
                    event.preventDefault();
                    const line = lines[focusedSourceLineIndex] ?? '';
                    void navigator.clipboard.writeText(line);
                }

                return;
            }

            if (event.key === '=' || event.key === '+') {
                event.preventDefault();
                setFontSizePx(size => size + FONT_SIZE_STEP_PX);
            } else if (event.key === '-') {
                event.preventDefault();
                setFontSizePx(size => size - FONT_SIZE_STEP_PX);
            } else if (event.key === '0') {
                event.preventDefault();
                setFontSizePx(DEFAULT_LOG_BODY_FONT_SIZE_PX);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedSourceLineIndex, handleCopyPinnedLines, lines, setFontSizePx]);

    // Stays in the component (unlike getActionButtonClassName, which moved to
    // the shared module) because it closes over `viewFilter`.
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

    // Opened with Enter: land on the first line so the log can be traversed
    // immediately. Keyed on the log id rather than the flag alone, so moving
    // to the next log re-runs it, and guarded on `lines` because the body
    // arrives asynchronously - there is nothing to focus until it does.
    const hasFocusedOnOpenRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!shouldFocusOnOpen || lines.length === 0 || visibleLineCount === 0) {
            return;
        }

        if (hasFocusedOnOpenRef.current === logId) {
            return;
        }

        hasFocusedOnOpenRef.current = logId;
        focusLineAtVisibleIndex(0);
    }, [focusLineAtVisibleIndex, lines.length, logId, shouldFocusOnOpen, visibleLineCount]);

    // Backspace steps back out to the list without closing the panel, so the
    // log stays open while you carry on scanning - Escape is the one that
    // dismisses. Handled on the section so it works from raw lines, tree
    // rows and toolbar buttons alike, and guarded so it still deletes
    // characters inside the search and go-to-line inputs.
    const handleSectionKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Backspace' || isEditableTarget(event.target)) {
            return;
        }

        event.preventDefault();
        onReturnFocusToList();
    }, [onReturnFocusToList]);

    return (
        <section
            ref={sectionRef}
            onKeyDown={handleSectionKeyDown}
            className="relative flex min-h-0 flex-1 flex-col border-t border-border"
        >
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                {/* Leftmost, and the only control here besides "More" with a
                    text label - this one answers "what am I looking at", so it
                    shouldn't read as just another filter icon. */}
                <div
                    role="group"
                    aria-label="Log view mode"
                    className="flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-input/80 p-0.5 dark:bg-input/80"
                >
                    {([
                        { mode: 'raw' as const, icon: AlignLeft, label: 'Raw', isDisabled: false },
                        { mode: 'tree' as const, icon: ListTree, label: 'Tree', isDisabled: !hasCallTree }
                    ]).map(({ mode, icon: ModeIcon, label, isDisabled }) => (
                        <button
                            key={mode}
                            type="button"
                            title={isDisabled ? 'No method entry data in this log' : `${label} view`}
                            aria-label={`${label} view`}
                            aria-pressed={viewMode === mode}
                            disabled={isDisabled}
                            onClick={() => setViewMode(mode)}
                            className={`
                                flex h-7 items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-2 text-xs
                                font-medium font-sans transition-colors focus-visible:outline-none
                                focus-visible:ring-1 focus-visible:ring-emerald-500
                                disabled:cursor-not-allowed disabled:opacity-50
                                ${viewMode === mode
                            ? 'bg-background text-emerald-700 shadow-xs dark:text-emerald-300'
                            : 'text-muted-foreground hover:text-primary'}
                            `}
                        >
                            <ModeIcon size={15} />
                            {label}
                        </button>
                    ))}
                </div>

                {viewMode === 'raw' && (<>
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
                            <span
                                title={isInvalidRegex ? 'Invalid regular expression' : undefined}
                                className={`shrink-0 font-mono text-[11px] ${isInvalidRegex ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
                            >
                                {isInvalidRegex
                                    ? 'Invalid regex'
                                    : matchingLineIndexes.length === 0
                                        ? '0'
                                        : `${Math.max(activeMatchIndex + 1, 0)}/${matchingLineIndexes.length}`}
                            </span>
                        )}
                        <button
                            type="button"
                            title="Regex search"
                            aria-label="Toggle regex search"
                            aria-pressed={isRegexEnabled}
                            onClick={() => setIsRegexEnabled(enabled => !enabled)}
                            className={`
                            shrink-0 rounded p-1
                            ${isRegexEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-primary'}
                        `}
                        >
                            <Regex size={14} />
                        </button>
                    </div>

                    <div className="
                    flex h-8 w-32 shrink-0 items-center gap-1.5 border-0 rounded-md bg-input/80 dark:bg-input/80 px-2
                    focus-within:ring-[2px] focus-within:ring-ring/40
                ">
                        <Hash size={14} className="shrink-0 text-muted-foreground" />
                        <input
                            type="text"
                            inputMode="numeric"
                            value={goToLineQuery}
                            onChange={(event) => setGoToLineQuery(event.target.value)}
                            onKeyDown={handleGoToLineKeyDown}
                            placeholder="Apex line #"
                            aria-label="Go to Apex source line number"
                            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground font-sans"
                        />
                        {trimmedGoToLineQuery && (
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                {goToLineSourceIndexes.length === 0
                                    ? '0'
                                    : `${Math.max(activeGoToLineIndex + 1, 0)}/${goToLineSourceIndexes.length}`}
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
                </>)}

                {/* Tree-only. Search/go-to-line/filters/wrap all mean "find or
                    reshape a raw text line", which has no meaning over frames,
                    so they're hidden above rather than left inert. */}
                {viewMode === 'tree' && (<>
                    <div className="min-w-0 flex-1" />

                    <button
                        type="button"
                        title="Expand all frames"
                        aria-label="Expand all frames"
                        onClick={() => onSetCallTreeCollapsedNodes([])}
                        className={getActionButtonClassName()}
                    >
                        <ChevronsDownUp size={15} className="rotate-180" />
                    </button>

                    <button
                        type="button"
                        title="Collapse all frames"
                        aria-label="Collapse all frames"
                        onClick={() => onSetCallTreeCollapsedNodes(
                            collectCollapsibleNodeIds(callTree.aggregatedRoots, 0)
                        )}
                        className={getActionButtonClassName()}
                    >
                        <ChevronsDownUp size={15} />
                    </button>
                </>)}

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
                    <PopoverContent align="end" className="w-48 border-border bg-popover p-1 font-sans">
                        <button
                            type="button"
                            onClick={() => {
                                void handleCopyFullLog();
                                setIsMoreMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                            {isCopyFeedbackVisible ? <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} className="shrink-0" />}
                            {isCopyFeedbackVisible ? 'Copied' : 'Copy full log'}
                        </button>
                        {sortedPinnedLines.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    void handleCopyPinnedLines();
                                    setIsMoreMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                            >
                                {isPinCopyFeedbackVisible ? <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} className="shrink-0" />}
                                {isPinCopyFeedbackVisible ? 'Copied' : 'Copy pinned lines'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                handleDownload();
                                setIsMoreMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                            {isDownloadFeedbackVisible ? <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : <Download size={14} className="shrink-0" />}
                            {isDownloadFeedbackVisible ? 'Downloaded' : 'Download log'}
                        </button>
                        <div className="my-1 h-px bg-border" aria-hidden="true" />
                        <div className="flex items-center justify-between gap-2 px-2 py-1">
                            <span className="text-sm text-foreground">Zoom</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    title="Zoom out (Ctrl -)"
                                    aria-label="Zoom out"
                                    onClick={() => setFontSizePx(size => size - FONT_SIZE_STEP_PX)}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                                >
                                    <ZoomOut size={14} />
                                </button>
                                <button
                                    type="button"
                                    title="Reset zoom (Ctrl 0)"
                                    aria-label="Reset zoom"
                                    onClick={() => setFontSizePx(DEFAULT_LOG_BODY_FONT_SIZE_PX)}
                                    className="min-w-8 rounded px-1 text-center font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-primary"
                                >
                                    {fontSizePx}px
                                </button>
                                <button
                                    type="button"
                                    title="Zoom in (Ctrl +)"
                                    aria-label="Zoom in"
                                    onClick={() => setFontSizePx(size => size + FONT_SIZE_STEP_PX)}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                                >
                                    <ZoomIn size={14} />
                                </button>
                            </div>
                        </div>
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

            {/* The raw body stays mounted in tree mode and is hidden with CSS
                rather than unmounted: a hidden scroll container has no height,
                so its virtualizer renders no rows (near-zero cost), and this
                avoids the remount-then-scroll fragility that jumping from a
                tree row back into the raw log would otherwise hit. */}
            <div className={`flex min-h-0 flex-1 flex-col ${viewMode === 'tree' ? 'hidden' : ''}`}>
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
                                const isJumpTarget = highlightedJumpLineIndex === sourceLineIndex;
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
                                        transition-colors duration-300
                                        ${isActiveMatchLine
                                        ? 'bg-orange-500/10'
                                        : isJumpTarget
                                            ? 'bg-sky-500/15'
                                            : isErrorLine
                                                ? 'bg-red-500/10'
                                                : isPinned ? 'bg-emerald-500/10' : ''}
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
                                            style={{ fontSize: `${fontSizePx}px`, lineHeight: `${lineHeightPx}px` }}
                                            className={`
                                            sticky left-0 z-10 cursor-pointer select-none border-r pr-3 text-right
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
                                            style={{ fontSize: `${fontSizePx}px`, lineHeight: `${lineHeightPx}px` }}
                                            className={`px-3 text-muted-foreground ${isWrapEnabled ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
                                        >
                                            {renderHighlightedLine(line, deferredSearchQuery, deferredSearchPattern)}
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
            </div>

            {viewMode === 'tree' && (
                <LogCallTree
                    tree={callTree.tree}
                    aggregatedRoots={callTree.aggregatedRoots}
                    isParsing={callTree.isParsing}
                    showSkeleton={callTree.isParsing && shouldShowCallTreeSkeleton}
                    fontSizePx={fontSizePx}
                    lineHeightPx={lineHeightPx}
                    collapsedNodeIds={collapsedCallTreeNodes}
                    selectedNodeId={selectedCallTreeNodeId}
                    onSelectNode={setSelectedCallTreeNodeId}
                    onToggleCollapsed={onToggleCallTreeNode}
                    onSetCollapsedNodes={onSetCallTreeCollapsedNodes}
                    onJumpToSourceLine={handleJumpToSourceLine}
                />
            )}

            {/* Only rendered once there's a pin or an error to navigate - no
                permanent chrome for a feature that isn't in use on this log.
                One bar, bottom-right, instead of separate pin/error bars -
                the icon button flips which set is active when both exist. */}
            {viewMode === 'raw' && (sortedPinnedLines.length > 0 || errorSourceLineIndexes.length > 0) && (() => {
                const isErrorMode = navigatorMode === 'errors' && errorSourceLineIndexes.length > 0;
                const canToggleMode = sortedPinnedLines.length > 0 && errorSourceLineIndexes.length > 0;
                const activeCount = isErrorMode ? errorSourceLineIndexes.length : sortedPinnedLines.length;
                const activeIndex = isErrorMode ? activeErrorIndex : activePinIndex;
                const moveToActive = isErrorMode ? moveToError : moveToPin;

                return (
                    <div
                        className={`
                            absolute bottom-4 right-4 z-20 flex items-center gap-0.5 rounded-md border bg-popover/95
                            p-1 shadow-lg backdrop-blur-sm
                            ${isErrorMode ? 'border-red-500/30' : 'border-border'}
                        `}
                    >
                        <button
                            type="button"
                            title={canToggleMode ? (isErrorMode ? 'Switch to pinned lines' : 'Switch to errors') : undefined}
                            aria-label={canToggleMode ? (isErrorMode ? 'Switch to pinned lines' : 'Switch to errors') : (isErrorMode ? 'Errors' : 'Pinned lines')}
                            disabled={!canToggleMode}
                            onClick={() => setNavigatorMode(isErrorMode ? 'pins' : 'errors')}
                            className={`
                                rounded p-1
                                ${isErrorMode ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
                                ${canToggleMode ? 'hover:bg-muted' : 'cursor-default'}
                            `}
                        >
                            {isErrorMode ? <AlertTriangle size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                            type="button"
                            title={isErrorMode ? 'Previous error' : 'Previous pinned line'}
                            aria-label={isErrorMode ? 'Previous error' : 'Previous pinned line'}
                            onClick={() => moveToActive(-1)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        >
                            <ChevronUp size={14} />
                        </button>
                        <span className="min-w-8 px-1 text-center font-mono text-[11px] text-muted-foreground">
                            {activeIndex >= 0 ? activeIndex + 1 : '-'}/{activeCount}
                        </span>
                        <button
                            type="button"
                            title={isErrorMode ? 'Next error' : 'Next pinned line'}
                            aria-label={isErrorMode ? 'Next error' : 'Next pinned line'}
                            onClick={() => moveToActive(1)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        >
                            <ChevronDown size={14} />
                        </button>
                        {!isErrorMode && (
                            <>
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
                            </>
                        )}
                    </div>
                );
            })()}
        </section>
    );
}

export { LogBodyViewer };
