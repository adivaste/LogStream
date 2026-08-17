// Generates fake Apex log bodies for `npm run dev`, where there is no
// Salesforce org to fetch from.
//
// The shape matters as much as the size: this emits properly *nested*
// METHOD_ENTRY/METHOD_EXIT pairs with monotonically increasing nanosecond
// timestamps, a loop that fires the same query repeatedly, and a deep-ish
// stack - so the call-tree view exercises real nesting, self-vs-total timing
// and repeat aggregation in dev rather than rendering a flat, meaningless
// list. One profile is deliberately truncated mid-transaction to exercise the
// unclosed-frame path.

const APEX_CLASSES = [
    'AccountTriggerHandler',
    'OpportunityService',
    'InvoiceBatch',
    'UserProfileController',
    'LogStreamDiagnostics'
];

const SOQL_QUERIES = [
    "SELECT Id, Name, OwnerId FROM Account WHERE Name LIKE 'Acme%'",
    'SELECT Id, Amount, StageName FROM Opportunity WHERE AccountId = :accountId',
    'SELECT Id, Email FROM User WHERE IsActive = true'
];

type MockSizeProfile = {
    every: number;
    label: string;
    targetBytes: number;
    isTruncated: boolean;
}

// `every: 1` matches every log id, so this list always resolves - but it's
// typed and indexed explicitly rather than relying on a trailing `[len - 1]`
// lookup, which is `| undefined` under noUncheckedIndexedAccess.
const FALLBACK_SIZE_PROFILE: MockSizeProfile = {
    every: 1, label: 'S', targetBytes: 700 * 1024, isTruncated: false
};

const SIZE_PROFILES: MockSizeProfile[] = [
    { every: 97, label: 'XL', targetBytes: 12 * 1024 * 1024, isTruncated: false },
    { every: 37, label: 'L', targetBytes: 6 * 1024 * 1024, isTruncated: true },
    { every: 11, label: 'M', targetBytes: 2 * 1024 * 1024, isTruncated: false },
    FALLBACK_SIZE_PROFILE
];

const getNumericLogId = (logId: string) => {
    return Number.parseInt(logId.replace(/\D/g, ''), 10) || 0;
}

export const getMockLogBodySizeProfile = (logId: string) => {
    const numericLogId = getNumericLogId(logId);

    return SIZE_PROFILES.find(profile => numericLogId % profile.every === 0) ?? FALLBACK_SIZE_PROFILE;
}

// Real logs carry `HH:MM:SS.mmm (nanosSinceTransactionStart)|EVENT|...`, and
// the nanos field is what every duration in the call tree is derived from.
const formatTimestamp = (nanos: number) => {
    const totalMs = Math.floor(nanos / 1_000_000);
    const seconds = String(42 + Math.floor(totalMs / 1000) % 18).padStart(2, '0');
    const millis = String(totalMs % 1000).padStart(3, '0');

    return `15:42:${seconds}.${millis} (${nanos})`;
}

type LogWriter = {
    lines: string[];
    nanos: number;
    byteLength: number;
}

const write = (writer: LogWriter, elapsedMicros: number, rest: string) => {
    writer.nanos += elapsedMicros * 1000;

    const line = `${formatTimestamp(writer.nanos)}|${rest}`;

    writer.lines.push(line);
    writer.byteLength += line.length + 1;
}

const writeSoql = (writer: LogWriter, apexLine: number, queryIndex: number, rows: number) => {
    const query = SOQL_QUERIES[queryIndex % SOQL_QUERIES.length];

    write(writer, 40, `SOQL_EXECUTE_BEGIN|[${apexLine}]|Aggregations:0|${query}`);
    write(writer, 320, `SOQL_EXECUTE_END|[${apexLine}]|Rows:${rows}`);
}

const writeDml = (writer: LogWriter, apexLine: number, rows: number) => {
    write(writer, 60, `DML_BEGIN|[${apexLine}]|Op:Update|Type:Account|Rows:${rows}`);
    write(writer, 900, `DML_END|[${apexLine}]`);
}

