// ==== Salesforce Identity & Connection Types ====
export type SalesforceOrgId = string;
export type SalesforceUserId = string;
export type SalesforceSessionId = string;
export type SalesforceInstanceUrl = string;
export type SalesforceApiVersion = string;

export enum SalesforceEnvironment {
    Production = "Production",
    Sandbox = "Sandbox",
    Developer = "Developer",
    UAT = "UAT",
    Unknown = "Unknown"
}

export type SalesforceConnectionInfo = {
    orgId: SalesforceOrgId;
    orgName: string | null;
    userId: SalesforceUserId | null;
    instanceUrl: SalesforceInstanceUrl;
    apiVersion: SalesforceApiVersion;
    environment: SalesforceEnvironment;
    connectedAt: string;
}

export type SalesforceSession = SalesforceConnectionInfo & {
    sessionId: SalesforceSessionId;
    expiresAt: string | null;
}

// ==== Salesforce User Types ====
export type SalesforceUser = {
    id: SalesforceUserId;
    username: string;
    name: string;
    email: string | null;
    isActive: boolean;
    smallPhotoUrl: string | null;
}

// ==== Apex Log Types ====
export type SalesforceLogId = string;

export type ApexLogStatus =
    | 'Success'
    | 'OperationFailed'
    | 'Internal Salesforce.com Error'
    | 'Unknown';

export type SalesforceLogEntry = {
    id: SalesforceLogId;
    orgId: SalesforceOrgId;
    startTime: string;
    application: string | null;
    durationMs: number | null;
    byteLength: number;
    logUserId: SalesforceUserId;
    logUserName: string | null;
    operation: string;
    request: string | null;
    requestIdentifier: string | null;
    status: ApexLogStatus | string;
    hasErrors: boolean;
    readAt: string | null;
    bodyStatus?: 'not_fetched' | 'queued' | 'fetching' | 'cached' | 'failed' | 'too_large';
}

export type SalesforceLogRecord = {
    logId: SalesforceLogId;
    orgId: SalesforceOrgId;
    body: string;
    byteLength: number;
    lineCount: number;
    errorLineNumbers: number[];
    fetchedAt: string;
}

export type ApexLogCursor = {
    lastStartTime: string | null;
    seenLogIdsAtLastStartTime: SalesforceLogId[];
}

// ==== Trace Flag & Debug Level Types ====
export type SalesforceTraceFlagId = string;
export type SalesforceDebugLevelId = string;

export type SalesforceTraceFlag = {
    id: SalesforceTraceFlagId;
    orgId: SalesforceOrgId;
    tracedEntityId: SalesforceUserId;
    debugLevelId: SalesforceDebugLevelId;
    debugLevelName: string | null;
    logType: string;
    startDate: string;
    expirationDate: string;
}

export type SalesforceDebugLevel = {
    id: SalesforceDebugLevelId;
    orgId: SalesforceOrgId;
    developerName: string;
    apexCode: string;
    apexProfiling: string;
    callout: string;
    database: string;
    system: string;
    validation: string;
    visualforce: string;
    workflow: string;
}

// ==== Tooling API Response Shapes ====
export type SalesforceQueryResponse<TRecord> = {
    totalSize: number;
    done: boolean;
    records: TRecord[];
    nextRecordsUrl?: string;
}

export type SalesforceApiLimitInfo = {
    used: number;
    limit: number;
}
