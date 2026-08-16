import { Activity, RefreshCw } from "lucide-react";

import { useApiBudget } from "@/hooks/useApiBudget";
import { Button } from "@/components/ui/button";
import { PopoverContent } from "@/components/ui/popover";
import type { ApiBudgetState } from "@/types/workerMessages";

type ApiLimitPopoverProps = {
    isOpen: boolean;
}

const formatNumber = (value: number | null) => {
    return value === null ? '-' : value.toLocaleString();
}

const getUsedPercent = (used: number | null, limit: number | null) => {
    if (used === null || limit === null || limit <= 0) {
        return 0;
    }

    return Math.min(100, Math.max(0, (used / limit) * 100));
}

const getStateLabel = (state: ApiBudgetState) => {
    if (state === 'ok') return 'Healthy';
    if (state === 'warn') return 'Watch';
    if (state === 'throttle') return 'Throttle';
    if (state === 'exceeded') return 'Exceeded';
    return 'Unknown';
}

const getStateClassName = (state: ApiBudgetState) => {
    if (state === 'ok') {
        return 'bg-emerald-500';
    }

    if (state === 'warn') {
        return 'bg-amber-500';
    }

    if (state === 'throttle' || state === 'exceeded') {
        return 'bg-red-500';
    }

    return 'bg-muted-foreground';
}

function ApiLimitPopover({ isOpen }: ApiLimitPopoverProps) {
    const {
        budget,
        isLoading,
        errorMessage,
        isConnected,
        refreshBudget
    } = useApiBudget(isOpen);
    const usedPercent = getUsedPercent(budget?.used ?? null, budget?.limit ?? null);
    const remaining = budget?.used !== null && budget?.limit !== null && budget
        ? Math.max(0, budget.limit - budget.used)
        : null;

    return (
        <PopoverContent
            align="end"
            sideOffset={10}
            className="w-[22rem] overflow-hidden rounded-lg border-border bg-background p-0 font-sans shadow-xl"
        >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5 font-sans">
                <div>
                    <h2 className="text-sm font-semibold leading-5 text-primary">Limit Usage</h2>
                    <p className="text-xs leading-4 text-muted-foreground">Salesforce API consumption</p>
                </div>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Refresh limit usage"
                    disabled={isLoading || !isConnected}
                    onClick={() => void refreshBudget()}
                    className="text-muted-foreground hover:text-primary"
                >
                    <RefreshCw className={isLoading ? 'animate-spin' : ''} />
                </Button>
            </div>

            <div className="space-y-3 p-3 font-sans">
                <div className="rounded-md border border-border bg-muted/30 p-3 font-sans">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${getStateClassName(budget?.state ?? 'unknown')}`} />
                            <span className="text-sm font-medium text-primary">Daily API Requests</span>
                        </div>
                        <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                            {getStateLabel(budget?.state ?? 'unknown')}
                        </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        {/* Full-width bar scaled via transform instead of animating
                            `width` - width/layout-property transitions force a
                            layout recalculation on every frame, transform doesn't. */}
                        <div
                            className="h-full w-full origin-left rounded-full bg-emerald-500 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
                            style={{ transform: `scaleX(${usedPercent / 100})` }}
                        />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">{usedPercent.toFixed(1)}% used</span>
                        <span>{formatNumber(remaining)} remaining</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-border bg-background p-2 font-sans">
                        <div className="text-[11px] text-muted-foreground">Used</div>
                        <div className="mt-1 font-mono text-sm text-primary">{formatNumber(budget?.used ?? null)}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background p-2 font-sans">
                        <div className="text-[11px] text-muted-foreground">Remaining</div>
                        <div className="mt-1 font-mono text-sm text-primary">{formatNumber(remaining)}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background p-2 font-sans">
                        <div className="text-[11px] text-muted-foreground">Limit</div>
                        <div className="mt-1 font-mono text-sm text-primary">{formatNumber(budget?.limit ?? null)}</div>
                    </div>
                </div>

                {/* Fixed min-height keeps this footer the same size whether it's
                    showing the plain status line or the taller bordered error
                    box - otherwise the popover's overall height (and therefore
                    its position, since Radix repositions on resize) shifted
                    right after the budget fetch resolved. */}
                <div className="flex min-h-9 items-center font-sans text-xs">
                    {errorMessage ? (
                        <div className="w-full rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                            {errorMessage}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Activity size={13} />
                            <span>Updates on open. Refresh uses one Salesforce API call.</span>
                        </div>
                    )}
                </div>
            </div>
        </PopoverContent>
    );
}

export { ApiLimitPopover };
