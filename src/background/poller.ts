import { LIVE_LOG_POLL_INTERVAL_MS } from "@/lib/livePollingConfig";
import type { SalesforceLogEntry, SalesforceOrgId } from "@/types/salesforce";
import type { LivePollingState } from "@/types/workerMessages";
import { broadcastWorkerEvent } from "./broadcast";
import { logRepository } from "./db/logRepository";
import { syncStateRepository } from "./db/syncStateRepository";
import { apexLogService } from "./salesforce/apexLogService";
import { SalesforceSessionExpiredError } from "./salesforce/salesforceClient";
import { sessionStore } from "./session/sessionStore";

const LIVE_POLL_ALARM_NAME = 'logstream-live-poll';
const LIVE_POLL_PERIOD_MINUTES = LIVE_LOG_POLL_INTERVAL_MS / 60_000;

type ChromeAlarms = {
    create?: (_name: string, _alarmInfo: { periodInMinutes: number }) => void;
    onAlarm?: {
        addListener: (_listener: (_alarm: { name: string }) => void) => void;
    };
}

type ChromeApi = {
    alarms?: ChromeAlarms;
}

let isTickRunning = false;

const getChromeApi = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
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

export const liveLogPoller = {
    alarmName: LIVE_POLL_ALARM_NAME,

    start() {
        getChromeApi()?.alarms?.create?.(LIVE_POLL_ALARM_NAME, {
            periodInMinutes: LIVE_POLL_PERIOD_MINUTES
        });
    },

    registerAlarmListener() {
        getChromeApi()?.alarms?.onAlarm?.addListener((alarm) => {
            if (alarm.name === LIVE_POLL_ALARM_NAME) {
                void this.tick();
            }
        });
    },

    async tick() {
        if (isTickRunning) {
            return [];
        }

        isTickRunning = true;

        try {
            const session = sessionStore.get() ?? await sessionStore.restore();

            if (!session) {
                // Session was lost between polls (cookie expired, user signed out, etc).
                // Broadcast so any open UI stops showing a stale "Live Streaming" state.
                broadcastWorkerEvent({ event: 'SESSION_EXPIRED' });
                return [];
            }

            const syncState = await syncStateRepository.get(session.orgId);

            if (syncState.isManualPaused || syncState.isIdlePaused) {
                broadcastLiveState(
                    session.orgId,
                    syncState.isManualPaused ? 'manual_paused' : 'idle_paused'
                );
                return [];
            }

            broadcastLiveState(session.orgId, 'syncing');

            const result = await apexLogService.syncLogsAfterCursor(
                session,
                syncState.cursor
            );

            await syncStateRepository.updateCursor(session.orgId, result.cursor);
            broadcastNewLogs(session.orgId, result.logs);
            broadcastLiveState(session.orgId, 'live');

            return result.logs;
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
                return [];
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

            return [];
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
