import { CheckCircle2, Search, TimerReset } from "lucide-react";
import React from "react";

import { PopoverContent } from "@/components/ui/popover";
import { mockTraceFlagUsers, type TraceFlagUser } from "@/lib/mockTraceFlagUsers";
import { cn } from "@/lib/utils";

const TRACE_FLAG_SEARCH_FIELDS = (user: TraceFlagUser) => {
    return `${user.name} ${user.username}`.toLowerCase();
}

type TraceFlagUserRowProps = {
    user: TraceFlagUser;
}

const TraceFlagUserRow = React.memo(function TraceFlagUserRow({ user }: TraceFlagUserRowProps) {
    return (
        <div
            className="
                grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2
                transition-[background-color,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)]
                hover:bg-muted/80
            "
        >
            <div
                className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                    user.avatarColorClassName
                )}
                aria-hidden="true"
            >
                {user.avatarInitials}
            </div>

            <div className="min-w-0">
                <div className="truncate text-sm font-medium leading-5 text-primary">
                    {user.name}
                </div>
                <div className="truncate font-mono text-[11px] leading-4 text-muted-foreground">
                    {user.username}
                </div>
            </div>

            {user.hasTraceFlag ? (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs leading-none text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={13} />
                    <span className="font-mono">{user.traceFlagDurationLabel}</span>
                </div>
            ) : (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs leading-none text-muted-foreground">
                    <TimerReset size={13} />
                    <span>Not set</span>
                </div>
            )}
        </div>
    );
});

function TraceFlagPopover() {
    const [searchQuery, setSearchQuery] = React.useState('');
    const deferredSearchQuery = React.useDeferredValue(searchQuery.trim().toLowerCase());

    const filteredUsers = React.useMemo(() => {
        if (!deferredSearchQuery) {
            return mockTraceFlagUsers;
        }

        return mockTraceFlagUsers.filter(user => {
            return TRACE_FLAG_SEARCH_FIELDS(user).includes(deferredSearchQuery);
        });
    }, [deferredSearchQuery]);

    const activeTraceFlagCount = React.useMemo(() => {
        return mockTraceFlagUsers.reduce((count, user) => {
            return user.hasTraceFlag ? count + 1 : count;
        }, 0);
    }, []);

    return (
        <PopoverContent
            align="end"
            sideOffset={10}
            className="
                w-[24rem] overflow-hidden rounded-lg border-border bg-background p-0 shadow-xl
                data-[state=open]:duration-200 data-[state=closed]:duration-150
                data-[state=open]:ease-[cubic-bezier(.16,1,.3,1)] data-[state=closed]:ease-[cubic-bezier(.7,0,.84,0)]
            "
        >
            <div className="border-b border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold leading-5 text-primary">Set Trace Flag</h2>
                        <p className="text-xs leading-4 text-muted-foreground">
                            {activeTraceFlagCount} active of {mockTraceFlagUsers.length} users
                        </p>
                    </div>

                    <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-mono text-xs leading-none text-emerald-700 dark:text-emerald-300">
                        Org users
                    </span>
                </div>
            </div>

            <div className="border-b border-border p-2">
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

            <div className="max-h-[22rem] overflow-auto p-1.5">
                {filteredUsers.length > 0 ? (
                    filteredUsers.map(user => (
                        <TraceFlagUserRow key={user.id} user={user} />
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
