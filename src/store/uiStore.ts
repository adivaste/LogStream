import { create } from "zustand";
import type { Theme } from "../types/ui";

type UIState = {

    // Theme
    theme: Theme;
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
    isTraceFlagModalOpen: boolean,
    toggleTraceFlagModalOpen: () => void,

}

export const useUIStore = create<UIState>((set) => ({

    // Initial State
    theme: 'light',
    isLiveStreamOn: true,
    isShortcutsModalOpen: false,
    isSettingsModalOpen: false,
    isTraceFlagModalOpen: false,

    // Actions
    toggleTheme: () => {
        set(prev => {
            const next: Theme = prev.theme === 'light' ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', next === 'dark');
            return { theme: next };
        });
    },
    toggleLiveStream: () => set(prev => ({isLiveStreamOn: !prev.isLiveStreamOn})),
    toggleShortcutsModal: () => set(prev => ({ isShortcutsModalOpen: !prev.isShortcutsModalOpen })), 
    toggleSettingsModal: () => set(prev => ({ isSettingsModalOpen: !prev.isSettingsModalOpen })), 
    toggleTraceFlagModalOpen: () => set(prev => ({ isTraceFlagModalOpen: !prev.isTraceFlagModalOpen }))

}));
