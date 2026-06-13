import React from "react";

import { SortBy, SortDirection } from "@/types/ui";
import { useTableUIStore } from "@/store/tableUIStore";
import { useUIStore } from "@/store/uiStore";
import { connectSalesforceOrg } from "@/services/salesforceConnection";

const SORT_SHORTCUT_TIMEOUT_MS = 1_200;

const SORT_BY_SHORTCUT: Record<string, SortBy> = {
    o: SortBy.OPERATION,
    u: SortBy.USER,
    a: SortBy.APP,
    s: SortBy.SIZE,
    d: SortBy.DURATION,
    t: SortBy.TIMESTAMP
};

const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const tagName = target.tagName.toLowerCase();

    return (
        target.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select'
    );
}

const getNextSortDirection = (sortBy: SortBy) => {
    const { sortBy: currentSortBy, sortDirection } = useTableUIStore.getState();

    if (currentSortBy !== sortBy) {
        return SortDirection.ASC;
    }

    return sortDirection === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC;
}

const sortByColumnShortcut = (key: string) => {
    const sortBy = SORT_BY_SHORTCUT[key];

    if (!sortBy) {
        return false;
    }

    useTableUIStore.getState().setSorting(
        sortBy,
        getNextSortDirection(sortBy)
    );

    return true;
}

export const useShortcutManager = () => {
    const isConnectingRef = React.useRef(false);
    const isSortShortcutPendingRef = React.useRef(false);
    const sortShortcutTimeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        const clearSortShortcut = () => {
            isSortShortcutPendingRef.current = false;

            if (sortShortcutTimeoutRef.current) {
                window.clearTimeout(sortShortcutTimeoutRef.current);
                sortShortcutTimeoutRef.current = null;
            }
        };

        const startSortShortcut = () => {
            clearSortShortcut();
            isSortShortcutPendingRef.current = true;
            sortShortcutTimeoutRef.current = window.setTimeout(
                clearSortShortcut,
                SORT_SHORTCUT_TIMEOUT_MS
            );
        };

        const connectOrg = () => {
            if (isConnectingRef.current) {
                return;
            }

            isConnectingRef.current = true;

            void connectSalesforceOrg()
                .then(result => {
                    useUIStore.getState().setConnectionInfo(result.connectionInfo);
                })
                .catch(() => {
                    useUIStore.getState().setConnectionInfo(null);
                })
                .finally(() => {
                    isConnectingRef.current = false;
                });
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                isEditableTarget(event.target)
            ) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key.length !== 1) {
                return;
            }

            if (isSortShortcutPendingRef.current) {
                const didSort = sortByColumnShortcut(key);

                clearSortShortcut();

                if (didSort) {
                    event.preventDefault();
                }

                return;
            }

            if (key === 'd') {
                event.preventDefault();
                useUIStore.getState().toggleTheme();
                return;
            }

            if (key === 'c') {
                event.preventDefault();
                connectOrg();
                return;
            }

            if (key === 'f') {
                event.preventDefault();
                const { isTraceFlagPopoverOpen, setTraceFlagPopoverOpen } = useUIStore.getState();
                setTraceFlagPopoverOpen(!isTraceFlagPopoverOpen);
                return;
            }

            if (key === 's') {
                event.preventDefault();
                startSortShortcut();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearSortShortcut();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
}
