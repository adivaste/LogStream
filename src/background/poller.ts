import { DEFAULT_LIVE_LOG_POLL_INTERVAL_MS } from "@/lib/livePollingConfig";
import type { SalesforceLogEntry, SalesforceOrgId } from "@/types/salesforce";
import type { LivePollingState } from "@/types/workerMessages";
import { broadcastWorkerEvent } from "./broadcast";
import { logRepository } from "./db/logRepository";
import { syncStateRepository } from "./db/syncStateRepository";
import { apexLogService } from "./salesforce/apexLogService";
import { SalesforceApiLimitExceededError, SalesforceSessionExpiredError } from "./salesforce/salesforceClient";
import { sessionStore } from "./session/sessionStore";

const LIVE_POLL_ALARM_NAME = 'logstream-live-poll';
// The Settings UI persists the user's chosen poll interval to
// `chrome.storage.local` (not `window.localStorage`, which the background
// service worker can't reach) under this key, so it survives worker restarts.
const POLL_INTERVAL_STORAGE_KEY = 'logstream.pollIntervalMs';
const MIN_POLL_INTERVAL_MS = 1_000;

type ChromeAlarms = {
    create?: (_name: string, _alarmInfo: { periodInMinutes: number }) => void;
    onAlarm?: {
        addListener: (_listener: (_alarm: { name: string }) => void) => void;
    };
}

type ChromeStorageArea = {
    get: (_key: string) => Promise<Record<string, number | undefined>>;
    set: (_items: Record<string, number>) => Promise<void>;
}

type ChromeApi = {
    alarms?: ChromeAlarms;
    storage?: {
        local?: ChromeStorageArea;
    };
}

let isTickRunning = false;

const getChromeApi = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

const getPollIntervalMs = async (): Promise<number> => {
    const storedValue = await getChromeApi()?.storage?.local?.get(POLL_INTERVAL_STORAGE_KEY);
    const storedIntervalMs = storedValue?.[POLL_INTERVAL_STORAGE_KEY];

    if (typeof storedIntervalMs === 'number' && storedIntervalMs >= MIN_POLL_INTERVAL_MS) {
        return storedIntervalMs;
    }

    return DEFAULT_LIVE_LOG_POLL_INTERVAL_MS;
}

const broadcastLiveState = (orgId: SalesforceOrgId, state: LivePollingState) => {
    broadcastWorkerEvent({
        event: 'LIVE_POLLING_STATE_CHANGED',
        orgId,
        state
    });
}

const broadcastNewLogs = (
    orgId: SalesforceOrgId,
    logs: SalesforceLogEntry[]
) => {
    if (logs.length === 0) {
        return;
    }

    broadcastWorkerEvent({
        event: 'NEW_LOGS',
        orgId,
        logs
    });
}

export type PollTickResult = {
    logs: SalesforceLogEntry[];
    // The real outcome of this tick's attempt to reach Salesforce - `null`
    // only when another tick was already in flight and this call was skipped,
    // meaning it learned nothing new. Every other case reports the same state
    // that was just broadcast, so a caller building a response from the local
    // cache (which succeeds independently of whether Salesforce was actually
    // reachable) can report the truth instead of assuming "live" just because
    // the cache read worked.
    state: LivePollingState | null;
}

