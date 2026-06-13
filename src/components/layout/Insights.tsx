import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";

const data = [
    { minute: "18:14", logs: 12 },
    { minute: "18:15", logs: 15 },
    { minute: "18:16", logs: 18 },
    { minute: "18:18", logs: 9 },
    { minute: "18:19", logs: 22 },
    { minute: "18:20", logs: 15 },
    { minute: "18:21", logs: 12 },
    { minute: "18:22", logs: 25 },
    { minute: "18:23", logs: 18 },
    { minute: "18:24", logs: 9 },
    { minute: "18:25", logs: 22 },
    { minute: "18:26", logs: 15 },
    { minute: "18:27", logs: 12 },
    { minute: "18:28", logs: 25 },
    { minute: "18:29", logs: 18 },
    { minute: "18:30", logs: 9 },
    { minute: "18:31", logs: 22 },
    { minute: "18:32", logs: 15 },
    { minute: "18:33", logs: 12 },
    { minute: "18:34", logs: 25 },
    { minute: "18:35", logs: 18 },
    { minute: "18:36", logs: 9 },
    { minute: "18:37", logs: 22 },
    { minute: "18:38", logs: 15 },
    { minute: "18:39", logs: 12 },
    { minute: "18:40", logs: 25 },
    { minute: "18:41", logs: 18 },
    { minute: "18:42", logs: 9 },
    { minute: "18:43", logs: 22 },
    { minute: "18:44", logs: 15 },
    { minute: "18:45", logs: 12 },
    { minute: "18:46", logs: 25 },
    { minute: "18:47", logs: 18 },
    { minute: "18:48", logs: 9 },
    { minute: "18:49", logs: 22 },
    { minute: "18:50", logs: 15 },
];

const chartConfig = {
    logs: {
        label: "Logs",
        color: "var(--color-chart-1)",
    },
} satisfies ChartConfig;

function Insights() {
    return (
        <section className="w-full flex justify-center">
            <section className="w-1/2 p-4px-8 py-8 px-8 flex flex-col gap-8">
                
                {/* Insights Row 1 */}
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <span className="text-primary/60 font-sans text-sm">Total Logs</span>
                        <h1 className="text-3xl font-bold font-mono">1,245</h1>
                    </div>
                    
                    <div>
                        <span className="text-primary/60 font-sans text-sm">Errors</span>
                        <h1 className="text-3xl font-bold font-mono text-destructive">643</h1>
                    </div>
                    
                    <div>
                        <span className="text-primary/60 font-sans text-sm">Avg. Duration</span>
                        <h1 className="text-3xl font-bold font-mono">
                            1,202
                            <span className="text-primary/40 px-1 m-0">ms</span> 
                        </h1>
                    </div>

                    <div>
                        <span className="text-primary/60 font-sans text-sm">Avg. Size</span>
                        <h1 className="text-3xl font-bold font-mono">
                            342
                            <span className="text-primary/40 px-1 m-0">kb</span> 
                        </h1>
                    </div>
                </div>

                {/* Insights Row 2 */}
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <span className="text-primary/60 font-sans text-sm">Slow Reqs</span>
                        <h1 className="text-3xl font-bold font-mono">342</h1>
                    </div>
                    
                    <div>
                        <span className="text-primary/60 font-sans text-sm">Largest Log</span>
                        <h1 className="text-3xl font-bold font-mono">643</h1>
                    </div>
                    
                    <div>
                        <span className="text-primary/60 font-sans text-sm">Active Users</span>
                        <h1 className="text-3xl font-bold font-mono">107</h1>
                    </div>

                    <div>
                        <span className="text-primary/60 font-sans text-sm">Req/Sec</span>
                        <h1 className="text-3xl font-bold font-mono">3</h1>
                    </div>
                </div>

            </section>
            <section className="w-1/2 select-none focus-visible:outline-none">
                <div className="p-4">
                    <h2 className="mb-4 font-semibold font-sans text-lg">Logs Per Minute</h2>
                    <div className="h-42 w-full">
                        <ChartContainer config={chartConfig}>
                            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} className="text-sm">
                                <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
                                <XAxis
                                    dataKey="minute"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tickLine={false}
                                    axisLine={false}
                                    width={32}
                                    tick={{ fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                                <Bar dataKey="logs" fill="var(--color-logs)" radius={[0, 0, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                </div>
            </section>
        </section>
    );
}

export { Insights };
