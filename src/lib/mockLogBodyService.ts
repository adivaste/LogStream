const APEX_LOG_EVENTS = [
    'USER_DEBUG',
    'METHOD_ENTRY',
    'METHOD_EXIT',
    'SOQL_EXECUTE_BEGIN',
    'SOQL_EXECUTE_END',
    'DML_BEGIN',
    'DML_END',
    'CUMULATIVE_LIMIT_USAGE',
    'LIMIT_USAGE_FOR_NS',
    'HEAP_ALLOCATE',
    'VARIABLE_ASSIGNMENT'
];

const APEX_CLASSES = [
    'AccountTriggerHandler',
    'OpportunityService',
    'InvoiceBatch',
    'UserProfileController',
    'LogStreamDiagnostics'
];

const SIZE_PROFILES = [
    { every: 97, label: 'XL', targetBytes: 12 * 1024 * 1024 },
    { every: 37, label: 'L', targetBytes: 6 * 1024 * 1024 },
    { every: 11, label: 'M', targetBytes: 2 * 1024 * 1024 },
    { every: 1, label: 'S', targetBytes: 700 * 1024 }
];

const getNumericLogId = (logId: string) => {
    return Number.parseInt(logId.replace(/\D/g, ''), 10) || 0;
}

export const getMockLogBodySizeProfile = (logId: string) => {
    const numericLogId = getNumericLogId(logId);

    return SIZE_PROFILES.find(profile => numericLogId % profile.every === 0) ?? SIZE_PROFILES[SIZE_PROFILES.length - 1];
}

const buildLogLine = (logId: string, index: number) => {
    const event = APEX_LOG_EVENTS[index % APEX_LOG_EVENTS.length];
    const className = APEX_CLASSES[index % APEX_CLASSES.length];
    const seconds = String(index % 60).padStart(2, '0');
    const millis = String((index * 37) % 1000).padStart(3, '0');

    if (index % 97 === 0) {
        return `15:42:${seconds}.${millis} (${index})|EXCEPTION_THROWN|[${index % 180}]|System.QueryException: List has no rows for assignment to SObject`;
    }

    if (index % 131 === 0) {
        return `15:42:${seconds}.${millis} (${index})|FATAL_ERROR|System.NullPointerException: Attempt to de-reference a null object`;
    }

    if (event === 'SOQL_EXECUTE_BEGIN') {
        return `15:42:${seconds}.${millis} (${index})|SOQL_EXECUTE_BEGIN|[${index % 180}]|Aggregations:0|SELECT Id, Name, OwnerId FROM Account WHERE Name LIKE 'Acme%'`;
    }

    if (event === 'DML_BEGIN') {
        return `15:42:${seconds}.${millis} (${index})|DML_BEGIN|[${index % 180}]|Op:Update|Type:Account|Rows:${(index % 12) + 1}`;
    }

    if (event === 'USER_DEBUG') {
        return `15:42:${seconds}.${millis} (${index})|USER_DEBUG|[${index % 180}]|DEBUG|${logId} processed ${className}.execute with payload size ${index * 17}`;
    }

    return `15:42:${seconds}.${millis} (${index})|${event}|[${index % 180}]|${className}.${event.toLowerCase()} requestId=${logId}`;
}

const buildLogBodyToSize = (logId: string, targetBytes: number) => {
    const lines: string[] = [];
    let byteLength = 0;
    let index = 1;

    while (byteLength < targetBytes) {
        const line = buildLogLine(logId, index);

        lines.push(line);
        byteLength += line.length + 1;
        index += 1;
    }

    return lines.join('\n');
}

export const getMockLogBody = async (logId: string) => {
    const profile = getMockLogBodySizeProfile(logId);
    const body = buildLogBodyToSize(logId, profile.targetBytes);

    await new Promise(resolve => globalThis.setTimeout(resolve, 120));

    return body;
}
