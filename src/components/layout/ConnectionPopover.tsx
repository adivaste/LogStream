import { PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PopoverContent } from "@/components/ui/popover";
import type { SalesforceConnectionInfo } from "@/types/salesforce";

type ConnectionPopoverProps = {
    connectionInfo: SalesforceConnectionInfo;
    onDisconnect: () => void;
}

const formatConnectedAt = (connectedAt: string) => {
    const date = new Date(connectedAt);

    return Number.isNaN(date.getTime()) ? connectedAt : date.toLocaleString();
}

function ConnectionPopover({ connectionInfo, onDisconnect }: ConnectionPopoverProps) {
    const details = [
        { label: 'Organization', value: connectionInfo.orgName },
        { label: 'Org ID', value: connectionInfo.orgId },
        { label: 'Environment', value: connectionInfo.environment },
        { label: 'Connected', value: formatConnectedAt(connectionInfo.connectedAt) },
        { label: 'Instance URL', value: connectionInfo.instanceUrl },
        { label: 'API Version', value: connectionInfo.apiVersion },
        { label: 'User ID', value: connectionInfo.userId }
    ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value));

    return (
        <PopoverContent
            align="end"
            sideOffset={10}
            className="w-[22rem] overflow-hidden rounded-lg border-border bg-background p-0 font-sans shadow-xl"
        >
            <div className="border-b border-border px-3 py-2.5 font-sans">
                <h2 className="text-sm font-semibold leading-5 text-primary">Connected Org</h2>
                <p className="text-xs leading-4 text-muted-foreground">Salesforce session details</p>
            </div>

            <div className="space-y-1 p-3 font-sans">
                {details.map(detail => (
                    <div
                        key={detail.label}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-2.5 py-1.5"
                    >
                        <span className="text-xs text-muted-foreground">{detail.label}</span>
                        <span className="min-w-0 truncate font-mono text-xs text-primary" title={detail.value}>
                            {detail.value}
                        </span>
                    </div>
                ))}
            </div>

            <div className="border-t border-border p-3 font-sans">
                <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2 border-0 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15"
                    onClick={onDisconnect}
                >
                    <PlugZap className="h-4 w-4" />
                    Disconnect this org
                </Button>
            </div>
        </PopoverContent>
    );
}

export { ConnectionPopover };
