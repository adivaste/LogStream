import { logRepository } from "@/background/db/logRepository";
import { logBodyRepository } from "@/background/db/logBodyRepository";
import { countLogBodyLines, getErrorLineNumbers } from "@/lib/logBodyMeta";
import { salesforceClient } from "./salesforceClient";
import type {
    ApexLogCursor,
    SalesforceLogId,
    SalesforceLogRecord,
    SalesforceLogEntry,
    SalesforceSession
} from "@/types/salesforce";

type ApexLogToolingRecord = {
    Id: string;
    LogUserId: string;
    LogLength: number | null;
    StartTime: string;
    Status: string;
    Operation: string | null;
    Request: string | null;
    Application: string | null;
    DurationMilliseconds: number | null;
}

type UserRecord = {
    Id: string;
    Name: string | null;
}

const userNameCache = new Map<string, string>();

const RECENT_APEX_LOG_QUERY = [
    'SELECT Id, LogUserId, LogLength, StartTime, Status, Operation, Request, Application, DurationMilliseconds',
    'FROM ApexLog',
    'ORDER BY StartTime DESC',
    'LIMIT 200'
].join(' ');

const INITIAL_APEX_LOG_QUERY = [
    'SELECT Id, LogUserId, LogLength, StartTime, Status, Operation, Request, Application, DurationMilliseconds',
    'FROM ApexLog',
    'ORDER BY StartTime DESC',
    'LIMIT 200'
].join(' ');

const createIncrementalApexLogQuery = (cursor: ApexLogCursor) => {
    if (!cursor.lastStartTime) {
        return INITIAL_APEX_LOG_QUERY;
    }

    return [
        'SELECT Id, LogUserId, LogLength, StartTime, Status, Operation, Request, Application, DurationMilliseconds',
        'FROM ApexLog',
        `WHERE StartTime >= ${quoteSoqlDateTime(cursor.lastStartTime)}`,
        'ORDER BY StartTime ASC',
        'LIMIT 200'
    ].join(' ');
}

const createOlderApexLogQuery = (
    beforeStartTime: string,
    afterStartTime: string | null,
    limit: number
) => {
    const conditions = [
        `StartTime < ${quoteSoqlDateTime(beforeStartTime)}`
    ];

    if (afterStartTime) {
        conditions.push(`StartTime >= ${quoteSoqlDateTime(afterStartTime)}`);
    }

    return [
        'SELECT Id, LogUserId, LogLength, StartTime, Status, Operation, Request, Application, DurationMilliseconds',
        'FROM ApexLog',
        `WHERE ${conditions.join(' AND ')}`,
        'ORDER BY StartTime DESC',
        `LIMIT ${Math.max(1, Math.min(limit, 200))}`
    ].join(' ');
}

const mapApexLogRecord = (
    record: ApexLogToolingRecord,
    session: SalesforceSession,
    userNameById: Map<string, string>
): SalesforceLogEntry => {
    return {
        id: record.Id,
        orgId: session.orgId,
        startTime: record.StartTime,
        application: record.Application,
        durationMs: record.DurationMilliseconds,
        byteLength: record.LogLength ?? 0,
        logUserId: record.LogUserId,
        logUserName: userNameById.get(record.LogUserId) ?? null,
        operation: record.Operation ?? 'Unknown',
        request: record.Request,
        requestIdentifier: null,
        status: record.Status,
        hasErrors: record.Status !== 'Success',
        readAt: null,
        bodyStatus: 'not_fetched'
    };
}

