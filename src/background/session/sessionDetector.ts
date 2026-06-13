import {
    SalesforceEnvironment,
    type SalesforceApiVersion,
    type SalesforceInstanceUrl,
    type SalesforceOrgId,
    type SalesforceSession
} from "@/types/salesforce";

const SALESFORCE_SID_COOKIE_NAME = 'sid';
const DEFAULT_SALESFORCE_API_VERSION: SalesforceApiVersion = '66.0';

const SALESFORCE_COOKIE_SEARCH_DOMAINS = [
    'salesforce.com',
    'cloudforce.com',
    'salesforce.mil',
    'cloudforce.mil',
    'sfcrmproducts.cn',
    'force.com'
];

const NON_API_COOKIE_DOMAINS = [
    'help.salesforce.com',
    'salesforce-setup.com'
];

type ChromeCookie = {
    domain: string;
    name: string;
    value: string;
    secure: boolean;
    expirationDate?: number;
}

type ChromeTab = {
    id?: number;
    url?: string;
}

type ChromeCookiesApi = {
    get: (_details: {
        url: string;
        name: string;
    }) => Promise<ChromeCookie | undefined>;
    getAll: (_details: {
        domain?: string;
        name?: string;
        secure?: boolean;
    }) => Promise<ChromeCookie[]>;
}

type ChromeTabsApi = {
    get: (_tabId: number) => Promise<ChromeTab>;
    query: (_queryInfo: {
        active: boolean;
        currentWindow: boolean;
    }) => Promise<ChromeTab[]>;
}

type ChromeApi = {
    cookies?: ChromeCookiesApi;
    tabs?: ChromeTabsApi;
}

type SessionCookieCandidate = {
    cookie: ChromeCookie;
    hostname: string;
}

const getChromeApi = () => {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

const stripLeadingDot = (domain: string) => {
    return domain.replace(/^\./, '').toLowerCase();
}

const normalizeSalesforceHostname = (hostname: string) => {
    return hostname
        .toLowerCase()
        .replace(/\.lightning\.force\./, '.my.salesforce.')
        .replace(/\.mcas\.ms$/, '');
}

const isSalesforceHostname = (hostname: string) => {
    const normalizedHostname = normalizeSalesforceHostname(hostname);

    return SALESFORCE_COOKIE_SEARCH_DOMAINS.some(domain => {
        return normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`);
    });
}

const isApiUsableCookie = (cookie: ChromeCookie) => {
    const cookieDomain = stripLeadingDot(cookie.domain);

    if (cookie.name !== SALESFORCE_SID_COOKIE_NAME) {
        return false;
    }

    if (!cookie.secure || !cookie.value.includes('!')) {
        return false;
    }

    return !NON_API_COOKIE_DOMAINS.some(domain => {
        return cookieDomain === domain || cookieDomain.endsWith(`.${domain}`);
    });
}

const getOrgIdFromSessionId = (sessionId: string): SalesforceOrgId | null => {
    const [orgId] = sessionId.split('!');

    return orgId || null;
}

const getActiveTabUrl = async () => {
    const tabsApi = getChromeApi()?.tabs;

    if (!tabsApi) {
        return null;
    }

    const [activeTab] = await tabsApi.query({
        active: true,
        currentWindow: true
    });

    return activeTab?.url ?? null;
}

const getTabUrlById = async (tabId: number) => {
    const tabsApi = getChromeApi()?.tabs;

    if (!tabsApi) {
        return null;
    }

    try {
        const tab = await tabsApi.get(tabId);

        return tab.url ?? null;
    } catch {
        return null;
    }
}

const detectFromUrl = async (tabUrl: string) => {
    const url = new URL(tabUrl);
    const normalizedHostname = normalizeSalesforceHostname(url.hostname);

    if (!isSalesforceHostname(normalizedHostname)) {
        return null;
    }

    const directCookie = await getSidCookieForHostname(normalizedHostname)
        ?? await getSidCookieForHostname(url.hostname);

    if (!directCookie) {
        return null;
    }

    const orgId = getOrgIdFromSessionId(directCookie.value);
    const matchingCookie = orgId
        ? await findSessionCookieForOrg(orgId)
        : null;

    if (matchingCookie) {
        return createSessionFromCookie(
            matchingCookie.cookie,
            normalizeSalesforceHostname(matchingCookie.hostname)
        );
    }

    return createSessionFromCookie(directCookie, normalizedHostname);
}

const getSidCookieForHostname = async (hostname: string) => {
    const cookiesApi = getChromeApi()?.cookies;

    if (!cookiesApi) {
        return null;
    }

    try {
        const cookie = await cookiesApi.get({
            url: `https://${hostname}`,
            name: SALESFORCE_SID_COOKIE_NAME
        });

        return cookie && isApiUsableCookie(cookie) ? cookie : null;
    } catch {
        return null;
    }
}

const findSessionCookieForOrg = async (
    orgId: SalesforceOrgId
): Promise<SessionCookieCandidate | null> => {
    const cookiesApi = getChromeApi()?.cookies;

    if (!cookiesApi) {
        return null;
    }

    for (const domain of SALESFORCE_COOKIE_SEARCH_DOMAINS) {
        try {
            const cookies = await cookiesApi.getAll({
                name: SALESFORCE_SID_COOKIE_NAME,
                domain,
                secure: true
            });
            const cookie = cookies.find(candidate => {
                return isApiUsableCookie(candidate)
                    && candidate.value.startsWith(`${orgId}!`);
            });

            if (cookie) {
                return {
                    cookie,
                    hostname: stripLeadingDot(cookie.domain)
                };
            }
        } catch {
            // Missing host permissions for one Salesforce domain should not stop other domains.
        }
    }

    return null;
}

const inferEnvironment = (hostname: string) => {
    if (hostname.includes('.sandbox.')) {
        return SalesforceEnvironment.Sandbox;
    }

    if (hostname.endsWith('.my.salesforce.com') || hostname.endsWith('.salesforce.com')) {
        return SalesforceEnvironment.Production;
    }

    return SalesforceEnvironment.Unknown;
}

const createSessionFromCookie = (
    cookie: ChromeCookie,
    hostname: string
): SalesforceSession | null => {
    const orgId = getOrgIdFromSessionId(cookie.value);

    if (!orgId) {
        return null;
    }

    const instanceUrl: SalesforceInstanceUrl = `https://${hostname}`;

    return {
        orgId,
        orgName: null,
        userId: null,
        sessionId: cookie.value,
        instanceUrl,
        apiVersion: DEFAULT_SALESFORCE_API_VERSION,
        environment: inferEnvironment(hostname),
        connectedAt: new Date().toISOString(),
        expiresAt: cookie.expirationDate
            ? new Date(cookie.expirationDate * 1000).toISOString()
            : null
    };
}

export const sessionDetector = {
    async detectFromTabContext({
        sourceTabId,
        sourceUrl
    }: {
        sourceTabId?: number;
        sourceUrl?: string;
    } = {}) {
        const sourceTabUrl = sourceUrl
            ?? (typeof sourceTabId === 'number' ? await getTabUrlById(sourceTabId) : null)
            ?? await getActiveTabUrl();

        if (!sourceTabUrl) {
            return null;
        }

        try {
            return await detectFromUrl(sourceTabUrl);
        } catch {
            return null;
        }
    },

    async detectFromActiveTab() {
        return this.detectFromTabContext();
    }
};

export {
    SALESFORCE_COOKIE_SEARCH_DOMAINS,
    SALESFORCE_SID_COOKIE_NAME,
    normalizeSalesforceHostname
};
