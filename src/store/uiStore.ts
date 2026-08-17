import { create } from "zustand";
import {
    type AppPreferences,
    applyThemePreference,
    initializeThemePreference,
    persistLogBodyPreferences,
    persistPollingPreferences,
    persistShowInsightsPreference,
    persistThemePreference,
    readAppPreferences,
    rememberConnectedOrg
} from "@/lib/appPreferences";
import { sendWorkerRequest } from "@/services/backgroundBridge";
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
    pollingPreferences: AppPreferences['polling'];
    updatePollingPreferences: (_polling: Partial<AppPreferences['polling']>) => void;
    logBodyPreferences: AppPreferences['logBody'];
    updateLogBodyPreferences: (_logBody: Partial<AppPreferences['logBody']>) => void;

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
    pollingPreferences: readAppPreferences().polling,
    logBodyPreferences: readAppPreferences().logBody,
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
    updatePollingPreferences: (polling) => {
        const persisted = persistPollingPreferences(polling);

        set({ pollingPreferences: persisted.polling });

        // The poll interval also drives the background service worker's
        // `chrome.alarms` schedule, which can't read this store or
        // localStorage - sync it explicitly so both contexts agree.
        if (typeof polling.pollIntervalMs === 'number') {
            // Best-effort sync - a dormant/dying service worker shouldn't
            // surface as an unhandled rejection for a background settings sync.
            sendWorkerRequest({
                type: 'SET_LIVE_POLL_INTERVAL_MS',
                pollIntervalMs: polling.pollIntervalMs
            }).catch(() => {});
        }
    },
    updateLogBodyPreferences: (logBody) => {
        const persisted = persistLogBodyPreferences(logBody);
        set({ logBodyPreferences: persisted.logBody });
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
