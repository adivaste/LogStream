import type { SalesforceConnectionInfo, SalesforceOrgId } from "@/types/salesforce";
import { SortBy, SortDirection, type Theme } from "@/types/ui";

const APP_PREFERENCES_STORAGE_KEY = 'logstream-preferences';
const LEGACY_THEME_STORAGE_KEY = 'logstream-theme';
const APP_PREFERENCES_VERSION = 1;

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
    logTable: {
        sortBy: SortBy;
        sortDirection: SortDirection;
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
    logTable: {
        sortBy: SortBy.TIMESTAMP,
        sortDirection: SortDirection.DESC
    },
    connection: {
        lastConnectedOrg: null,
        recentOrgs: []
    }
};

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
}

const isTheme = (value: unknown): value is Theme => {
    return value === 'light' || value === 'dark';
}

const isBoolean = (value: unknown): value is boolean => {
    return typeof value === 'boolean';
}

const isSortBy = (value: unknown): value is SortBy => {
    return Object.values(SortBy).includes(value as SortBy);
}

const isSortDirection = (value: unknown): value is SortDirection => {
    return Object.values(SortDirection).includes(value as SortDirection);
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
    const logTable = isObject(value.logTable) ? value.logTable : {};
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
        logTable: {
            sortBy: isSortBy(logTable.sortBy)
                ? logTable.sortBy
                : DEFAULT_APP_PREFERENCES.logTable.sortBy,
            sortDirection: isSortDirection(logTable.sortDirection)
                ? logTable.sortDirection
                : DEFAULT_APP_PREFERENCES.logTable.sortDirection
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

export const applyThemePreference = (theme: Theme) => {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.classList.toggle('dark', theme === 'dark');
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
