import { Check, Trash2 } from "lucide-react";
import React from "react";

import { useStorageUsage } from "@/hooks/useStorageUsage";
import { formatByteSize } from "@/lib/logBodyMeta";
import { useUIStore } from "@/store/uiStore";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;

// Number inputs work in the friendliest unit for each preference (seconds
// for the shorter ones, minutes for trace flag duration) and convert to/from
// milliseconds at the boundary - the store/persistence layer only ever deals
// in milliseconds.
const msToSeconds = (ms: number) => Math.round(ms / MS_PER_SECOND);
const secondsToMs = (seconds: number) => Math.round(seconds * MS_PER_SECOND);
const msToMinutes = (ms: number) => Math.round(ms / MS_PER_MINUTE);
const minutesToMs = (minutes: number) => Math.round(minutes * MS_PER_MINUTE);

type NumberFieldProps = {
    label: string;
    description: string;
    unit: string;
    value: number;
    min: number;
    onChange: (_value: number) => void;
}

function NumberField({ label, description, unit, value, min, onChange }: NumberFieldProps) {
    return (
        <label className="flex items-center justify-between gap-4 py-1">
            <span className="flex flex-col gap-0.5">
                <span className="text-sm text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
                <input
                    type="number"
                    min={min}
                    step="1"
                    value={value}
                    onChange={(e) => {
                        const nextValue = Number.parseFloat(e.target.value);

                        if (!Number.isNaN(nextValue) && nextValue >= min) {
                            onChange(nextValue);
                        }
                    }}
                    // Native up/down spinners don't match this app's input styling
                    // anywhere else - hide them (both engines) and keep the value
                    // editable only via typing or the OS's own numeric keypad.
                    className="
                        h-8 w-20 rounded-md border-0 bg-input/80 px-2 text-right text-sm shadow-xs outline-none
                        transition-[color,box-shadow] [appearance:textfield] focus-visible:ring-[3px] focus-visible:ring-ring/50
                        [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
                    "
                />
                <span className="w-8 text-xs text-muted-foreground">{unit}</span>
            </span>
        </label>
    );
}

// Status-tone thresholds mirror the existing governor-limit usage grid
// (LogBodyViewer's limit summary) rather than introducing a new color rule -
// same red/amber/emerald bands, same meaning ("getting close to a cap").
const getUsageToneClassName = (usageRatio: number) => {
    if (usageRatio >= 0.95) {
        return 'text-red-700 dark:text-red-400';
    }

    if (usageRatio >= 0.75) {
        return 'text-amber-700 dark:text-amber-400';
    }

    return 'text-emerald-700 dark:text-emerald-400';
}

const getUsageStrokeClassName = (usageRatio: number) => {
    if (usageRatio >= 0.95) {
        return 'stroke-red-500';
    }

    if (usageRatio >= 0.75) {
        return 'stroke-amber-500';
    }

    return 'stroke-emerald-500';
}

const DONUT_SIZE_PX = 88;
const DONUT_STROKE_WIDTH_PX = 9;
const DONUT_RADIUS = (DONUT_SIZE_PX - DONUT_STROKE_WIDTH_PX) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

// A single measurement (bytes used out of a cap) reads better as a progress
// ring than a multi-slice pie - there's no categorical breakdown to compare,
// just "how full is this", so a legend/second color would only add noise.
function StorageUsageDonut({ usedBytes, maxBytes }: { usedBytes: number; maxBytes: number }) {
    const usageRatio = maxBytes > 0 ? Math.min(1, usedBytes / maxBytes) : 0;
    const dashOffset = DONUT_CIRCUMFERENCE * (1 - usageRatio);

    return (
        <div className="relative shrink-0" style={{ width: DONUT_SIZE_PX, height: DONUT_SIZE_PX }}>
            <svg
                width={DONUT_SIZE_PX}
                height={DONUT_SIZE_PX}
                viewBox={`0 0 ${DONUT_SIZE_PX} ${DONUT_SIZE_PX}`}
                className="-rotate-90"
                role="img"
                aria-label={`${formatByteSize(usedBytes)} of ${formatByteSize(maxBytes)} log storage used`}
            >
                <circle
                    cx={DONUT_SIZE_PX / 2}
                    cy={DONUT_SIZE_PX / 2}
                    r={DONUT_RADIUS}
                    fill="none"
                    strokeWidth={DONUT_STROKE_WIDTH_PX}
                    className="stroke-muted"
                />
                <circle
                    cx={DONUT_SIZE_PX / 2}
                    cy={DONUT_SIZE_PX / 2}
                    r={DONUT_RADIUS}
                    fill="none"
                    strokeWidth={DONUT_STROKE_WIDTH_PX}
                    strokeLinecap="round"
                    strokeDasharray={DONUT_CIRCUMFERENCE}
                    strokeDashoffset={dashOffset}
                    className={`transition-[stroke-dashoffset] duration-500 ease-out ${getUsageStrokeClassName(usageRatio)}`}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`font-mono text-sm font-semibold ${getUsageToneClassName(usageRatio)}`}>
                    {Math.round(usageRatio * 100)}%
                </span>
            </div>
        </div>
    );
}

