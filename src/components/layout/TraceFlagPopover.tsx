import { CheckCircle2, Loader2, RefreshCw, Search, TimerReset } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IconCrossfade } from "@/components/ui/icon-crossfade";
import { PopoverContent } from "@/components/ui/popover";
import { useTraceFlagUsers } from "@/hooks/useTraceFlagUsers";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import type { SalesforceUserId } from "@/types/salesforce";
import type { TraceFlagUserSummary } from "@/types/workerMessages";

const TRACE_FLAG_SEARCH_FIELDS = (summary: TraceFlagUserSummary) => {
    return `${summary.user.name} ${summary.user.username}`.toLowerCase();
}

const formatRemaining = (remainingMs: number | null) => {
    if (remainingMs === null || remainingMs <= 0) {
        return null;
    }

    const totalMinutes = Math.ceil(remainingMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m left`;
    }

    return `${minutes}m left`;
}

const getAvatarInitials = (name: string) => {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() ?? '')
        .join('') || '?';
}

type TraceFlagUserRowProps = {
    summary: TraceFlagUserSummary;
    isMutating: boolean;
    onToggle: (_userId: SalesforceUserId) => void;
}

const TraceFlagUserRow = React.memo(function TraceFlagUserRow({
    summary,
    isMutating,
    onToggle
}: TraceFlagUserRowProps) {
    const remainingLabel = formatRemaining(summary.remainingMs);

    return (
        <button
            type="button"
            disabled={isMutating}
            onClick={() => onToggle(summary.user.id)}
            aria-pressed={summary.hasTraceFlag}
            className="
                grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2
                text-left font-sans transition-[background-color,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)]
                hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 focus-visible:ring-inset
            "
        >
            <div
                className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
                aria-hidden="true"
            >
                {getAvatarInitials(summary.user.name)}
            </div>

            <div className="min-w-0">
                <div className="truncate text-sm font-medium leading-5 text-primary">
                    {summary.user.name}
                </div>
                <div className="truncate text-[11px] leading-4 text-muted-foreground">
                    {summary.user.username}
                </div>
            </div>

            <div
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-none transition-colors duration-200",
                    isMutating || !summary.hasTraceFlag
                        ? "border-border bg-muted/40 text-muted-foreground"
                        : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                )}
            >
                <IconCrossfade
                    className="size-[13px]"
                    activeKey={isMutating ? 'loading' : summary.hasTraceFlag ? 'active' : 'inactive'}
                    icons={{
                        loading: <Loader2 size={13} className="animate-spin" />,
                        active: <CheckCircle2 size={13} />,
                        inactive: <TimerReset size={13} />
                    }}
                />
                {!isMutating && (
                    <span>
                        {summary.hasTraceFlag ? (remainingLabel ?? 'Active') : 'Not set'}
                    </span>
                )}
            </div>
        </button>
    );
});

type TraceFlagPopoverProps = {
    isOpen: boolean;
}

function TraceFlagPopover({ isOpen }: TraceFlagPopoverProps) {
    const traceFlagDurationMs = useUIStore(state => state.pollingPreferences.traceFlagDurationMs);
    const [searchQuery, setSearchQuery] = React.useState('');
    const deferredSearchQuery = React.useDeferredValue(searchQuery.trim().toLowerCase());
    const {
        users,
        isLoading,
        errorMessage,
        refreshUsers,
        setTraceFlag,
        mutatingUserId,
        isConnected
    } = useTraceFlagUsers(isOpen);

    const filteredUsers = React.useMemo(() => {
        if (!deferredSearchQuery) {
            return users;
        }

        return users.filter(summary => TRACE_FLAG_SEARCH_FIELDS(summary).includes(deferredSearchQuery));
    }, [deferredSearchQuery, users]);

    const activeTraceFlagCount = React.useMemo(() => {
        return users.reduce((count, summary) => summary.hasTraceFlag ? count + 1 : count, 0);
    }, [users]);

    const handleToggle = React.useCallback((userId: SalesforceUserId) => {
        const summary = users.find(candidate => candidate.user.id === userId);

        if (!summary) {
            return;
        }

        const isDisabling = summary.hasTraceFlag;
        const expiresAt = isDisabling
            ? new Date(0).toISOString()
            : new Date(Date.now() + traceFlagDurationMs).toISOString();
        const toastId = toast.loading(
            isDisabling ? `Disabling trace flag for ${summary.user.name}...` : `Enabling trace flag for ${summary.user.name}...`
        );

        void setTraceFlag(userId, expiresAt).then(result => {
            if (result.status === 'ok') {
                toast.success(
                    isDisabling
                        ? `Trace flag disabled for ${summary.user.name}.`
                        : `Trace flag enabled for ${summary.user.name} (${Math.round(traceFlagDurationMs / 60_000)} min).`,
                    { id: toastId }
                );
                return;
            }

            toast.error(result.message, { id: toastId });
        });
    }, [setTraceFlag, traceFlagDurationMs, users]);

    return (
        <PopoverContent
            align="end"
            sideOffset={10}
            className="w-[22rem] overflow-hidden rounded-lg border-border bg-background p-0 font-sans shadow-xl"
        >
            <div className="border-b border-border px-3 py-2.5 font-sans">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold leading-5 text-primary">Set Trace Flag</h2>
                        <p className="text-xs leading-4 text-muted-foreground">
                            {isConnected
                                ? `${activeTraceFlagCount} active of ${users.length} users`
                                : 'Not connected'}
                        </p>
                    </div>

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Refresh trace flag users"
                        disabled={isLoading || !isConnected}
                        onClick={() => void refreshUsers()}
                        className="text-muted-foreground hover:text-primary"
                    >
                        <RefreshCw className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            <div className="border-b border-border p-2 font-sans">
                <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-input/30 px-2 transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] focus-within:border-ring focus-within:ring-[2px] focus-within:ring-ring/40">
                    <Search size={14} className="shrink-0 text-muted-foreground" />
                    <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search users..."
                        aria-label="Search users for trace flag"
                        className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted-foreground"
                    />
                </label>
            </div>

            {/* min-height keeps the popover's footprint stable across its loading
                -> populated transition - without it, the panel visibly snapped
                from a ~4rem "Loading users..." placeholder up to however tall
                the fetched list turned out to be, right in the middle of the
                open animation, which read as jank/layout shift. */}
            <div className="min-h-56 max-h-[22rem] overflow-auto p-1.5 font-sans">
                {errorMessage ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {errorMessage}
                    </div>
                ) : isLoading && users.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" />
                        Loading users...
                    </div>
                ) : filteredUsers.length > 0 ? (
                    filteredUsers.map(summary => (
                        <TraceFlagUserRow
                            key={summary.user.id}
                            summary={summary}
                            isMutating={mutatingUserId === summary.user.id}
                            onToggle={handleToggle}
                        />
                    ))
                ) : (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No users found
                    </div>
                )}
            </div>
        </PopoverContent>
    );
}

export { TraceFlagPopover };
