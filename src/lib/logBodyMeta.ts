const ERROR_LINE_PATTERN = /\|(FATAL_ERROR|EXCEPTION_THROWN)\|/;

export const countLogBodyLines = (body: string) => {
    if (!body) {
        return 0;
    }

    let lineCount = 1;

    for (let index = 0; index < body.length; index += 1) {
        if (body.charCodeAt(index) === 10) {
            lineCount += 1;
        }
    }

    return lineCount;
}

export const getErrorLineNumbers = (body: string) => {
    const errorLineNumbers: number[] = [];
    const lines = body.split(/\r?\n/);

    lines.forEach((line, index) => {
        if (ERROR_LINE_PATTERN.test(line)) {
            errorLineNumbers.push(index + 1);
        }
    });

    return errorLineNumbers;
}

export type LimitUsageMetric = {
    key: string;
    label: string;
    used: number;
    limit: number;
}

// A transaction can log its CUMULATIVE_LIMIT_USAGE block more than once
// (once per namespace, or at intermediate checkpoints) - only the metric
// name + "used out of limit" shape is stable across log versions, so each
// pattern is matched globally and the *last* occurrence is kept, since that
// reflects the final, most complete count for the whole request.
const LIMIT_METRIC_PATTERNS: { key: string; label: string; pattern: RegExp }[] = [
    { key: 'soql', label: 'SOQL', pattern: /Number of SOQL queries: (\d+) out of (\d+)/g },
    { key: 'queryRows', label: 'Query Rows', pattern: /Number of query rows: (\d+) out of (\d+)/g },
    { key: 'dml', label: 'DML', pattern: /Number of DML statements: (\d+) out of (\d+)/g },
    { key: 'dmlRows', label: 'DML Rows', pattern: /Number of DML rows: (\d+) out of (\d+)/g },
    { key: 'cpu', label: 'CPU Time', pattern: /Maximum CPU time: (\d+) out of (\d+)/g },
    { key: 'heap', label: 'Heap', pattern: /Maximum heap size: (\d+) out of (\d+)/g },
    { key: 'callouts', label: 'Callouts', pattern: /Number of callouts: (\d+) out of (\d+)/g }
];

export const parseLimitUsage = (body: string): LimitUsageMetric[] => {
    const metrics: LimitUsageMetric[] = [];

    for (const { key, label, pattern } of LIMIT_METRIC_PATTERNS) {
        let lastMatch: RegExpExecArray | null = null;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(body)) !== null) {
            lastMatch = match;
        }

        if (lastMatch) {
            metrics.push({
                key,
                label,
                used: Number.parseInt(lastMatch[1] ?? '0', 10),
                limit: Number.parseInt(lastMatch[2] ?? '0', 10)
            });
        }
    }

    return metrics;
}

export const formatByteSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }

    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)}KB`;
    }

    return `${bytes}B`;
}