function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-sm text-foreground">{label}</span>
            <span className="font-mono text-sm text-muted-foreground">{value}</span>
        </div>
    );
}

function CleanupTab() {
    const isOpen = useUIStore(state => state.isSettingsModalOpen);
    const {
        usage,
        isLoading,
        isCleaningUp,
        errorMessage,
        isConnected,
        setRetentionDays,
        runCleanupNow
    } = useStorageUsage(isOpen);
    const [isCleanupFeedbackVisible, setIsCleanupFeedbackVisible] = React.useState(false);
    const cleanupFeedbackTimeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        return () => {
            if (cleanupFeedbackTimeoutRef.current) {
                window.clearTimeout(cleanupFeedbackTimeoutRef.current);
            }
        };
    }, []);

    const handleCleanupNow = async () => {
        await runCleanupNow();
        setIsCleanupFeedbackVisible(true);

        if (cleanupFeedbackTimeoutRef.current) {
            window.clearTimeout(cleanupFeedbackTimeoutRef.current);
        }

        cleanupFeedbackTimeoutRef.current = window.setTimeout(() => {
            setIsCleanupFeedbackVisible(false);
        }, 1200);
    }

    if (!isConnected) {
        return (
            <p className="py-6 text-center text-sm text-muted-foreground">
                Connect to Salesforce to view storage usage.
            </p>
        );
    }

    if (isLoading && !usage) {
        return (
            <p className="py-6 text-center text-sm text-muted-foreground">
                Loading storage usage...
            </p>
        );
    }

    if (errorMessage && !usage) {
        return (
            <p className="py-6 text-center text-sm text-destructive">
                {errorMessage}
            </p>
        );
    }

    if (!usage) {
        return null;
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-md border border-border bg-background p-3">
                <StorageUsageDonut usedBytes={usage.bodyBytes} maxBytes={usage.maxBodyBytes} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">Log body storage</span>
                    <span className="font-mono text-xs text-muted-foreground">
                        {formatByteSize(usage.bodyBytes)} of {formatByteSize(usage.maxBodyBytes)} used
                    </span>
                    <span className="text-xs text-muted-foreground">
                        Oldest-accessed bodies are evicted first once this fills up.
                    </span>
                </div>
                <button
                    type="button"
                    disabled={isCleaningUp}
                    onClick={() => void handleCleanupNow()}
                    className="
                        flex shrink-0 items-center gap-1.5 self-start rounded-md border-0 bg-input/80 px-2.5 py-1.5
                        text-xs font-medium text-muted-foreground transition-colors
                        hover:bg-input/90 hover:text-primary disabled:pointer-events-none disabled:opacity-60
                        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500
                        dark:bg-input/80 dark:hover:bg-input/90
                    "
                >
                    {isCleanupFeedbackVisible ? (
                        <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                    ) : (
                        <Trash2 size={13} className={isCleaningUp ? 'animate-pulse' : ''} />
                    )}
                    {isCleanupFeedbackVisible ? 'Cleaned up' : isCleaningUp ? 'Cleaning...' : 'Clean up now'}
                </button>
            </div>

            <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-background px-3">
                <StatRow label="Cached logs" value={`${usage.logCount.toLocaleString()} / ${usage.maxLogCount.toLocaleString()}`} />
                <StatRow label="Cached log bodies" value={usage.bodyCount.toLocaleString()} />
            </div>

            <div className="border-t border-border pt-3">
                <NumberField
                    label="Retention window"
                    description="Logs and bodies older than this are deleted automatically, once a day."
                    unit="days"
                    min={1}
                    value={usage.retentionDays}
                    onChange={(days) => void setRetentionDays(days)}
                />
            </div>
        </div>
    );
}

