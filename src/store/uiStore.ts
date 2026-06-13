import { create } from "zustand";
import {
    applyThemePreference,
    initializeThemePreference,
    persistThemePreference,
    rememberConnectedOrg
} from "@/lib/appPreferences";
import type { SalesforceConnectionInfo } from "@/types/salesforce";
import type { LivePollingState } from "@/types/workerMessages";
import type { Theme } from "../types/ui";

type UIState = {

    // Theme
    theme: Theme;
    toggleTheme: () => void;

    // Salesforce Connection
    connectionInfo: SalesforceConnectionInfo | null;
    setConnectionInfo: (_connectionInfo: SalesforceConnectionInfo | null) => void;

    // Live Stream
    isLiveStreamOn: boolean;
    livePollingState: LivePollingState;
    toggleLiveStream: () => void;
    setLivePollingState: (_state: LivePollingState) => void;

    // Keyboard Shortcuts Popover
    isShortcutsPopoverOpen: boolean;
    setShortcutsPopoverOpen: (_isOpen: boolean) => void;
    toggleShortcutsPopoverOpen: () => void;

    // Settings Modal
    isSettingsModalOpen: boolean;
    toggleSettingsModal: () => void;
    
    // Trace Flag Popover
    isTraceFlagPopoverOpen: boolean,
    setTraceFlagPopoverOpen: (_isOpen: boolean) => void,
    toggleTraceFlagPopoverOpen: () => void,

}

export const useUIStore = create<UIState>((set) => ({

    // Initial State
    theme: initializeThemePreference(),
    connectionInfo: null,
    isLiveStreamOn: true,
    livePollingState: 'offline',
    isShortcutsPopoverOpen: false,
    isSettingsModalOpen: false,
    isTraceFlagPopoverOpen: false,

    // Actions
    toggleTheme: () => {
        set(prev => {
            const next: Theme = prev.theme === 'light' ? 'dark' : 'light';
            applyThemePreference(next);
            persistThemePreference(next);
            return { theme: next };
        });
    },
    setConnectionInfo: (connectionInfo) => {
        rememberConnectedOrg(connectionInfo);
        set({ connectionInfo });
    },
    toggleLiveStream: () => set(prev => ({
        isLiveStreamOn: !prev.isLiveStreamOn,
        livePollingState: !prev.isLiveStreamOn ? 'live' : 'manual_paused'
    })),
    setLivePollingState: (livePollingState) => set({ livePollingState }),
    setShortcutsPopoverOpen: (isOpen) => set({ isShortcutsPopoverOpen: isOpen }),
    toggleShortcutsPopoverOpen: () => set(prev => ({ isShortcutsPopoverOpen: !prev.isShortcutsPopoverOpen })),
    toggleSettingsModal: () => set(prev => ({ isSettingsModalOpen: !prev.isSettingsModalOpen })), 
    setTraceFlagPopoverOpen: (isOpen) => set({ isTraceFlagPopoverOpen: isOpen }),
    toggleTraceFlagPopoverOpen: () => set(prev => ({ isTraceFlagPopoverOpen: !prev.isTraceFlagPopoverOpen }))

}));
