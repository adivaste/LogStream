import type { SalesforceOrgId } from "@/types/salesforce";
import { logBodyRepository } from "./db/logBodyRepository";
import { logRepository } from "./db/logRepository";

const STORAGE_CLEANUP_ALARM_NAME = 'logstream-storage-cleanup';
const RETENTION_DAYS_STORAGE_KEY = 'logstream.retentionDays';
const MIN_RETENTION_DAYS = 1;
// Local storage is a cache of Salesforce's own debug logs, which orgs
// typically expire server-side well within a week regardless of trace flag
// settings - keeping a local copy longer than the source usually still
// exists for is dead weight, not a useful archive.
const DEFAULT_RETENTION_DAYS = 7;
// Safety nets below the age cap - a single noisy org (debug-heavy sandbox,
// a trace flag left on too long) could otherwise blow past a reasonable
// disk budget in days even inside the retention window.
export const MAX_BODY_BYTES_PER_ORG = 200 * 1024 * 1024;
export const MAX_LOG_COUNT_PER_ORG = 5_000;
// Housekeeping, not part of any hot path - once a day is plenty.
const CLEANUP_PERIOD_MINUTES = 24 * 60;

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

const getChromeApi = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

export const getRetentionDays = async (): Promise<number> => {
    const storedValue = await getChromeApi()?.storage?.local?.get(RETENTION_DAYS_STORAGE_KEY);
    const storedDays = storedValue?.[RETENTION_DAYS_STORAGE_KEY];

    if (typeof storedDays === 'number' && storedDays >= MIN_RETENTION_DAYS) {
        return storedDays;
    }

    return DEFAULT_RETENTION_DAYS;
}

export const storageRetentionService = {
    alarmName: STORAGE_CLEANUP_ALARM_NAME,

    start() {
        getChromeApi()?.alarms?.create?.(STORAGE_CLEANUP_ALARM_NAME, {
            periodInMinutes: CLEANUP_PERIOD_MINUTES
        });

        // `chrome.alarms.create` only schedules the *next* fire up to 24h
        // out - it doesn't run once immediately. Without this, an org that's
        // already over a cap (or freshly upgraded to a version with this
        // cap) would stay over it for up to a full day after every install/
        // update/service-worker restart before the alarm ever fires once.
        void this.runSweep();
    },

    async setRetentionDays(days: number) {
        await getChromeApi()?.storage?.local?.set({
            [RETENTION_DAYS_STORAGE_KEY]: Math.max(MIN_RETENTION_DAYS, days)
        });
    },

    async getStorageUsage(orgId: SalesforceOrgId) {
        const [logCount, bodyCount, bodyBytes, retentionDays] = await Promise.all([
            logRepository.count(orgId),
            logBodyRepository.count(orgId),
            logBodyRepository.totalBytes(orgId),
            getRetentionDays()
        ]);

        return {
            logCount,
            bodyCount,
            bodyBytes,
            maxBodyBytes: MAX_BODY_BYTES_PER_ORG,
            maxLogCount: MAX_LOG_COUNT_PER_ORG,
            retentionDays
        };
    },

    registerAlarmListener() {
        getChromeApi()?.alarms?.onAlarm?.addListener((alarm) => {
            if (alarm.name === STORAGE_CLEANUP_ALARM_NAME) {
                void this.runSweep();
            }
        });
    },

    async sweepOrg(orgId: SalesforceOrgId, cutoffIso: string) {
        // Age cap first - the cheapest, most predictable rule, and it makes
        // the size/count caps below have less work to do in the common case.
        await logRepository.deleteOlderThan(orgId, cutoffIso);
        await logBodyRepository.deleteOlderThan(orgId, cutoffIso);

        const logCount = await logRepository.count(orgId);

        if (logCount > MAX_LOG_COUNT_PER_ORG) {
            await logRepository.deleteOldest(orgId, logCount - MAX_LOG_COUNT_PER_ORG);
        }

        await logBodyRepository.enforceByteBudget(orgId, MAX_BODY_BYTES_PER_ORG);

        // Last, once metadata deletes above have had their say - cleans up
        // any body left pointing at a log row that no longer exists.
        await logBodyRepository.deleteOrphans(orgId);
    },

    async getCutoffIso() {
        const retentionDays = await getRetentionDays();

        return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    },

    async runSweep() {
        const cutoffIso = await this.getCutoffIso();
        const orgIds = await logRepository.getAllOrgIds();

        for (const orgId of orgIds) {
            await this.sweepOrg(orgId, cutoffIso);
        }
    },

    // Manual "clean up now" trigger, scoped to just the org the user is
    // currently looking at - the daily alarm already sweeps every org, so a
    // user-initiated click only needs to be fast and reflect what they're
    // actually looking at.
    async runSweepForOrg(orgId: SalesforceOrgId) {
        await this.sweepOrg(orgId, await this.getCutoffIso());
    }
};
