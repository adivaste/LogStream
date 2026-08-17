import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronRight, ListTree } from "lucide-react";
import React from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea, ScrollAreaScrollbar, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    type CallNode,
    type CallNodeKind,
    type CallTreeParseResult,
    collectCollapsibleNodeIds
} from "@/lib/callTreeParser";
import { getApexTokenClassName, LOG_VIEWER_OVERSCAN } from "@/lib/logBodyHighlight";
import { getNextLogIndex } from "@/lib/logListConfig";

// Maps each node kind onto the token the shared colour map already knows, so
// there is exactly one source of truth for "SOQL is sky, DML is amber". The
// kind dot then uses `bg-current` inside the coloured text span rather than a
// parallel bg-* map, which removes the last place the two could drift.
const KIND_COLOR_TOKEN: Record<CallNodeKind, string> = {
    execution: 'METHOD_ENTRY',
    codeUnit: 'METHOD_ENTRY',
    method: 'METHOD_ENTRY',
    soql: 'SOQL_EXECUTE_BEGIN',
    dml: 'DML_BEGIN',
    callout: 'METHOD_ENTRY',
    flow: 'METHOD_ENTRY'
};

const INDENT_BASE_PX = 8;
const INDENT_PER_DEPTH_PX = 12;
// Past this, depth stops eating the name column; the caret and the tree's
// own shape still convey nesting.
const MAX_INDENT_PX = 160;

// A fully-expanded 20k-frame log is fine for the virtualizer but useless to
// read, so past this size the tree opens collapsed below the top level.
const AUTO_COLLAPSE_NODE_THRESHOLD = 2000;
const AUTO_COLLAPSE_FROM_DEPTH = 2;

const SKELETON_ROW_COUNT = 22;
const SKELETON_LABEL_WIDTHS = [68, 42, 80, 55, 34, 72, 48, 62];

type FlatCallTreeRow = {
    node: CallNode;
    hasChildren: boolean;
    isCollapsed: boolean;
}

type LogCallTreeProps = {
    tree: CallTreeParseResult;
    aggregatedRoots: CallNode[];
    isParsing: boolean;
    showSkeleton: boolean;
    fontSizePx: number;
    lineHeightPx: number;
    collapsedNodeIds: number[];
    onToggleCollapsed: (_nodeId: number) => void;
    onSetCollapsedNodes: (_nodeIds: number[]) => void;
    onJumpToSourceLine: (_sourceLineIndex: number) => void;
}

const formatMs = (milliseconds: number) => {
    if (milliseconds >= 1000) {
        return `${(milliseconds / 1000).toFixed(2)}s`;
    }

    if (milliseconds >= 10) {
        return `${Math.round(milliseconds)}ms`;
    }

    if (milliseconds > 0) {
        return `${milliseconds.toFixed(1)}ms`;
    }

    return '0ms';
}

// Escalates on the same red/amber/emerald ladder the governor-limit strip
// uses, so "this is the expensive one" reads identically across the app.
const getSelfBarClassName = (selfRatio: number) => {
    if (selfRatio >= 0.5) {
        return 'bg-red-500/20';
    }

    if (selfRatio >= 0.25) {
        return 'bg-amber-500/20';
    }

    return 'bg-emerald-500/15';
}

function CallTreeSkeleton({ lineHeightPx }: { lineHeightPx: number }) {
    return (
        <div className="flex-1 overflow-hidden bg-sidebar py-1" aria-label="Building call tree">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem] items-center"
                    style={{ height: lineHeightPx }}
                >
                    {/* The staggered indent is what makes this read as a tree
                        rather than a flat list while it's loading. */}
                    <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: `${INDENT_BASE_PX + (index % 5) * INDENT_PER_DEPTH_PX}px` }}
                    >
                        <Skeleton className="size-3 shrink-0 rounded" />
                        <Skeleton
                            className="h-3"
                            style={{ width: `${SKELETON_LABEL_WIDTHS[index % SKELETON_LABEL_WIDTHS.length]}%` }}
                        />
                    </div>
                    <div />
                    <div className="flex justify-end pr-2"><Skeleton className="h-3 w-8" /></div>
                    <div className="flex justify-end pr-3"><Skeleton className="h-3 w-8" /></div>
                </div>
            ))}
        </div>
    );
}