export const SettingsSheet = () => {
    const isOpen = useUIStore(state => state.isSettingsModalOpen);
    const setOpen = useUIStore(state => state.setSettingsModalOpen);
    const isInsightsVisible = useUIStore(state => state.isInsightsVisible);
    const toggleInsightsVisible = useUIStore(state => state.toggleInsightsVisible);
    const pollingPreferences = useUIStore(state => state.pollingPreferences);
    const updatePollingPreferences = useUIStore(state => state.updatePollingPreferences);

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            <DialogContent className="font-sans">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Preferences for this extension. Changes apply immediately.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="general" className="px-6">
                    <TabsList className="w-full">
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="polling">Live Streaming</TabsTrigger>
                        <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
                    </TabsList>

                    {/* Fixed height, not max-height - the Cleanup tab (donut +
                        stat rows + a field) is taller than General (one
                        switch), so a max-height would let the dialog itself
                        grow/shrink on every tab switch instead of the tab
                        panel just scrolling within a stable frame. */}
                    <div className="h-[22rem] overflow-y-auto">
                        <TabsContent value="general" className="flex flex-col gap-2">
                            <label className="flex items-center justify-between gap-3 py-1">
                                <span className="text-sm text-foreground">Show insights section</span>
                                <Switch
                                    checked={isInsightsVisible}
                                    onCheckedChange={toggleInsightsVisible}
                                />
                            </label>
                        </TabsContent>

                        <TabsContent value="polling" className="flex flex-col gap-1">
                            <NumberField
                                label="Poll interval"
                                description="How often new logs are fetched while live streaming."
                                unit="sec"
                                min={1}
                                value={msToSeconds(pollingPreferences.pollIntervalMs)}
                                onChange={(seconds) => updatePollingPreferences({ pollIntervalMs: secondsToMs(seconds) })}
                            />

                            <NumberField
                                label="Idle timeout"
                                description="Pause live streaming after this long with no activity."
                                unit="sec"
                                min={5}
                                value={msToSeconds(pollingPreferences.idleTimeoutMs)}
                                onChange={(seconds) => updatePollingPreferences({ idleTimeoutMs: secondsToMs(seconds) })}
                            />

                            <NumberField
                                label="Trace flag duration"
                                description="How long a trace flag stays active once enabled."
                                unit="min"
                                min={1}
                                value={msToMinutes(pollingPreferences.traceFlagDurationMs)}
                                onChange={(minutes) => updatePollingPreferences({ traceFlagDurationMs: minutesToMs(minutes) })}
                            />

                            <NumberField
                                label="Slow log threshold"
                                description={'Requests slower than this count toward "Slow Reqs" in Insights.'}
                                unit="sec"
                                min={1}
                                value={msToSeconds(pollingPreferences.slowLogThresholdMs)}
                                onChange={(seconds) => updatePollingPreferences({ slowLogThresholdMs: secondsToMs(seconds) })}
                            />
                        </TabsContent>

                        <TabsContent value="cleanup">
                            <CleanupTab />
                        </TabsContent>
                    </div>
                </Tabs>

                <DialogFooter>
                    <p className="text-xs text-muted-foreground">LogStream</p>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
