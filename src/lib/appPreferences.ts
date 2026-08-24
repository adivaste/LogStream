import {
    DEFAULT_LIVE_LOG_IDLE_TIMEOUT_MS,
    DEFAULT_LIVE_LOG_POLL_INTERVAL_MS
} from "@/lib/livePollingConfig";
import { buildDefaultLogicExpression } from "@/lib/filterLogicExpression";
import {
    type AdvancedLogFilter,
    type FilterOperator,
    EMPTY_ADVANCED_FILTER,
    RELATIVE_TIME_UNITS,
    getFilterField,
    getOperatorsForField
} from "@/lib/logFilterConditions";
import { DEFAULT_SLOW_LOG_THRESHOLD_MS } from "@/lib/logListConfig";
import { DEFAULT_TRACE_FLAG_DURATION_MS } from "@/lib/traceFlagConfig";
import type { SalesforceConnectionInfo, SalesforceOrgId } from "@/types/salesforce";
import { SortBy, SortDirection, type Theme } from "@/types/ui";

const APP_PREFERENCES_STORAGE_KEY = 'logstream-preferences';
const LEGACY_THEME_STORAGE_KEY = 'logstream-theme';
const APP_PREFERENCES_VERSION = 1;

export const DEFAULT_LOG_BODY_FONT_SIZE_PX = 13;
export const MIN_LOG_BODY_FONT_SIZE_PX = 11;
export const MAX_LOG_BODY_FONT_SIZE_PX = 19;

export type StoredOrgPreference = {
    orgId: SalesforceOrgId;
    orgName: string | null;
    environment: SalesforceConnectionInfo['environment'];
    instanceUrl: string;
    connectedAt: string;
}

export type AppPreferences = {
    version: typeof APP_PREFERENCES_VERSION;
    appearance: {
        theme: Theme;
    };
    preferences: {
        showInsights: boolean;
    };
    polling: {
        pollIntervalMs: number;
        idleTimeoutMs: number;
        traceFlagDurationMs: number;
        slowLogThresholdMs: number;
    };
    logTable: {
        sortBy: SortBy;
        sortDirection: SortDirection;
    };
    logBody: {
        wrapEnabled: boolean;
        viewFilter: 'all' | 'debug' | 'executable';
        fontSizePx: number;
    };
    logFilter: {
        advanced: AdvancedLogFilter;
    };
    connection: {
        lastConnectedOrg: StoredOrgPreference | null;
        recentOrgs: StoredOrgPreference[];
    };
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
    version: APP_PREFERENCES_VERSION,
    appearance: {
        theme: 'light'
    },
    preferences: {
        showInsights: true
    },
    polling: {
        pollIntervalMs: DEFAULT_LIVE_LOG_POLL_INTERVAL_MS,
        idleTimeoutMs: DEFAULT_LIVE_LOG_IDLE_TIMEOUT_MS,
        traceFlagDurationMs: DEFAULT_TRACE_FLAG_DURATION_MS,
        slowLogThresholdMs: DEFAULT_SLOW_LOG_THRESHOLD_MS
    },
    logTable: {
        sortBy: SortBy.TIMESTAMP,
        sortDirection: SortDirection.DESC
    },
    logBody: {
        wrapEnabled: false,
        viewFilter: 'all',
        fontSizePx: DEFAULT_LOG_BODY_FONT_SIZE_PX
    },
    logFilter: {
        advanced: EMPTY_ADVANCED_FILTER
    },
    connection: {
        lastConnectedOrg: null,
        recentOrgs: []
    }
};

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
}

// Stored filters come back from localStorage as untyped JSON, and a malformed
// one must never silently hide logs. Anything that doesn't validate against
// the current field/operator registry is dropped rather than kept, so a
// filter written by an older build (or hand-edited) degrades to "no filter"
// instead of an unexplained empty log list.
const normalizeAdvancedFilter = (value: unknown): AdvancedLogFilter => {
    if (!isObject(value)) {
        return EMPTY_ADVANCED_FILTER;
    }

    const rawConditions = Array.isArray(value.conditions) ? value.conditions : [];
    const conditions = rawConditions.flatMap((rawCondition, index) => {
        if (!isObject(rawCondition)) {
            return [];
        }

        const field = typeof rawCondition.field === 'string' ? rawCondition.field : '';
        const operator = typeof rawCondition.operator === 'string' ? rawCondition.operator : '';

        if (!getFilterField(field)) {
            return [];
        }

        if (!getOperatorsForField(field).some(allowed => allowed === operator)) {
            return [];
        }

        const values = Array.isArray(rawCondition.values)
            ? rawCondition.values.filter((entry): entry is string => typeof entry === 'string')
            : [];
        const unit = RELATIVE_TIME_UNITS.find(candidate => candidate === rawCondition.unit) ?? 'minutes';

        return [{
            id: typeof rawCondition.id === 'string' ? rawCondition.id : `stored-condition-${index}`,
            field,
            operator: operator as FilterOperator,
            value: typeof rawCondition.value === 'string' ? rawCondition.value : '',
            secondValue: typeof rawCondition.secondValue === 'string' ? rawCondition.secondValue : '',
            values,
            unit
        }];
    });

    if (typeof value.logic === 'string') {
        return { logic: value.logic, conditions };
    }

    // Migrates filters stored before the logic expression replaced the
    // all/any toggle. "all" is the blank-expression default, so only "any"
    // needs writing out.
    const logic = value.conjunction === 'or'
        ? buildDefaultLogicExpression(conditions.length).replace(/ AND /g, ' OR ')
        : '';

    return { logic, conditions };
}