function LogCallTree({
    tree,
    aggregatedRoots,
    isParsing,
    showSkeleton,
    fontSizePx,
    lineHeightPx,
    collapsedNodeIds,
    onToggleCollapsed,
    onSetCollapsedNodes,
    onJumpToSourceLine
}: LogCallTreeProps) {
    const scrollParentRef = React.useRef<HTMLDivElement | null>(null);
    const rowRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
    const pendingFocusNodeIdRef = React.useRef<number | null>(null);
    const autoCollapsedTreeRef = React.useRef<CallNode[] | null>(null);
    const [focusedNodeId, setFocusedNodeId] = React.useState<number | null>(null);

    const collapsedNodeIdSet = React.useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);

    // A very large tree opens collapsed below the top level. Keyed on the
    // tree object so this runs once per parse, not on every collapse toggle.
    React.useEffect(() => {
        if (autoCollapsedTreeRef.current === aggregatedRoots) {
            return;
        }

        autoCollapsedTreeRef.current = aggregatedRoots;

        if (tree.nodeCount > AUTO_COLLAPSE_NODE_THRESHOLD) {
            onSetCollapsedNodes(collectCollapsibleNodeIds(aggregatedRoots, AUTO_COLLAPSE_FROM_DEPTH));
        }
    }, [aggregatedRoots, onSetCollapsedNodes, tree.nodeCount]);

    // Flattening the visible (non-collapsed) nodes mirrors how the raw view
    // derives `visibleLineIndexes` - the virtualizer only ever sees a flat
    // array, and nesting is expressed by padding rather than nested DOM.
    const flatRows = React.useMemo(() => {
        const rows: FlatCallTreeRow[] = [];
        const walk = (nodes: CallNode[]) => {
            for (const node of nodes) {
                const hasChildren = node.children.length > 0;
                const isCollapsed = collapsedNodeIdSet.has(node.id);

                rows.push({ node, hasChildren, isCollapsed });

                if (hasChildren && !isCollapsed) {
                    walk(node.children);
                }
            }
        };

        walk(aggregatedRoots);

        return rows;
    }, [aggregatedRoots, collapsedNodeIdSet]);

    const flatIndexByNodeId = React.useMemo(() => {
        const map = new Map<number, number>();

        flatRows.forEach((row, index) => map.set(row.node.id, index));

        return map;
    }, [flatRows]);

    const rowVirtualizer = useVirtualizer({
        count: flatRows.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => lineHeightPx,
        overscan: LOG_VIEWER_OVERSCAN
    });

    const virtualRows = rowVirtualizer.getVirtualItems();

    const setRowRef = React.useCallback((nodeId: number, element: HTMLDivElement | null) => {
        rowRefs.current[nodeId] = element;
    }, []);

    const focusMountedRow = React.useCallback((nodeId: number) => {
        requestAnimationFrame(() => {
            rowRefs.current[nodeId]?.focus({ preventScroll: true });
        });
    }, []);

    // Same two-step focus dance the raw view uses: a virtualized row often
    // isn't in the DOM yet when focus is requested, so this retries once the
    // mounted set actually changes.
    React.useEffect(() => {
        const pendingNodeId = pendingFocusNodeIdRef.current;

        if (pendingNodeId === null || !rowRefs.current[pendingNodeId]) {
            return;
        }

        pendingFocusNodeIdRef.current = null;
        focusMountedRow(pendingNodeId);
    }, [focusMountedRow, virtualRows]);

    const focusRowAtFlatIndex = React.useCallback((flatIndex: number) => {
        const row = flatRows[flatIndex];

        if (!row) {
            return;
        }

        setFocusedNodeId(row.node.id);
        pendingFocusNodeIdRef.current = row.node.id;
        rowVirtualizer.scrollToIndex(flatIndex, { align: 'auto' });
        focusMountedRow(row.node.id);
    }, [flatRows, focusMountedRow, rowVirtualizer]);

    const handleRowKeyDown = React.useCallback((
        event: React.KeyboardEvent<HTMLDivElement>,
        row: FlatCallTreeRow,
        flatIndex: number
    ) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onJumpToSourceLine(row.node.sourceLineIndex);
            return;
        }

        if (event.key === 'ArrowRight') {
            if (row.hasChildren && row.isCollapsed) {
                event.preventDefault();
                onToggleCollapsed(row.node.id);
                return;
            }

            if (row.hasChildren) {
                event.preventDefault();
                focusRowAtFlatIndex(flatIndex + 1);
                return;
            }

            return;
        }

        if (event.key === 'ArrowLeft') {
            if (row.hasChildren && !row.isCollapsed) {
                event.preventDefault();
                onToggleCollapsed(row.node.id);
                return;
            }

            if (row.node.parentId !== null) {
                const parentIndex = flatIndexByNodeId.get(row.node.parentId);

                if (parentIndex !== undefined) {
                    event.preventDefault();
                    focusRowAtFlatIndex(parentIndex);
                }
            }

            return;
        }

        const nextIndex = getNextLogIndex({
            currentIndex: flatIndex,
            key: event.key,
            totalLogs: flatRows.length
        });

        if (nextIndex === flatIndex) {
            return;
        }

        event.preventDefault();
        focusRowAtFlatIndex(nextIndex);
    }, [flatIndexByNodeId, flatRows.length, focusRowAtFlatIndex, onJumpToSourceLine, onToggleCollapsed]);

    // Exactly one row is Tab-reachable, falling back to the first row when the
    // previously focused node is inside a subtree that has since collapsed.
    const rovingNodeId = focusedNodeId !== null && flatIndexByNodeId.has(focusedNodeId)
        ? focusedNodeId
        : flatRows[0]?.node.id ?? null;

    if (showSkeleton) {
        return <CallTreeSkeleton lineHeightPx={lineHeightPx} />;
    }

    if (isParsing) {
        // Under the skeleton's show-delay: render an empty surface rather than
        // flashing a placeholder for a tree that's about to appear anyway.
        return <div className="flex-1 bg-sidebar" />;
    }

    if (tree.status === 'empty' || flatRows.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center bg-sidebar">
                <EmptyState
                    icon={ListTree}
                    title="No call tree in this log"
                    description="This log has no method entry events to build a tree from. Raise the Apex Code trace level to FINE or finer and re-run the transaction to capture one."
                />
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {tree.truncated && (
                <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 font-sans">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                        This log was truncated mid-transaction. Frames that never returned are marked with an amber bar and show estimated totals.
                    </p>
                </div>
            )}

            {!tree.hasMethodData && (
                <div className="border-b border-border bg-muted/30 px-4 py-2 font-sans">
                    <p className="text-xs leading-5 text-muted-foreground">
                        Showing queries and DML only — this log has no method entry events. Raise the Apex Code trace level to FINE or finer for full call depth.
                    </p>
                </div>
            )}

            <ScrollArea className="min-h-0 flex-1 bg-sidebar font-mono text-sm">
                <ScrollAreaViewport ref={scrollParentRef} className="overscroll-contain">
                    <div
                        role="tree"
                        aria-label="Apex call tree"
                        className="relative"
                        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                    >
                        {virtualRows.map((virtualRow) => {
                            const row = flatRows[virtualRow.index];

                            if (!row) {
                                return null;
                            }

                            const node = row.node;
                            const indentPx = Math.min(
                                INDENT_BASE_PX + node.depth * INDENT_PER_DEPTH_PX,
                                MAX_INDENT_PX
                            );
                            const selfRatio = tree.totalMs > 0 ? node.selfMs / tree.totalMs : 0;
                            const kindClassName = getApexTokenClassName(KIND_COLOR_TOKEN[node.kind]);

                            return (
                                <div
                                    key={node.id}
                                    data-index={virtualRow.index}
                                    ref={(element) => setRowRef(node.id, element)}
                                    role="treeitem"
                                    aria-level={node.depth + 1}
                                    aria-expanded={row.hasChildren ? !row.isCollapsed : undefined}
                                    tabIndex={node.id === rovingNodeId ? 0 : -1}
                                    title={node.label}
                                    onClick={() => onJumpToSourceLine(node.sourceLineIndex)}
                                    onFocus={() => setFocusedNodeId(node.id)}
                                    onKeyDown={(event) => handleRowKeyDown(event, row, virtualRow.index)}
                                    className={`
                                        absolute left-0 top-0 grid w-full cursor-pointer select-none items-center
                                        grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem]
                                        outline-none hover:bg-muted/50
                                        focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500
                                    `}
                                    style={{
                                        height: `${lineHeightPx}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                        fontSize: `${fontSizePx}px`,
                                        lineHeight: `${lineHeightPx}px`,
                                        // Same inset-bar language pins and errors already use in
                                        // the raw view, in a third colour for "never returned".
                                        boxShadow: node.truncated
                                            ? 'inset 3px 0 0 0 var(--color-amber-500)'
                                            : undefined
                                    }}
                                >
                                    <div
                                        className={`flex min-w-0 items-center gap-1.5 ${kindClassName}`}
                                        style={{ paddingLeft: `${indentPx}px` }}
                                    >
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            aria-hidden={!row.hasChildren}
                                            aria-label={row.isCollapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onToggleCollapsed(node.id);
                                            }}
                                            className={`
                                                flex size-4 shrink-0 items-center justify-center rounded
                                                text-muted-foreground hover:text-primary
                                                ${row.hasChildren ? '' : 'invisible'}
                                            `}
                                        >
                                            <ChevronRight
                                                size={12}
                                                className={`transition-transform duration-150 ${row.isCollapsed ? '' : 'rotate-90'}`}
                                            />
                                        </button>

                                        {/* bg-current picks up the kind colour from the wrapper,
                                            so the dot can never drift from the text colour. */}
                                        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />

                                        <span className="min-w-0 truncate">{node.label}</span>

                                        {node.callCount > 1 && (
                                            <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                                                ×{node.callCount}
                                            </span>
                                        )}
                                    </div>

                                    <div className="pr-2 text-right text-[11px] tabular-nums text-muted-foreground/70">
                                        {node.rowCount !== null ? `${node.rowCount}r` : ''}
                                    </div>

                                    <div
                                        className="pr-2 text-right tabular-nums text-muted-foreground"
                                        title={node.truncated ? 'Frame never returned; total estimated to end of log' : undefined}
                                    >
                                        {node.truncated ? '~' : ''}{formatMs(node.totalMs)}
                                    </div>

                                    {/* The self-time bar is a background layer inside this cell,
                                        right-anchored - it never needs a column of its own, which
                                        is what keeps the row readable at the 480px min width. */}
                                    <div className="relative pr-3 text-right tabular-nums text-primary">
                                        <span
                                            aria-hidden="true"
                                            className={`absolute inset-y-[3px] right-0 rounded-sm ${getSelfBarClassName(selfRatio)}`}
                                            style={{ width: `${Math.min(100, selfRatio * 100)}%` }}
                                        />
                                        <span className="relative">{formatMs(node.selfMs)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollAreaViewport>
                <ScrollAreaScrollbar />
            </ScrollArea>
        </div>
    );
}

export { LogCallTree };
