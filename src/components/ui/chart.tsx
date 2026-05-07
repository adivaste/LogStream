import * as React from "react";
import { ResponsiveContainer, Tooltip, type TooltipProps } from "recharts";

import { cn } from "@/lib/utils";

type ChartConfigItem = {
    label?: string;
    color?: string;
};

type ChartConfig = Record<string, ChartConfigItem>;

function ChartContainer({
    config,
    className,
    children,
}: {
    config: ChartConfig;
    className?: string;
    children: React.ReactElement;
}) {
    const chartVars = React.useMemo(() => {
        const cssVars: React.CSSProperties = {};
        for (const [key, value] of Object.entries(config)) {
            if (value.color) {
                cssVars[`--color-${key}` as keyof React.CSSProperties] = value.color;
            }
        }
        return cssVars;
    }, [config]);

    return (
        <div data-slot="chart" className={cn("h-full w-full", className)} style={chartVars}>
            <ResponsiveContainer width="100%" height="100%">
                {children}
            </ResponsiveContainer>
        </div>
    );
}

const ChartTooltip = Tooltip;

function ChartTooltipContent({
    active,
    payload,
    label,
}: TooltipProps<number, string>) {
    if (!active || !payload?.length) {
        return null;
    }

    const value = payload[0]?.value;

    return (
        <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
            <p className="text-xs text-muted-foreground">Minute: {label}</p>
            <p className="text-sm font-medium">Logs: {value}</p>
            <p className="text-sm font-medium">Errors: {value-4}</p>
        </div>
    );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
export type { ChartConfig };
