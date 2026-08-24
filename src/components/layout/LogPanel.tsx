import { AlertCircle, Clock3, FileText, HardDrive, X } from "lucide-react";
import React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoadingGate } from "@/hooks/useDelayedLoadingGate";
import { formatByteSize, countLogBodyLines } from "@/lib/logBodyMeta";
import { useLogBody } from "@/hooks/useLogBody";
import { useTableUIStore } from "@/store/tableUIStore";
import { LogBodyViewer } from "./LogBodyViewer";

const DEFAULT_PANEL_WIDTH = 768;
const MIN_PANEL_WIDTH = 480;
const MAX_PANEL_WIDTH_RATIO = 0.9;
// Stable reference so the store selector doesn't hand back a fresh `[]` on
// every render when there's no log/no pins yet - a new array reference each
// time would make every consuming useMemo/effect below think pins "changed".
const EMPTY_PINNED_LINES: number[] = [];
const EMPTY_COLLAPSED_NODES: number[] = [];

// Mirrors LogBodyViewer's real shape (toolbar + 4.5rem gutter/content grid)
// so the swap to real content doesn't visibly jump. Content-bar widths cycle
// through a fixed pattern rather than one size, reading as "lines of varying
// real code" instead of a uniform block.
const LOG_BODY_SKELETON_LINE_COUNT = 26;
const LOG_BODY_SKELETON_LINE_WIDTHS = [92, 64, 78, 45, 88, 55, 70, 38, 82, 60, 95, 50, 73, 42];