// One complete inner transaction: a handler calling a service, a loop that
// fires the same query many times (the N+1 shape the tree is meant to expose),
// then some DML and a debug statement.
const writeTransaction = (writer: LogWriter, iteration: number) => {
    const className = APEX_CLASSES[iteration % APEX_CLASSES.length];

    write(writer, 120, `CODE_UNIT_STARTED|[EXTERNAL]|01q000000000${iteration % 100}|${className} on Account trigger event AfterUpdate`);
    write(writer, 80, `METHOD_ENTRY|[12]|01p000000000001|${className}.onAfterUpdate()`);
    write(writer, 40, `METHOD_ENTRY|[34]|01p000000000002|${className}.recalculateRevenue()`);

    // The loop: same call site, fired repeatedly. Aggregation collapses this
    // to a single `xN` row in the tree.
    for (let index = 0; index < 12; index += 1) {
        writeSoql(writer, 47, iteration, 3 + (index % 5));
    }

    write(writer, 60, `METHOD_ENTRY|[58]|01p000000000003|${className}.applyDiscountRules()`);
    write(writer, 200, `USER_DEBUG|[61]|DEBUG|applied discount tier ${iteration % 4}`);
    writeDml(writer, 64, 1 + (iteration % 9));
    write(writer, 40, `METHOD_EXIT|[58]|01p000000000003|${className}.applyDiscountRules()`);

    write(writer, 30, `METHOD_EXIT|[34]|01p000000000002|${className}.recalculateRevenue()`);

    write(writer, 50, `METHOD_ENTRY|[71]|01p000000000004|${className}.notifyOwners()`);
    writeSoql(writer, 74, iteration + 1, 2);
    write(writer, 40, `METHOD_EXIT|[71]|01p000000000004|${className}.notifyOwners()`);

    if (iteration % 23 === 0) {
        write(writer, 20, 'EXCEPTION_THROWN|[88]|System.QueryException: List has no rows for assignment to SObject');
    }

    if (iteration % 41 === 0) {
        write(writer, 20, 'FATAL_ERROR|System.NullPointerException: Attempt to de-reference a null object');
    }

    write(writer, 30, `METHOD_EXIT|[12]|01p000000000001|${className}.onAfterUpdate()`);
    write(writer, 40, `CODE_UNIT_FINISHED|${className} on Account trigger event AfterUpdate`);
}

const buildLogBodyToSize = (targetBytes: number, isTruncated: boolean) => {
    const writer: LogWriter = { lines: [], nanos: 3_038_000, byteLength: 0 };

    writer.lines.push('55.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;DB,INFO;SYSTEM,DEBUG');
    write(writer, 0, 'EXECUTION_STARTED');

    let iteration = 0;

    while (writer.byteLength < targetBytes) {
        writeTransaction(writer, iteration);
        iteration += 1;
    }

    if (isTruncated) {
        // Leave the outermost frames open, exactly as a real over-size log
        // does - the parser has to auto-close them and flag the tree.
        write(writer, 120, 'CODE_UNIT_STARTED|[EXTERNAL]|01q000000000999|InvoiceBatch on Account trigger event AfterUpdate');
        write(writer, 80, 'METHOD_ENTRY|[12]|01p000000000001|InvoiceBatch.onAfterUpdate()');
        writeSoql(writer, 47, 0, 4);
        writer.lines.push('*********** MAXIMUM DEBUG LOG SIZE REACHED ***********');

        return writer.lines.join('\n');
    }

    write(writer, 200, 'CUMULATIVE_LIMIT_USAGE');
    write(writer, 0, 'LIMIT_USAGE_FOR_NS|(default)|');
    writer.lines.push('  Number of SOQL queries: 62 out of 100');
    writer.lines.push('  Number of query rows: 1420 out of 50000');
    writer.lines.push('  Number of DML statements: 14 out of 150');
    writer.lines.push('  Number of DML rows: 96 out of 10000');
    writer.lines.push('  Maximum CPU time: 4812 out of 10000');
    writer.lines.push('  Maximum heap size: 1204880 out of 6000000');
    write(writer, 10, 'CUMULATIVE_LIMIT_USAGE_END');
    write(writer, 40, 'EXECUTION_FINISHED');

    return writer.lines.join('\n');
}

export const getMockLogBody = async (logId: string) => {
    const profile = getMockLogBodySizeProfile(logId);
    const body = buildLogBodyToSize(profile.targetBytes, profile.isTruncated);

    await new Promise(resolve => globalThis.setTimeout(resolve, 120));

    return body;
}
