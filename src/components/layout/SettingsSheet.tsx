import React from "react";
import { Moon, PlugZap, Sun } from "lucide-react";

import { readAppPreferences } from "@/lib/appPreferences";
import { useUIStore } from "@/store/uiStore";

import { Button } from "../ui/button";
import { IconCrossfade } from "../ui/icon-crossfade";
import { Switch } from "../ui/switch";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "../ui/sheet";

export const SettingsSheet = () => {
    const isOpen = useUIStore(state => state.isSettingsModalOpen);
    const setOpen = useUIStore(state => state.setSettingsModalOpen);
    const theme = useUIStore(state => state.theme);
    const toggleTheme = useUIStore(state => state.toggleTheme);
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const setConnectionInfo = useUIStore(state => state.setConnectionInfo);
    const isInsightsVisible = useUIStore(state => state.isInsightsVisible);
    const toggleInsightsVisible = useUIStore(state => state.toggleInsightsVisible);

    const recentOrgs = React.useMemo(() => {
        if (!isOpen) {
            return [];
        }

        return readAppPreferences().connection.recentOrgs;
    }, [isOpen]);

    return (
        <Sheet open={isOpen} onOpenChange={setOpen}>
            <SheetContent className="font-sans">
                <SheetHeader>
                    <SheetTitle>Settings</SheetTitle>
                    <SheetDescription>
                        Preferences for this extension. Changes apply immediately.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex flex-col gap-6 px-4">
                    <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Appearance
                        </h3>
                        <Button
                            variant="outline"
                            className="justify-start gap-2"
                            onClick={toggleTheme}
                        >
                            <IconCrossfade
                                activeKey={theme}
                                className="size-4"
                                icons={{
                                    dark: <Sun className="h-4 w-4" />,
                                    light: <Moon className="h-4 w-4" />
                                }}
                            />
                            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
                        </Button>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Preferences
                        </h3>
                        <label className="flex items-center justify-between gap-3 py-1">
                            <span className="text-sm text-foreground">Show insights section</span>
                            <Switch
                                checked={isInsightsVisible}
                                onCheckedChange={toggleInsightsVisible}
                            />
                        </label>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Connection
                        </h3>
                        {connectionInfo ? (
                            <Button
                                variant="outline"
                                className="justify-start gap-2 text-red-600 dark:text-red-300"
                                onClick={() => setConnectionInfo(null)}
                            >
                                <PlugZap className="h-4 w-4" />
                                Disconnect current org
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">No org connected.</p>
                        )}

                        {recentOrgs.length > 0 && (
                            <div className="mt-1 flex flex-col gap-1">
                                <p className="text-[11px] text-muted-foreground">Recently connected</p>
                                {recentOrgs.map(org => (
                                    <div
                                        key={org.orgId}
                                        className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm"
                                    >
                                        <span className="truncate">{org.orgName ?? org.orgId}</span>
                                        <span className="text-xs text-muted-foreground">{org.environment}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <SheetFooter>
                    <p className="text-xs text-muted-foreground">LogStream</p>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
};