const isTheme = (value: unknown): value is Theme => {
    return value === 'light' || value === 'dark';
}

const isBoolean = (value: unknown): value is boolean => {
    return typeof value === 'boolean';
}

const isPositiveNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const isSortBy = (value: unknown): value is SortBy => {
    return Object.values(SortBy).includes(value as SortBy);
}

const isSortDirection = (value: unknown): value is SortDirection => {
    return Object.values(SortDirection).includes(value as SortDirection);
}

const isLogViewFilter = (value: unknown): value is AppPreferences['logBody']['viewFilter'] => {
    return value === 'all' || value === 'debug' || value === 'executable';
}

const isFontSizeInRange = (value: unknown): value is number => {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= MIN_LOG_BODY_FONT_SIZE_PX
        && value <= MAX_LOG_BODY_FONT_SIZE_PX;
}

const getBrowserStorage = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.localStorage;
}

const getLegacyTheme = (): Theme | null => {
    const storage = getBrowserStorage();

    if (!storage) {
        return null;
    }

    const theme = storage.getItem(LEGACY_THEME_STORAGE_KEY);

    return isTheme(theme) ? theme : null;
}

const normalizeOrgPreference = (value: unknown): StoredOrgPreference | null => {
    if (!isObject(value)) {
        return null;
    }

    if (typeof value.orgId !== 'string' || typeof value.instanceUrl !== 'string') {
        return null;
    }

    return {
        orgId: value.orgId,
        orgName: typeof value.orgName === 'string' ? value.orgName : null,
        environment: value.environment as StoredOrgPreference['environment'],
        instanceUrl: value.instanceUrl,
        connectedAt: typeof value.connectedAt === 'string'
            ? value.connectedAt
            : new Date().toISOString()
    };
}

const normalizePreferences = (value: unknown): AppPreferences => {
    if (!isObject(value)) {
        return {
            ...DEFAULT_APP_PREFERENCES,
            appearance: {
                theme: getLegacyTheme() ?? DEFAULT_APP_PREFERENCES.appearance.theme
            }
        };
    }

    const appearance = isObject(value.appearance) ? value.appearance : {};
    const preferences = isObject(value.preferences) ? value.preferences : {};
    const polling = isObject(value.polling) ? value.polling : {};
    const logTable = isObject(value.logTable) ? value.logTable : {};
    const logBody = isObject(value.logBody) ? value.logBody : {};
    const logFilter = isObject(value.logFilter) ? value.logFilter : {};
    const connection = isObject(value.connection) ? value.connection : {};
    const recentOrgs = Array.isArray(connection.recentOrgs)
        ? connection.recentOrgs
            .map(normalizeOrgPreference)
            .filter((org): org is StoredOrgPreference => Boolean(org))
        : [];

    return {
        version: APP_PREFERENCES_VERSION,
        appearance: {
            theme: isTheme(appearance.theme)
                ? appearance.theme
                : getLegacyTheme() ?? DEFAULT_APP_PREFERENCES.appearance.theme
        },
        preferences: {
            showInsights: isBoolean(preferences.showInsights)
                ? preferences.showInsights
                : DEFAULT_APP_PREFERENCES.preferences.showInsights
        },
        polling: {
            pollIntervalMs: isPositiveNumber(polling.pollIntervalMs)
                ? polling.pollIntervalMs
                : DEFAULT_APP_PREFERENCES.polling.pollIntervalMs,
            idleTimeoutMs: isPositiveNumber(polling.idleTimeoutMs)
                ? polling.idleTimeoutMs
                : DEFAULT_APP_PREFERENCES.polling.idleTimeoutMs,
            traceFlagDurationMs: isPositiveNumber(polling.traceFlagDurationMs)
                ? polling.traceFlagDurationMs
                : DEFAULT_APP_PREFERENCES.polling.traceFlagDurationMs,
            slowLogThresholdMs: isPositiveNumber(polling.slowLogThresholdMs)
                ? polling.slowLogThresholdMs
                : DEFAULT_APP_PREFERENCES.polling.slowLogThresholdMs
        },
        logTable: {
            sortBy: isSortBy(logTable.sortBy)
                ? logTable.sortBy
                : DEFAULT_APP_PREFERENCES.logTable.sortBy,
            sortDirection: isSortDirection(logTable.sortDirection)
                ? logTable.sortDirection
                : DEFAULT_APP_PREFERENCES.logTable.sortDirection
        },
        logBody: {
            wrapEnabled: isBoolean(logBody.wrapEnabled)
                ? logBody.wrapEnabled
                : DEFAULT_APP_PREFERENCES.logBody.wrapEnabled,
            viewFilter: isLogViewFilter(logBody.viewFilter)
                ? logBody.viewFilter
                : DEFAULT_APP_PREFERENCES.logBody.viewFilter,
            fontSizePx: isFontSizeInRange(logBody.fontSizePx)
                ? logBody.fontSizePx
                : DEFAULT_APP_PREFERENCES.logBody.fontSizePx
        },
        logFilter: {
            advanced: normalizeAdvancedFilter(logFilter.advanced)
        },
        connection: {
            lastConnectedOrg: normalizeOrgPreference(connection.lastConnectedOrg),
            recentOrgs
        }
    };
}