const quoteSoqlString = (value: string) => {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const quoteSoqlDateTime = (value: string) => {
    return value;
}

const getNextCursor = (
    logs: SalesforceLogEntry[],
    fallbackCursor: ApexLogCursor
): ApexLogCursor => {
    const newestStartTime = logs.at(-1)?.startTime ?? fallbackCursor.lastStartTime;

    if (!newestStartTime) {
        return fallbackCursor;
    }

    const seenLogIdsAtLastStartTime = new Set(
        newestStartTime === fallbackCursor.lastStartTime
            ? fallbackCursor.seenLogIdsAtLastStartTime
            : []
    );

    logs
        .filter(log => log.startTime === newestStartTime)
        .forEach(log => seenLogIdsAtLastStartTime.add(log.id));

    return {
        lastStartTime: newestStartTime,
        seenLogIdsAtLastStartTime: [...seenLogIdsAtLastStartTime]
    };
}

const filterRecordsAfterCursor = (
    records: ApexLogToolingRecord[],
    cursor: ApexLogCursor
) => {
    if (!cursor.lastStartTime) {
        return records;
    }

    const seenLogIds = new Set(cursor.seenLogIdsAtLastStartTime);

    return records.filter(record => {
        if (record.StartTime > cursor.lastStartTime!) {
            return true;
        }

        return record.StartTime === cursor.lastStartTime && !seenLogIds.has(record.Id);
    });
}

const compareLogsByStartTimeAscending = (
    firstLog: SalesforceLogEntry,
    secondLog: SalesforceLogEntry
) => {
    const startTimeComparison = firstLog.startTime.localeCompare(secondLog.startTime);

    if (startTimeComparison !== 0) {
        return startTimeComparison;
    }

    return firstLog.id.localeCompare(secondLog.id);
}

const getUserNameById = async (userIds: string[]) => {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    const missingUserIds = uniqueUserIds.filter(userId => !userNameCache.has(userId));

    if (missingUserIds.length > 0) {
        const userQuery = [
            'SELECT Id, Name',
            'FROM User',
            `WHERE Id IN (${missingUserIds.map(quoteSoqlString).join(',')})`
        ].join(' ');
        const response = await salesforceClient.restQuery<UserRecord>(userQuery);

        response.records.forEach(record => {
            if (record.Name) {
                userNameCache.set(record.Id, record.Name);
            }
        });
    }

    return new Map(
        uniqueUserIds
            .map(userId => [userId, userNameCache.get(userId)] as const)
            .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    );
}

export const apexLogService = {
    async refreshRecentLogs(session: SalesforceSession) {
        const response = await salesforceClient.toolingQuery<ApexLogToolingRecord>(
            RECENT_APEX_LOG_QUERY
        );
        const userNameById = await getUserNameById(
            response.records.map(record => record.LogUserId)
        );
        const logs = response.records.map(record => {
            return mapApexLogRecord(record, session, userNameById);
        });

        await logRepository.upsertMany(logs);

        return logs;
    },

    async syncLogsAfterCursor(
        session: SalesforceSession,
        cursor: ApexLogCursor
    ) {
        const response = await salesforceClient.toolingQuery<ApexLogToolingRecord>(
            createIncrementalApexLogQuery(cursor)
        );
        const newRecords = filterRecordsAfterCursor(response.records, cursor);

        if (newRecords.length === 0) {
            return {
                logs: [],
                cursor
            };
        }

        const userNameById = await getUserNameById(
            newRecords.map(record => record.LogUserId)
        );
        const newLogs = newRecords
            .map(record => {
                return mapApexLogRecord(record, session, userNameById);
            })
            .sort(compareLogsByStartTimeAscending);

        await logRepository.upsertMany(newLogs);

        return {
            logs: newLogs,
            cursor: getNextCursor(newLogs, cursor)
        };
    },

    async fetchOlderLogs(
        session: SalesforceSession,
        beforeStartTime: string,
        afterStartTime: string | null,
        limit: number
    ) {
        const response = await salesforceClient.toolingQuery<ApexLogToolingRecord>(
            createOlderApexLogQuery(beforeStartTime, afterStartTime, limit)
        );
        const userNameById = await getUserNameById(
            response.records.map(record => record.LogUserId)
        );
        const logs = response.records.map(record => {
            return mapApexLogRecord(record, session, userNameById);
        });

        await logRepository.upsertMany(logs);

        return logs;
    },

    async getLogBody(
        session: SalesforceSession,
        logId: SalesforceLogId
    ) {
        const cachedRecord = await logBodyRepository.get(session.orgId, logId);

        if (cachedRecord) {
            return cachedRecord;
        }

        const body = await salesforceClient.toolingText(
            `/sobjects/ApexLog/${logId}/Body/`
        );
        const record: SalesforceLogRecord = {
            orgId: session.orgId,
            logId,
            body,
            byteLength: body.length,
            lineCount: countLogBodyLines(body),
            errorLineNumbers: getErrorLineNumbers(body),
            fetchedAt: new Date().toISOString()
        };

        await logBodyRepository.save(record);

        return record;
    }
};
