import { create } from "zustand";
import {
    applyThemePreference,
    initializeThemePreference,
    persistShowInsightsPreference,
    persistThemePreference,
    readAppPreferences,
    rememberConnectedOrg
} from "@/lib/appPreferences";
import { connectSalesforceOrg } from "@/services/salesforceConnection";
import type { SalesforceConnectionInfo } from "@/types/salesforce";
import type { LivePollingState } from "@/types/workerMessages";
import type { Theme } from "../types/ui";

export type SessionDetectionState =
    | 'idle'
    | 'detecting'
    | 'connected'
    | 'not_found'
    | 'failed';

type UIState = {

    // Theme
    theme: Theme;
    toggleTheme: () => void;

    // Preferences
    isInsightsVisible: boolean;
    toggleInsightsVisible: () => void;

    // Salesforce Connection
    connectionInfo: SalesforceConnectionInfo | null;
    setConnectionInfo: (_connectionInfo: SalesforceConnectionInfo | null) => void;
    sessionDetectionState: SessionDetectionState;
    // Shared by App.tsx (initial detect on mount) and Header.tsx (manual
    // re-detect button + badge) so both read/trigger the exact same state -
    // previously each owned its own copy, which deadlocked the initial
    // full-page loader against Header only mounting once detection was done.
    refreshSession: () => Promise<void>;

    // True once the very first session-detection attempt (on app load) has
    // resolved, one way or another. Gates the full-page "Detecting..." splash -
    // manual re-detects afterward only update the header badge, not the whole layout.
    isInitialSessionDetectionComplete: boolean;
    completeInitialSessionDetection: () => void;

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
    setSettingsModalOpen: (_isOpen: boolean) => void;
    toggleSettingsModal: () => void;
    
    // Trace Flag Popover
    isTraceFlagPopoverOpen: boolean,
    setTraceFlagPopoverOpen: (_isOpen: boolean) => void,
    toggleTraceFlagPopoverOpen: () => void,

}

export const useUIStore = create<UIState>((set, get) => ({

    // Initial State
    theme: initializeThemePreference(),
    isInsightsVisible: readAppPreferences().preferences.showInsights,
    connectionInfo: null,
    sessionDetectionState: 'detecting',
    isInitialSessionDetectionComplete: false,
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
    toggleInsightsVisible: () => {
        set(prev => {
            const next = !prev.isInsightsVisible;
            persistShowInsightsPreference(next);
            return { isInsightsVisible: next };
        });
    },
    setConnectionInfo: (connectionInfo) => {
        rememberConnectedOrg(connectionInfo);
        set({ connectionInfo });
    },
    completeInitialSessionDetection: () => set(state => (
        state.isInitialSessionDetectionComplete ? state : { isInitialSessionDetectionComplete: true }
    )),
    refreshSession: async () => {
        set({ sessionDetectionState: 'detecting' });

        try {
            const result = await connectSalesforceOrg();

            get().setConnectionInfo(result.connectionInfo);
            set({ sessionDetectionState: result.status === 'connected' ? 'connected' : 'not_found' });
        } catch {
            get().setConnectionInfo(null);
            set({ sessionDetectionState: 'failed' });
        }
    },
    toggleLiveStream: () => set(prev => ({
        isLiveStreamOn: !prev.isLiveStreamOn,
        livePollingState: !prev.isLiveStreamOn ? 'live' : 'manual_paused'
    })),
    setLivePollingState: (livePollingState) => set({ livePollingState }),
    setShortcutsPopoverOpen: (isOpen) => set({ isShortcutsPopoverOpen: isOpen }),
    toggleShortcutsPopoverOpen: () => set(prev => ({ isShortcutsPopoverOpen: !prev.isShortcutsPopoverOpen })),
    setSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
    toggleSettingsModal: () => set(prev => ({ isSettingsModalOpen: !prev.isSettingsModalOpen })),
    setTraceFlagPopoverOpen: (isOpen) => set({ isTraceFlagPopoverOpen: isOpen }),
    toggleTraceFlagPopoverOpen: () => set(prev => ({ isTraceFlagPopoverOpen: !prev.isTraceFlagPopoverOpen }))

}));
