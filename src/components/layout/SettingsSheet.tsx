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

                <div className="grid max-h-[60vh] grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto px-6">
                    <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            UI
                        </h3>
                        <label className="flex items-center justify-between gap-3 py-1">
                            <span className="text-sm text-foreground">Show insights section</span>
                            <Switch
                                checked={isInsightsVisible}
                                onCheckedChange={toggleInsightsVisible}
                            />
                        </label>
                    </section>

                    <section className="col-span-2 flex flex-col gap-1 border-t border-border pt-4">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Live Streaming
                        </h3>

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
                    </section>
                </div>

                <DialogFooter>
                    <p className="text-xs text-muted-foreground">LogStream</p>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
