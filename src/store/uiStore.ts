import { create } from "zustand";
import theme from "../types/ui";

type UIState = {

    // Theme
    theme: theme;
    toggleTheme: () => void;

    // Live Stream
    isLiveStreamOn: boolean;
    toggleLiveStream: () => void;

    // Keyboard Shortcuts Modal
    isShortcutsModalOpen: boolean;
    toggleShortcutsModal: () => void;

    // Settings Modal
    isSettingsModalOpen: boolean;
    toggleSettingsModal: () => void;
    
    // Trace Flag Modal
    isTraceFlagModelOpen: boolean,
    toggleTraceFlagModelOpen: () => void,

}

export const useUIStore = create<UIState>((set, get) => ({

    // Initial State
    theme: 'light',
    isLiveStreamOn: true,
    isShortcutsModalOpen: false,
    isSettingsModalOpen: false,
    isTraceFlagModelOpen: false,

    // Actions
    toggleTheme: () => {
        const next: theme = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', next == 'dark');
        set({ theme: next});
    },
    toggleLiveStream: () => {
        const current: boolean = get().isLiveStreamOn;
        const next: boolean = !current;
        console.log(`Toggling Live Stream: ${next ? 'ON' : 'OFF'}`);
        
        set({ isLiveStreamOn : next });
    },
    toggleShortcutsModal: () => {
        const current: boolean = get().isShortcutsModalOpen;
        const next: boolean = !current;
        set({ isShortcutsModalOpen : next });
    },
    toggleSettingsModal: () => {
        const current: boolean = get().isSettingsModalOpen;
        const next: boolean = !current;
        set({ isSettingsModalOpen : next });
    },
    toggleTraceFlagModelOpen: () => {
        const current: boolean = get().isTraceFlagModelOpen;
        const next: boolean = !current;
        set({ isTraceFlagModelOpen : next });
    }

}))
