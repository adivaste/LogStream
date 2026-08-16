// Defaults for the user-configurable polling preferences (Settings >
// Preferences) - see appPreferences.ts's `polling` section. These are the
// fallback values used until the user changes them.
export const DEFAULT_LIVE_LOG_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_LIVE_LOG_IDLE_TIMEOUT_MS = 60_000;

export const LIVE_LOG_IDLE_CHECK_INTERVAL_MS = 1_000;
export const LIVE_LOG_PAGE_LIMIT = 200;

export const LIVE_LOG_ACTIVITY_EVENTS = [
    'pointerdown',
    'keydown',
    'wheel',
    'scroll',
    'touchstart'
] as const;
