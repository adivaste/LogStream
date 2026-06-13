export const LIVE_LOG_POLL_INTERVAL_MS = 5_000;
export const LIVE_LOG_IDLE_TIMEOUT_MS = 60_000;
export const LIVE_LOG_IDLE_CHECK_INTERVAL_MS = 1_000;
export const LIVE_LOG_PAGE_LIMIT = 200;

export const LIVE_LOG_ACTIVITY_EVENTS = [
    'pointerdown',
    'keydown',
    'wheel',
    'scroll',
    'touchstart'
] as const;
