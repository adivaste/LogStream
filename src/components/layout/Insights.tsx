import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { useTableUIStore } from "@/store/tableUIStore";
import type { LogEntry } from "@/types/ui";

// A log is considered "slow" past this duration. Salesforce itself doesn't
// define a universal threshold - 2s is a common rule of thumb for Apex/SOQL
// work worth investigating.
const SLOW_LOG_THRESHOLD_MS = 2000;
const CHART_HEIGHT_PX = 168; // matches the previous fixed h-42 footprint

const parseDurationMs = (duration: string): number | null => {
    const value = Number.parseFloat(duration);

    return Number.isNaN(value) ? null : value;
}

const parseSizeBytes = (size: string): number | null => {
    const match = /^([\d.]+)\s*(b|kb|mb)$/i.exec(size.trim());

    if (!match) {
        return null;
    }

    const [, rawValue, unit] = match;
    const value = Number.parseFloat(rawValue!);

    if (Number.isNaN(value)) {
        return null;
    }

    if (unit!.toLowerCase() === 'mb') {
        return value * 1024 * 1024;
    }

    if (unit!.toLowerCase() === 'kb') {
        return value * 1024;
    }

    return value;
}

const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }

    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }

    return `${Math.round(bytes)}B`;
}

type StatTile = {
    label: string;
    value: string;
    unit?: string;
    tone?: 'default' | 'destructive';
}

const useInsightsStats = (logs: LogEntry[]): StatTile[] => {
    return React.useMemo(() => {
        const durations = logs
            .map(log => parseDurationMs(log.duration))
            .filter((value): value is number => value !== null);
        const sizes = logs
            .map(log => parseSizeBytes(log.size))
            .filter((value): value is number => value !== null);
        const activeUsers = new Set(logs.map(log => log.user)).size;
        const slowLogCount = durations.filter(value => value > SLOW_LOG_THRESHOLD_MS).length;
        const avgDurationMs = durations.length > 0
            ? durations.reduce((sum, value) => sum + value, 0) / durations.length
            : null;
        const largestSizeBytes = sizes.length > 0 ? Math.max(...sizes) : null;

        return [
            { label: 'Total Logs', value: logs.length.toLocaleString() },
            {
                label: 'Avg. Duration',
                value: avgDurationMs === null ? '-' : Math.round(avgDurationMs).toLocaleString(),
                unit: avgDurationMs === null ? undefined : 'ms'
            },
            {
                label: 'Largest Log',
                value: largestSizeBytes === null ? '-' : formatBytes(largestSizeBytes)
            },
            {
                label: 'Slow Reqs',
                value: slowLogCount.toLocaleString(),
                tone: slowLogCount > 0 ? 'destructive' : 'default'
            },
            { label: 'Active Users', value: activeUsers.toLocaleString() }
        ];
    }, [logs]);
}

type ChartBucket = {
    hourLabel: string;
    logs: number;
    bucketStart: number;
    bucketEnd: number;
}

const HOUR_MS = 60 * 60_000;
const CHART_WINDOW_HOURS = 24;

// `Date.now()` can't be called during render/useMemo (React purity rule) -
// track "now" as state updated from an effect instead, which has the side
// benefit of sliding the 24h window forward automatically over time.
const useNowMs = () => {
    const [nowMs, setNowMs] = React.useState<number | null>(null);

    React.useEffect(() => {
        setNowMs(Date.now());
        const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);

        return () => window.clearInterval(intervalId);
    }, []);

    return nowMs;
}

// A fixed 24 hourly buckets ending "now", rather than one bucket per minute
// spanning however much history happens to be loaded - the latter produced
// hundreds of cramped, unreadable bars once more than a few minutes of logs
// were in memory.
const useHourlyLogBuckets = (logs: LogEntry[], nowMs: number | null): ChartBucket[] => {
    return React.useMemo(() => {
        if (nowMs === null) {
            return [];
        }

        const windowEnd = Math.ceil(nowMs / HOUR_MS) * HOUR_MS;
        const windowStart = windowEnd - CHART_WINDOW_HOURS * HOUR_MS;
        const countsByBucketStart = new Map<number, number>();

        for (const log of logs) {
            if (!log.startTime) {
                continue;
            }

            const timeMs = new Date(log.startTime).getTime();

            if (Number.isNaN(timeMs) || timeMs < windowStart || timeMs >= windowEnd) {
                continue;
            }

            const bucketStart = Math.floor(timeMs / HOUR_MS) * HOUR_MS;
            countsByBucketStart.set(bucketStart, (countsByBucketStart.get(bucketStart) ?? 0) + 1);
        }

        const buckets: ChartBucket[] = [];

        for (let bucketStart = windowStart; bucketStart < windowEnd; bucketStart += HOUR_MS) {
            buckets.push({
                hourLabel: new Date(bucketStart).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                logs: countsByBucketStart.get(bucketStart) ?? 0,
                bucketStart,
                bucketEnd: bucketStart + HOUR_MS
            });
        }

        return buckets;
    }, [logs, nowMs]);
}

const chartConfig = {
    logs: {
        label: "Logs",
        color: "var(--color-chart-1)",
    },
} satisfies ChartConfig;

type InsightsProps = {
    logs: LogEntry[];
}

function Insights({ logs }: InsightsProps) {
    const stats = useInsightsStats(logs);
    const nowMs = useNowMs();
    const buckets = useHourlyLogBuckets(logs, nowMs);
    const setTimeRange = useTableUIStore(state => state.setTimeRange);

    const handleBarClick = React.useCallback((bucket: ChartBucket) => {
        setTimeRange(new Date(bucket.bucketStart), new Date(bucket.bucketEnd - 1));
    }, [setTimeRange]);

    return (
        <section className="w-full flex justify-center">
            <section className="w-1/2 p-4px-8 py-8 px-8 flex flex-col gap-8">
                <div className="grid grid-cols-3 gap-4">
                    {stats.map(stat => (
                        <div key={stat.label}>
                            <span className="text-primary/60 font-sans text-sm">{stat.label}</span>
                            <h1 className={`text-3xl font-bold font-mono ${stat.tone === 'destructive' ? 'text-destructive' : ''}`}>
                                {stat.value}
                                {stat.unit && <span className="text-primary/40 px-1 m-0">{stat.unit}</span>}
                            </h1>
                        </div>
                    ))}
                </div>
            </section>
            <section className="w-1/2 focus-visible:outline-none">
                <div className="p-4">
                    <h2 className="mb-4 font-semibold font-sans text-lg">Logs Per Hour (last 24h)</h2>
                    <div style={{ height: CHART_HEIGHT_PX }} className="w-full">
                        {logs.length > 0 ? (
                            <ChartContainer config={chartConfig}>
                                <BarChart data={buckets} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} className="text-sm" tabIndex={-1}>
                                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
                                    <XAxis
                                        dataKey="hourLabel"
                                        tickLine={false}
                                        axisLine={false}
                                        interval={2}
                                        minTickGap={16}
                                        tick={{ fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tickLine={false}
                                        axisLine={false}
                                        width={32}
                                        tick={{ fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                                    />
                                    <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                                    {/* Click an hour's bar to filter the log list to that hour. */}
                                    <Bar
                                        dataKey="logs"
                                        fill="var(--color-logs)"
                                        radius={[2, 2, 0, 0]}
                                        maxBarSize={20}
                                        className="cursor-pointer"
                                        onClick={(data) => handleBarClick(data.payload as ChartBucket)}
                                    />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground font-sans">
                                No logs loaded yet.
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </section>
    );
}

export { Insights };
