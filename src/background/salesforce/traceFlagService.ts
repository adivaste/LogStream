import { salesforceClient } from "./salesforceClient";
import { DEFAULT_TRACE_FLAG_DEBUG_LEVEL_NAME } from "@/lib/traceFlagConfig";
import type {
    SalesforceSession,
    SalesforceUser,
    SalesforceUserId
} from "@/types/salesforce";
import type { TraceFlagUserSummary } from "@/types/workerMessages";

type UserRecord = {
    Id: string;
    Name: string;
    Username: string;
    Email: string | null;
    IsActive: boolean;
    SmallPhotoUrl: string | null;
}

type DebugLevelRecord = {
    Id: string;
    DeveloperName: string;
}

type TraceFlagRecord = {
    Id: string;
    TracedEntityId: string;
    DebugLevelId: string;
    ExpirationDate: string;
    DebugLevel: { DeveloperName: string } | null;
}

const ACTIVE_USER_QUERY = [
    'SELECT Id, Name, Username, Email, IsActive, SmallPhotoUrl',
    'FROM User',
    'WHERE IsActive = true',
    'ORDER BY Name ASC',
    'LIMIT 2000'
].join(' ');

const quoteSoqlString = (value: string) => {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const mapUserRecord = (record: UserRecord): SalesforceUser => {
    return {
        id: record.Id,
        username: record.Username,
        name: record.Name,
        email: record.Email,
        isActive: record.IsActive,
        smallPhotoUrl: record.SmallPhotoUrl
    };
}

const getOrCreateDebugLevelId = async (debugLevelName: string) => {
    const existing = await salesforceClient.toolingQuery<DebugLevelRecord>(
        `SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = ${quoteSoqlString(debugLevelName)} LIMIT 1`
    );

    if (existing.records.length > 0) {
        return existing.records[0]!.Id;
    }

    const created = await salesforceClient.toolingCreate('DebugLevel', {
        DeveloperName: debugLevelName,
        MasterLabel: debugLevelName,
        ApexCode: 'FINEST',
        ApexProfiling: 'FINEST',
        Callout: 'FINEST',
        Database: 'FINEST',
        System: 'DEBUG',
        Validation: 'INFO',
        Visualforce: 'FINEST',
        Workflow: 'INFO'
    });

    return created.id;
}

// SOQL query strings are capped at 20,000 characters, so a single `IN (...)`
// clause can't safely hold up to 2000 18-char user IDs - chunk the lookup.
const TRACE_FLAG_LOOKUP_BATCH_SIZE = 200;

const chunk = <TItem>(items: TItem[], size: number): TItem[][] => {
    const chunks: TItem[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

const getTraceFlagsForUsers = async (userIds: SalesforceUserId[]) => {
    if (userIds.length === 0) {
        return new Map<SalesforceUserId, TraceFlagRecord>();
    }

    const batches = chunk(userIds, TRACE_FLAG_LOOKUP_BATCH_SIZE);
    const responses = await Promise.all(
        batches.map(batch => salesforceClient.toolingQuery<TraceFlagRecord>(
            [
                'SELECT Id, TracedEntityId, DebugLevelId, ExpirationDate, DebugLevel.DeveloperName',
                'FROM TraceFlag',
                `WHERE TracedEntityId IN (${batch.map(quoteSoqlString).join(',')})`
            ].join(' ')
        ))
    );

    return new Map(
        responses
            .flatMap(response => response.records)
            .map(record => [record.TracedEntityId, record] as const)
    );
}

const toTraceFlagUserSummary = (
    user: SalesforceUser,
    traceFlag: TraceFlagRecord | undefined
): TraceFlagUserSummary => {
    if (!traceFlag) {
        return {
            user,
            hasTraceFlag: false,
            traceFlagId: null,
            expiresAt: null,
            remainingMs: null,
            debugLevelName: null
        };
    }

    const expiresAtMs = new Date(traceFlag.ExpirationDate).getTime();
    const remainingMs = Number.isNaN(expiresAtMs) ? null : expiresAtMs - Date.now();
    const isActive = remainingMs !== null && remainingMs > 0;

    return {
        user,
        hasTraceFlag: isActive,
        traceFlagId: traceFlag.Id,
        expiresAt: traceFlag.ExpirationDate,
        remainingMs: isActive ? remainingMs : null,
        debugLevelName: traceFlag.DebugLevel?.DeveloperName ?? null
    };
}

export const traceFlagService = {
    defaultDebugLevelName: DEFAULT_TRACE_FLAG_DEBUG_LEVEL_NAME,

    async getTraceFlagUsers(): Promise<TraceFlagUserSummary[]> {
        const userRecords = await salesforceClient.restQueryAll<UserRecord>(ACTIVE_USER_QUERY);
        const users = userRecords.map(mapUserRecord);
        const traceFlagsByUserId = await getTraceFlagsForUsers(users.map(user => user.id));

        return users.map(user => toTraceFlagUserSummary(user, traceFlagsByUserId.get(user.id)));
    },

    // Returns only the single affected user's summary rather than refetching the
    // whole org - the caller previously refetched every user + trace flag after
    // every toggle, which for a large org meant ~10+ extra Salesforce API calls
    // for a one-row change.
    async setTraceFlag(
        _session: SalesforceSession,
        userId: SalesforceUserId,
        expiresAt: string,
        debugLevelName: string
    ): Promise<TraceFlagUserSummary> {
        const [userResponse, existing] = await Promise.all([
            salesforceClient.restQuery<UserRecord>(
                [
                    'SELECT Id, Name, Username, Email, IsActive, SmallPhotoUrl',
                    'FROM User',
                    `WHERE Id = ${quoteSoqlString(userId)}`,
                    'LIMIT 1'
                ].join(' ')
            ),
            salesforceClient.toolingQuery<{ Id: string }>(
                `SELECT Id FROM TraceFlag WHERE TracedEntityId = ${quoteSoqlString(userId)} LIMIT 1`
            )
        ]);
        const userRecord = userResponse.records[0];

        if (!userRecord) {
            throw new Error('The selected user could not be found in this org.');
        }

        const user = mapUserRecord(userRecord);
        const existingTraceFlagId = existing.records[0]?.Id ?? null;
        const isDisabling = new Date(expiresAt).getTime() <= Date.now();

        if (isDisabling) {
            if (existingTraceFlagId) {
                await salesforceClient.toolingDelete('TraceFlag', existingTraceFlagId);
            }

            return toTraceFlagUserSummary(user, undefined);
        }

        const debugLevelId = await getOrCreateDebugLevelId(debugLevelName);

        if (existingTraceFlagId) {
            // Salesforce validates ExpirationDate against the flag's existing StartDate
            // (max 24h apart), not against now - so re-enabling a flag whose StartDate
            // is more than a day old rejects with FIELD_INTEGRITY_EXCEPTION unless we
            // also reset StartDate here.
            await salesforceClient.toolingUpdate('TraceFlag', existingTraceFlagId, {
                DebugLevelId: debugLevelId,
                StartDate: new Date().toISOString(),
                ExpirationDate: expiresAt
            });

            return toTraceFlagUserSummary(user, {
                Id: existingTraceFlagId,
                TracedEntityId: userId,
                DebugLevelId: debugLevelId,
                ExpirationDate: expiresAt,
                DebugLevel: { DeveloperName: debugLevelName }
            });
        }

        const created = await salesforceClient.toolingCreate('TraceFlag', {
            TracedEntityId: userId,
            DebugLevelId: debugLevelId,
            LogType: 'USER_DEBUG',
            StartDate: new Date().toISOString(),
            ExpirationDate: expiresAt
        });

        return toTraceFlagUserSummary(user, {
            Id: created.id,
            TracedEntityId: userId,
            DebugLevelId: debugLevelId,
            ExpirationDate: expiresAt,
            DebugLevel: { DeveloperName: debugLevelName }
        });
    }
};