function LogBodySkeleton() {
    return (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
            {/* Mirrors the real toolbar's control run - mode switch, search,
                go-to-line, three icon toggles, then the labelled More button.
                Kept in step with LogBodyViewer's toolbar so the swap from
                skeleton to content doesn't visibly jump. */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <Skeleton className="h-8 w-[6.5rem] shrink-0 rounded-md" />
                <Skeleton className="h-8 min-w-0 flex-1 rounded-md" />
                <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
            </div>
            <div className="flex-1 overflow-hidden bg-sidebar py-1">
                {Array.from({ length: LOG_BODY_SKELETON_LINE_COUNT }, (_, index) => (
                    // NOTE: keep this grid in sync with LOG_LINE_NUMBER_COLUMN_PX
                    // and the row templates in LogBodyViewer.
                    <div key={index} className="grid grid-cols-[4.5rem_minmax(0,1fr)]" style={{ height: 24 }}>
                        <div className="flex items-center justify-end border-r border-border/70 pr-3">
                            <Skeleton className="h-3 w-4" />
                        </div>
                        <div className="flex items-center px-3">
                            <Skeleton
                                className="h-3"
                                style={{ width: `${LOG_BODY_SKELETON_LINE_WIDTHS[index % LOG_BODY_SKELETON_LINE_WIDTHS.length]}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LogPanel() {
    const selectedLog = useTableUIStore(state => state.selectedLog);
    const isLogPanelOpen = useTableUIStore(state => state.isLogPanelOpen);
    const setLogPanelOpen = useTableUIStore(state => state.setLogPanelOpen);
    const togglePinnedLine = useTableUIStore(state => state.togglePinnedLine);
    const clearPinnedLines = useTableUIStore(state => state.clearPinnedLines);
    const selectedLogId = selectedLog?.id ?? null;
    // Kept in tableUIStore (keyed by log id), not local to LogBodyViewer -
    // that component fully unmounts on close, so pins live one level up to
    // survive closing/reopening the panel and switching between logs.
    const pinnedLines = useTableUIStore(state => (
        selectedLogId ? state.pinnedLinesByLogId[selectedLogId] ?? EMPTY_PINNED_LINES : EMPTY_PINNED_LINES
    ));
    const logPanelFocusIntent = useTableUIStore(state => state.logPanelFocusIntent);
    const toggleCallTreeNode = useTableUIStore(state => state.toggleCallTreeNode);
    const setCallTreeCollapsedNodes = useTableUIStore(state => state.setCallTreeCollapsedNodes);
    const collapsedCallTreeNodes = useTableUIStore(state => (
        selectedLogId
            ? state.collapsedCallTreeNodesByLogId[selectedLogId] ?? EMPTY_COLLAPSED_NODES
            : EMPTY_COLLAPSED_NODES
    ));
    const {
        body: logBody,
        status: logBodyStatus,
        errorMessage: logBodyErrorMessage
    } = useLogBody(selectedLogId, isLogPanelOpen);
    const isLogBodyLoading = logBodyStatus === 'queued' || logBodyStatus === 'fetching';
    // Gates the skeleton's visibility only - a body already sitting in
    // IndexedDB resolves in a couple frames and shouldn't flash a skeleton at
    // all; a genuine Salesforce fetch that takes a beat should hold the
    // skeleton once shown rather than swap to content a frame later.
    const shouldShowBodySkeleton = useDelayedLoadingGate(!isLogBodyLoading);
    // The fade-in below should only play when there was something to fade
    // in FROM - a cached body that resolves in a couple frames never shows
    // the skeleton at all, so animating its arrival just adds a visible
    // 300ms delay to what should be an instant swap. Only a load that was
    // slow enough to actually show the skeleton earns the transition.
    const [didShowBodySkeleton, setDidShowBodySkeleton] = React.useState(false);

    // Split into two effects (rather than one with an if/else-if) so a
    // render where a new load just started AND the skeleton just became
    // visible can't have the reset silently win over the set - both need to
    // apply independently in commit order.
    React.useEffect(() => {
        if (isLogBodyLoading) {
            setDidShowBodySkeleton(false);
        }
    }, [isLogBodyLoading]);

    React.useEffect(() => {
        if (shouldShowBodySkeleton) {
            setDidShowBodySkeleton(true);
        }
    }, [shouldShowBodySkeleton]);
    const [panelWidth, setPanelWidth] = React.useState(DEFAULT_PANEL_WIDTH);
    const dragStartRef = React.useRef<{
        pointerX: number;
        panelWidth: number;
    } | null>(null);
    const closeButtonRef = React.useRef<HTMLButtonElement>(null);

    const clampPanelWidth = React.useCallback((width: number) => {
        const maxPanelWidth = Math.floor(window.innerWidth * MAX_PANEL_WIDTH_RATIO);

        return Math.min(Math.max(width, MIN_PANEL_WIDTH), maxPanelWidth);
    }, []);

    const logBodyMeta = React.useMemo(() => {
        return {
            lineCount: countLogBodyLines(logBody),
            size: formatByteSize(logBody.length)
        };
    }, [logBody]);

    React.useEffect(() => {
        if (!isLogPanelOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setLogPanelOpen(false);
            }
        }

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isLogPanelOpen, setLogPanelOpen]);

    // Focus is deliberately NOT taken here. A preview (Space, or a mouse
    // click) must leave focus in the list, or the arrow key pressed next gets
    // swallowed by the panel instead of moving the cursor. The 'body' case is
    // handled inside LogBodyViewer, which has to wait for the body to load
    // before there is a line to land on.

    React.useEffect(() => {
        if (!isLogPanelOpen) {
            return;
        }

        const handleResize = () => {
            setPanelWidth(width => clampPanelWidth(width));
        }

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        }
    }, [clampPanelWidth, isLogPanelOpen]);

    const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        dragStartRef.current = {
            pointerX: event.clientX,
            panelWidth
        };
    }

    const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStartRef.current) {
            return;
        }

        const dragDistance = dragStartRef.current.pointerX - event.clientX;

        setPanelWidth(clampPanelWidth(dragStartRef.current.panelWidth + dragDistance));
    }

    const handleResizePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        dragStartRef.current = null;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    const RESIZE_KEY_STEP = 24;

    const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setPanelWidth(width => clampPanelWidth(width + RESIZE_KEY_STEP));
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            setPanelWidth(width => clampPanelWidth(width - RESIZE_KEY_STEP));
        } else if (event.key === 'Home') {
            event.preventDefault();
            setPanelWidth(clampPanelWidth(MIN_PANEL_WIDTH));
        } else if (event.key === 'End') {
            event.preventDefault();
            setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH));
        }
    }

    if (!isLogPanelOpen || !selectedLog) {
        return null;
    }

    return (
        <aside
            aria-label="Selected log details"
            className="
                fixed right-0 top-0 z-20 flex h-screen flex-col
                border-l border-border bg-sidebar shadow-lg
            "
            style={{ width: `${panelWidth}px` }}
        >
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize log details panel"
                aria-valuenow={panelWidth}
                aria-valuemin={MIN_PANEL_WIDTH}
                aria-valuemax={Math.floor(window.innerWidth * MAX_PANEL_WIDTH_RATIO)}
                tabIndex={0}
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerEnd}
                onPointerCancel={handleResizePointerEnd}
                onKeyDown={handleResizeKeyDown}
                className="
                    absolute left-0 top-0 h-full w-2 -translate-x-1 cursor-col-resize
                    touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500
                    after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2
                    after:bg-transparent hover:after:bg-emerald-500/60
                "
            />

            <header className="flex h-13 items-center justify-between border-b border-border px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <h2 className="min-w-0 truncate text-base font-semibold leading-none text-primary font-sans">{selectedLog.operation}</h2>

                    {!isLogBodyLoading ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md border border-sky-300/70 bg-sky-100 px-2 py-1 text-xs leading-none text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                                <HardDrive size={13} />
                                <span className="font-mono">{logBodyMeta.size}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md border border-violet-300/70 bg-violet-100 px-2 py-1 text-xs leading-none text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                                <FileText size={13} />
                                <span className="font-mono">{logBodyMeta.lineCount.toLocaleString()}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/70 bg-amber-100 px-2 py-1 text-xs leading-none text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                                <Clock3 size={13} />
                                <span className="font-mono">{selectedLog.duration}</span>
                            </span>
                        </div>
                    ) : shouldShowBodySkeleton ? (
                        // Same shape as the real stat badges (not a generic
                        // "Loading..." pill) and gated by the same delayed-show
                        // rule as the body skeleton below - a cached body that
                        // resolves in a couple frames shows nothing here either,
                        // instead of flashing a placeholder for an instant.
                        <div className="flex shrink-0 items-center gap-1.5" aria-label="Loading log details">
                            <Skeleton className="h-[26px] w-16 rounded-md" />
                            <Skeleton className="h-[26px] w-14 rounded-md" />
                            <Skeleton className="h-[26px] w-12 rounded-md" />
                        </div>
                    ) : null}
                </div>

                <button
                    ref={closeButtonRef}
                    type="button"
                    aria-label="Close log details"
                    onClick={() => setLogPanelOpen(false)}
                    className="
                        ml-3 rounded-md p-1.5 text-muted-foreground transition-colors
                        hover:bg-muted hover:text-primary
                        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500
                    "
                >
                    <X size={18} />
                </button>
            </header>

            {isLogBodyLoading ? (
                // The body genuinely isn't ready yet, so this branch can't be
                // skipped outright (there's no content to show early) - only
                // *which* placeholder renders is gated, so a cache-hit that
                // resolves in a couple frames shows nothing instead of a
                // one-frame skeleton flash, while a real fetch that takes a
                // beat still gets the full skeleton once it's been gated in.
                shouldShowBodySkeleton ? <LogBodySkeleton key="skeleton" /> : <div className="flex-1 border-t border-border" />
            ) : logBodyStatus === 'failed' ? (
                <div className="flex flex-1 items-center justify-center border-t border-border">
                    <EmptyState
                        icon={AlertCircle}
                        tone="destructive"
                        title="Couldn't load log body"
                        description={logBodyErrorMessage ?? 'Something went wrong while fetching this log.'}
                    />
                </div>
            ) : (
                // Keyed separately from the skeleton above so this branch is a
                // real mount, not a re-render of the same element - that's
                // what makes the fade-in play once, right as real content
                // replaces the skeleton, instead of on every re-render. The
                // fade-in class itself is conditional on the skeleton having
                // actually shown - a cached body that resolves in a couple
                // frames should swap in instantly, not animate in over 300ms
                // for a "transition" the user never needed to see.
                <div
                    key="loaded"
                    className={`flex min-h-0 flex-1 flex-col ${didShowBodySkeleton ? 'animate-in fade-in-0 duration-300' : ''}`}
                >
                    <LogBodyViewer
                        body={logBody}
                        fileName={`${selectedLog.id}.log`}
                        logId={selectedLog.id}
                        shouldFocusOnOpen={logPanelFocusIntent === 'body'}
                        pinnedLines={pinnedLines}
                        onTogglePinnedLine={(sourceLineIndex) => togglePinnedLine(selectedLog.id, sourceLineIndex)}
                        onClearPinnedLines={() => clearPinnedLines(selectedLog.id)}
                        collapsedCallTreeNodes={collapsedCallTreeNodes}
                        onToggleCallTreeNode={(nodeId) => toggleCallTreeNode(selectedLog.id, nodeId)}
                        onSetCallTreeCollapsedNodes={(nodeIds) => setCallTreeCollapsedNodes(selectedLog.id, nodeIds)}
                    />
                </div>
            )}
        </aside>
    );
}

export { LogPanel };