export const liveLogPoller = {
    alarmName: LIVE_POLL_ALARM_NAME,

    async start() {
        const pollIntervalMs = await getPollIntervalMs();

        getChromeApi()?.alarms?.create?.(LIVE_POLL_ALARM_NAME, {
            periodInMinutes: pollIntervalMs / 60_000
        });
    },

    // Called when the user changes the poll interval in Settings. Persists it
    // so it survives a service worker restart, then recreates the alarm -
    // `chrome.alarms.create` with the same name replaces the existing one.
    async setPollIntervalMs(pollIntervalMs: number) {
        const clampedIntervalMs = Math.max(MIN_POLL_INTERVAL_MS, pollIntervalMs);

        await getChromeApi()?.storage?.local?.set({
            [POLL_INTERVAL_STORAGE_KEY]: clampedIntervalMs
        });

        getChromeApi()?.alarms?.create?.(LIVE_POLL_ALARM_NAME, {
            periodInMinutes: clampedIntervalMs / 60_000
        });
    },

    registerAlarmListener() {
        getChromeApi()?.alarms?.onAlarm?.addListener((alarm) => {
            if (alarm.name === LIVE_POLL_ALARM_NAME) {
                void this.tick();
            }
        });
    },

    async tick(): Promise<PollTickResult> {
        if (isTickRunning) {
            return { logs: [], state: null };
        }

        isTickRunning = true;

        try {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (!session) {
                // Session was lost between polls (cookie expired, user signed out, etc).
                // Broadcast so any open UI stops showing a stale "Live Streaming" state.
                broadcastWorkerEvent({ event: 'SESSION_EXPIRED' });
                return { logs: [], state: 'session_expired' };
            }

            const syncState = await syncStateRepository.get(session.orgId);

            if (syncState.isManualPaused || syncState.isIdlePaused) {
                const pausedState: LivePollingState = syncState.isManualPaused ? 'manual_paused' : 'idle_paused';

                broadcastLiveState(session.orgId, pausedState);
                return { logs: [], state: pausedState };
            }

            broadcastLiveState(session.orgId, 'syncing');

            const result = await apexLogService.syncLogsAfterCursor(
                session,
                syncState.cursor
            );

            await syncStateRepository.updateCursor(session.orgId, result.cursor);
            broadcastNewLogs(session.orgId, result.logs);
            broadcastLiveState(session.orgId, 'live');

            return { logs: result.logs, state: 'live' };
        } catch (error) {
            // A 401 means the Salesforce session ID itself is dead (expired,
            // revoked, timeout policy) - retrying it every alarm tick would just
            // keep cycling "syncing" -> "offline" forever instead of surfacing
            // that the user needs to reconnect. Clearing the session here makes
            // every subsequent tick take the `!session` branch above, which
            // already broadcasts SESSION_EXPIRED consistently.
            if (error instanceof SalesforceSessionExpiredError) {
                await sessionStore.clear();
                broadcastWorkerEvent({ event: 'SESSION_EXPIRED' });
                return { logs: [], state: 'session_expired' };
            }

            // The org's daily API request limit is actually exhausted (Salesforce
            // itself refused the call) - retrying every alarm tick would just burn
            // through whatever's left. Surface this distinctly from a generic
            // "offline" blip so the user knows to wait for the daily reset instead
            // of expecting a reconnect to fix it.
            if (error instanceof SalesforceApiLimitExceededError) {
                const limitedSession = sessionStore.get();

                if (limitedSession) {
                    broadcastLiveState(limitedSession.orgId, 'api_exceeded');
                }

                return { logs: [], state: 'api_exceeded' };
            }

            const session = sessionStore.get();

            if (session) {
                broadcastWorkerEvent({
                    event: 'WORKER_ERROR',
                    orgId: session.orgId,
                    code: 'SALESFORCE_ERROR',
                    message: error instanceof Error ? error.message : 'Live polling failed.',
                    retryable: true
                });
                broadcastLiveState(session.orgId, 'offline');
            }

            return { logs: [], state: 'offline' };
        } finally {
            isTickRunning = false;
        }
    },

    async setLivePolling(orgId: SalesforceOrgId, enabled: boolean) {
        await syncStateRepository.setManualPaused(orgId, !enabled);
        broadcastLiveState(orgId, enabled ? 'syncing' : 'manual_paused');

        if (enabled) {
            await this.tick();
        }
    },

    async setIdlePaused(orgId: SalesforceOrgId, isIdlePaused: boolean) {
        await syncStateRepository.setIdlePaused(orgId, isIdlePaused);
        broadcastLiveState(orgId, isIdlePaused ? 'idle_paused' : 'syncing');

        if (!isIdlePaused) {
            await this.tick();
        }
    },

    async getCachedPage(orgId: SalesforceOrgId, cursor: string | null, limit: number) {
        return logRepository.getPage(orgId, cursor, limit);
    }
};
