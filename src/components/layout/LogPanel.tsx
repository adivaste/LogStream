import { Clock3, FileText, HardDrive, X } from "lucide-react";
import React from "react";
import { formatByteSize, countLogBodyLines } from "@/lib/logBodyMeta";
import { useLogBody } from "@/hooks/useLogBody";
import { useTableUIStore } from "@/store/tableUIStore";
import { LogBodyViewer } from "./LogBodyViewer";

const DEFAULT_PANEL_WIDTH = 768;
const MIN_PANEL_WIDTH = 480;
const MAX_PANEL_WIDTH_RATIO = 0.9;

function LogPanel() {
    const selectedLog = useTableUIStore(state => state.selectedLog);
    const isLogPanelOpen = useTableUIStore(state => state.isLogPanelOpen);
    const setLogPanelOpen = useTableUIStore(state => state.setLogPanelOpen);
    const selectedLogId = selectedLog?.id ?? null;
    const {
        body: logBody,
        status: logBodyStatus,
        errorMessage: logBodyErrorMessage
    } = useLogBody(selectedLogId, isLogPanelOpen);
    const isLogBodyLoading = logBodyStatus === 'queued' || logBodyStatus === 'fetching';
    const [panelWidth, setPanelWidth] = React.useState(DEFAULT_PANEL_WIDTH);
    const dragStartRef = React.useRef<{
        pointerX: number;
        panelWidth: number;
    } | null>(null);

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

    if (!isLogPanelOpen || !selectedLog) {
        return null;
    }

    return (
        <aside
            aria-label="Selected log details"
            className="
                fixed right-0 top-0 z-20 flex h-screen flex-col antialiased
                border-l border-border bg-background shadow-lg
            "
            style={{ width: `${panelWidth}px` }}
        >
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize log details panel"
                tabIndex={0}
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerEnd}
                onPointerCancel={handleResizePointerEnd}
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
                    ) : (
                        <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs leading-none text-muted-foreground">
                            Loading body...
                        </span>
                    )}
                </div>

                <button
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
                <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-border">
                    <div
                        aria-hidden="true"
                        className="
                            h-6 w-6 animate-spin rounded-full border-[3px]
                            border-emerald-500/20 border-t-emerald-400 border-r-emerald-400
                        "
                    />
                    <span className="text-sm text-muted-foreground font-sans">
                        Loading log body...
                    </span>
                </div>
            ) : logBodyStatus === 'failed' ? (
                <div className="flex flex-1 items-center justify-center border-t border-border px-8 text-center text-sm text-destructive">
                    {logBodyErrorMessage ?? 'Failed to load log body.'}
                </div>
            ) : (
                <LogBodyViewer
                    body={logBody}
                    fileName={`${selectedLog.id}.log`}
                />
            )}
        </aside>
    );
}

export { LogPanel };