export const readAppPreferences = (): AppPreferences => {
    const storage = getBrowserStorage();

    if (!storage) {
        return DEFAULT_APP_PREFERENCES;
    }

    try {
        return normalizePreferences(
            JSON.parse(storage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? 'null')
        );
    } catch {
        return DEFAULT_APP_PREFERENCES;
    }
}

export const writeAppPreferences = (preferences: AppPreferences) => {
    const storage = getBrowserStorage();

    if (!storage) {
        return;
    }

    try {
        storage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
        storage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
        // Preferences should never block the app when browser storage is unavailable.
    }
}

export const updateAppPreferences = (
    updater: (_preferences: AppPreferences) => AppPreferences
) => {
    const nextPreferences = updater(readAppPreferences());
    writeAppPreferences(nextPreferences);

    return nextPreferences;
}

// A flat instant switch, not a fade - but most interactive elements carry
// `transition-colors` for hover/focus feedback, and that utility can't tell
// "the user is hovering" apart from "the CSS variable underneath just
// changed because the theme flipped". Without this, toggling dark/light
// visibly washes every button/badge/row across the whole app over its own
// transition duration instead of snapping instantly. Standard fix: disable
// all transitions for one frame around the class toggle, then restore them.
const suppressTransitionsAcrossThemeSwitch = (applyTheme: () => void) => {
    const root = document.documentElement;
    const styleElement = document.createElement('style');

    styleElement.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(styleElement);

    applyTheme();

    // Force a reflow so the browser paints the new theme under the
    // transition-suppressing stylesheet before it gets removed - otherwise
    // removing it synchronously could let the very next paint still animate.
    void root.offsetHeight;

    window.requestAnimationFrame(() => {
        styleElement.remove();
    });
}

export const applyThemePreference = (theme: Theme) => {
    if (typeof document === 'undefined') {
        return;
    }

    suppressTransitionsAcrossThemeSwitch(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    });
}

export const initializeThemePreference = () => {
    const theme = readAppPreferences().appearance.theme;
    applyThemePreference(theme);

    return theme;
}

export const rememberConnectedOrg = (
    connectionInfo: SalesforceConnectionInfo | null
) => {
    if (!connectionInfo) {
        return;
    }

    const orgPreference: StoredOrgPreference = {
        orgId: connectionInfo.orgId,
        orgName: connectionInfo.orgName,
        environment: connectionInfo.environment,
        instanceUrl: connectionInfo.instanceUrl,
        connectedAt: connectionInfo.connectedAt
    };

    updateAppPreferences(preferences => ({
        ...preferences,
        connection: {
            lastConnectedOrg: orgPreference,
            recentOrgs: [
                orgPreference,
                ...preferences.connection.recentOrgs.filter(org => org.orgId !== orgPreference.orgId)
            ].slice(0, 5)
        }
    }));
}

export const persistThemePreference = (theme: Theme) => {
    updateAppPreferences(preferences => ({
        ...preferences,
        appearance: {
            ...preferences.appearance,
            theme
        }
    }));
}

export const persistShowInsightsPreference = (showInsights: boolean) => {
    updateAppPreferences(preferences => ({
        ...preferences,
        preferences: {
            ...preferences.preferences,
            showInsights
        }
    }));
}

export const persistPollingPreferences = (
    polling: Partial<AppPreferences['polling']>
) => {
    return updateAppPreferences(preferences => ({
        ...preferences,
        polling: {
            ...preferences.polling,
            ...polling
        }
    }));
}

export const persistLogBodyPreferences = (
    logBody: Partial<AppPreferences['logBody']>
) => {
    return updateAppPreferences(preferences => ({
        ...preferences,
        logBody: {
            ...preferences.logBody,
            ...logBody
        }
    }));
}

export const persistAdvancedLogFilter = (advanced: AdvancedLogFilter) => {
    updateAppPreferences(preferences => ({
        ...preferences,
        logFilter: {
            ...preferences.logFilter,
            advanced
        }
    }));
}

export const persistLogTableSortingPreference = (
    sortBy: SortBy,
    sortDirection: SortDirection
) => {
    updateAppPreferences(preferences => ({
        ...preferences,
        logTable: {
            ...preferences.logTable,
            sortBy,
            sortDirection
        }
    }));
}
