import {
    type FilterLogicNode,
    evaluateFilterLogic,
    parseFilterLogic
} from "@/lib/filterLogicExpression";
import type { LogEntry } from "@/types/ui";

// The advanced filter: a flat list of typed conditions joined by a single
// AND/OR. Pure module - no React, no store - so the evaluation can be tested
// directly and reused anywhere a LogEntry list needs narrowing.

export type FilterFieldType = 'text' | 'number' | 'enum' | 'date' | 'boolean';

export type FilterOperator =
    | 'contains'
    | 'notContains'
    | 'equals'
    | 'notEquals'
    | 'startsWith'
    | 'endsWith'
    | 'isAnyOf'
    | 'isNoneOf'
    | 'isEmpty'
    | 'isNotEmpty'
    | 'greaterThan'
    | 'greaterOrEqual'
    | 'lessThan'
    | 'lessOrEqual'
    | 'between'
    | 'before'
    | 'after'
    | 'inLast'
    | 'isTrue'
    | 'isFalse';

export type RelativeTimeUnit = 'minutes' | 'hours' | 'days';

export const RELATIVE_TIME_UNITS: RelativeTimeUnit[] = ['minutes', 'hours', 'days'];

const RELATIVE_UNIT_MS: Record<RelativeTimeUnit, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000
};

export type FilterConjunction = 'and' | 'or';

export type FilterLogicState =
    | { status: 'default'; node: null; error: null; referencedIndexes: number[] }
    | { status: 'valid'; node: FilterLogicNode; error: null; referencedIndexes: number[] }
    | { status: 'invalid'; node: null; error: string; referencedIndexes: number[] };

export type FilterCondition = {
    // Stable across edits so React keys don't churn while typing.
    id: string;
    field: string;
    operator: FilterOperator;
    value: string;
    // Only used by `between`; kept as a separate slot rather than encoding
    // two numbers into `value`, which would make partial input unparseable.
    secondValue: string;
    // Only used by `isAnyOf`/`isNoneOf`. A separate slot rather than a
    // delimited string in `value`, because log values legitimately contain
    // commas and spaces.
    values: string[];
    // Only used by `inLast`. An explicit field rather than overloading
    // `secondValue` - two operators quietly sharing one slot with different
    // meanings is exactly the kind of thing that breaks on the next edit.
    unit: RelativeTimeUnit;
}

export type AdvancedLogFilter = {
    // A boolean expression over the 1-based condition numbers shown in the
    // UI, e.g. "1 AND 2 AND (3 OR 4)". Blank means "AND everything", which
    // keeps the simple case simple - you only write an expression when you
    // actually need grouping.
    logic: string;
    conditions: FilterCondition[];
}

export const EMPTY_ADVANCED_FILTER: AdvancedLogFilter = {
    logic: '',
    conditions: []
};

type FilterFieldDefinition = {
    id: string;
    label: string;
    type: FilterFieldType;
    // Suffix shown next to numeric inputs, e.g. "KB".
    unit: string | null;
    // Converts what the user typed into the unit the log stores. Size is
    // entered in KB because nobody wants to type bytes.
    toRawNumber: ((_input: number) => number) | null;
    getValue: (_log: LogEntry) => string | number | boolean | null;
}

const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
    text: [
        'contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith',
        'isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'
    ],
    enum: ['isAnyOf', 'isNoneOf', 'equals', 'notEquals', 'isEmpty', 'isNotEmpty'],
    number: ['equals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between'],
    date: ['inLast', 'after', 'before', 'between'],
    boolean: ['isTrue', 'isFalse']
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
    contains: 'contains',
    notContains: 'does not contain',
    equals: 'is',
    notEquals: 'is not',
    startsWith: 'starts with',
    endsWith: 'ends with',
    isAnyOf: 'is any of',
    isNoneOf: 'is none of',
    isEmpty: 'is empty',
    isNotEmpty: 'is not empty',
    greaterThan: 'greater than',
    greaterOrEqual: 'at least',
    lessThan: 'less than',
    lessOrEqual: 'at most',
    between: 'between',
    before: 'before',
    after: 'after',
    inLast: 'within last',
    isTrue: 'is yes',
    isFalse: 'is no'
};

// Operators that ignore the value inputs entirely - the UI hides the value
// field for these, and completeness checks must not demand a value.
const VALUELESS_OPERATORS: ReadonlySet<FilterOperator> = new Set([
    'isEmpty', 'isNotEmpty', 'isTrue', 'isFalse'
]);

const MULTI_VALUE_OPERATORS: ReadonlySet<FilterOperator> = new Set(['isAnyOf', 'isNoneOf']);

const BYTES_PER_KB = 1024;

export const FILTER_FIELDS: FilterFieldDefinition[] = [
    {
        id: 'operation', label: 'Operation', type: 'text', unit: null, toRawNumber: null,
        getValue: log => log.operation
    },
    {
        id: 'user', label: 'User', type: 'text', unit: null, toRawNumber: null,
        getValue: log => log.user
    },
    {
        id: 'app', label: 'Application', type: 'text', unit: null, toRawNumber: null,
        getValue: log => log.app
    },
    {
        id: 'operationType', label: 'Request type', type: 'text', unit: null, toRawNumber: null,
        getValue: log => log.operationType
    },
    {
        id: 'status', label: 'Status', type: 'enum', unit: null, toRawNumber: null,
        getValue: log => log.status
    },
    {
        id: 'hasErrors', label: 'Has errors', type: 'boolean', unit: null, toRawNumber: null,
        getValue: log => log.hasErrors
    },
    {
        id: 'isRead', label: 'Read', type: 'boolean', unit: null, toRawNumber: null,
        getValue: log => log.readAt !== null
    },
    {
        id: 'byteLength', label: 'Size', type: 'number', unit: 'KB',
        toRawNumber: input => input * BYTES_PER_KB,
        getValue: log => log.byteLength
    },
    {
        id: 'durationMs', label: 'Duration', type: 'number', unit: 'ms', toRawNumber: null,
        getValue: log => log.durationMs
    },
    {
        id: 'startTime', label: 'Start time', type: 'date', unit: null, toRawNumber: null,
        getValue: log => log.startTime ?? null
    }
];

const FIELD_BY_ID = new Map(FILTER_FIELDS.map(field => [field.id, field]));

export const getFilterField = (fieldId: string) => FIELD_BY_ID.get(fieldId) ?? null;

export const getOperatorsForField = (fieldId: string): FilterOperator[] => {
    const field = getFilterField(fieldId);

    return field ? OPERATORS_BY_TYPE[field.type] : [];
}

export const operatorNeedsValue = (operator: FilterOperator) => !VALUELESS_OPERATORS.has(operator);
export const operatorNeedsSecondValue = (operator: FilterOperator) => operator === 'between';
export const operatorUsesValueList = (operator: FilterOperator) => MULTI_VALUE_OPERATORS.has(operator);
export const operatorIsRelativeTime = (operator: FilterOperator) => operator === 'inLast';

// A half-typed condition must not filter anything out - otherwise the list
// blanks the moment you pick a field and before you type a value, which
// reads as "the filter is broken".
export const isConditionComplete = (condition: FilterCondition) => {
    const field = getFilterField(condition.field);

    if (!field) {
        return false;
    }

    if (!getOperatorsForField(condition.field).includes(condition.operator)) {
        return false;
    }

    if (!operatorNeedsValue(condition.operator)) {
        return true;
    }

    if (operatorUsesValueList(condition.operator)) {
        // An empty selection is inert, same as an empty text box - it must not
        // mean "matches nothing" (which would blank the list) or "matches
        // everything" (which would make the row pointless).
        return condition.values.length > 0;
    }

    if (operatorIsRelativeTime(condition.operator)) {
        const amount = Number(condition.value);

        return condition.value.trim() !== '' && !Number.isNaN(amount) && amount > 0;
    }

    if (condition.value.trim() === '') {
        return false;
    }

    if (field.type === 'number' && Number.isNaN(Number(condition.value))) {
        return false;
    }

    if (operatorNeedsSecondValue(condition.operator)) {
        if (condition.secondValue.trim() === '') {
            return false;
        }

        if (field.type === 'number' && Number.isNaN(Number(condition.secondValue))) {
            return false;
        }
    }

    return true;
}

export const getActiveConditions = (filter: AdvancedLogFilter) => {
    return filter.conditions.filter(isConditionComplete);
}

export const getActiveConditionCount = (filter: AdvancedLogFilter) => {
    return getActiveConditions(filter).length;
}

const toComparableNumber = (
    field: FilterFieldDefinition,
    rawInput: string
): number | null => {
    const parsed = Number(rawInput);

    if (rawInput.trim() === '' || Number.isNaN(parsed)) {
        return null;
    }

    return field.toRawNumber ? field.toRawNumber(parsed) : parsed;
}

const toComparableTime = (value: string): number | null => {
    const parsed = new Date(value).getTime();

    return Number.isNaN(parsed) ? null : parsed;
}

const evaluateText = (actual: string, condition: FilterCondition) => {
    const haystack = actual.toLowerCase();
    const needle = condition.value.trim().toLowerCase();

    if (operatorUsesValueList(condition.operator)) {
        const isListed = condition.values.some(listed => listed.toLowerCase() === haystack);

        return condition.operator === 'isAnyOf' ? isListed : !isListed;
    }

    switch (condition.operator) {
        case 'contains': return haystack.includes(needle);
        case 'notContains': return !haystack.includes(needle);
        case 'equals': return haystack === needle;
        case 'notEquals': return haystack !== needle;
        case 'startsWith': return haystack.startsWith(needle);
        case 'endsWith': return haystack.endsWith(needle);
        case 'isEmpty': return actual.trim() === '';
        case 'isNotEmpty': return actual.trim() !== '';
        default: return true;
    }
}

const evaluateNumber = (
    actual: number | null,
    condition: FilterCondition,
    field: FilterFieldDefinition
) => {
    // A log with no duration can't satisfy a numeric comparison. Excluding it
    // is the honest answer - the alternative (always matching) would quietly
    // pad every "slower than 2s" result with logs that have no timing at all.
    if (actual === null) {
        return false;
    }

    const target = toComparableNumber(field, condition.value);

    if (target === null) {
        return true;
    }

    switch (condition.operator) {
        case 'equals': return actual === target;
        case 'greaterThan': return actual > target;
        case 'greaterOrEqual': return actual >= target;
        case 'lessThan': return actual < target;
        case 'lessOrEqual': return actual <= target;
        case 'between': {
            const secondTarget = toComparableNumber(field, condition.secondValue);

            if (secondTarget === null) {
                return true;
            }

            // Tolerate the bounds being entered in either order rather than
            // silently matching nothing.
            return actual >= Math.min(target, secondTarget)
                && actual <= Math.max(target, secondTarget);
        }
        default: return true;
    }
}

const evaluateDate = (actual: string | null, condition: FilterCondition, nowMs: number) => {
    if (actual === null) {
        return false;
    }

    const actualMs = toComparableTime(actual);

    if (actualMs === null) {
        return false;
    }

    if (condition.operator === 'inLast') {
        const amount = Number(condition.value);

        if (condition.value.trim() === '' || Number.isNaN(amount) || amount <= 0) {
            return true;
        }

        return actualMs >= nowMs - amount * RELATIVE_UNIT_MS[condition.unit];
    }

    const targetMs = toComparableTime(condition.value);

    if (targetMs === null) {
        return true;
    }

    switch (condition.operator) {
        case 'after': return actualMs > targetMs;
        case 'before': return actualMs < targetMs;
        case 'between': {
            const secondMs = toComparableTime(condition.secondValue);

            if (secondMs === null) {
                return true;
            }

            return actualMs >= Math.min(targetMs, secondMs)
                && actualMs <= Math.max(targetMs, secondMs);
        }
        default: return true;
    }
}

const evaluateBoolean = (actual: boolean, condition: FilterCondition) => {
    return condition.operator === 'isTrue' ? actual : !actual;
}

// `nowMs` is injected rather than read from Date.now() inside, so relative
// time ("within last 15 minutes") is testable and so a whole filter pass
// evaluates against one consistent instant instead of a clock that moves
// between rows.
export const evaluateCondition = (
    log: LogEntry,
    condition: FilterCondition,
    nowMs: number = Date.now()
) => {
    const field = getFilterField(condition.field);

    if (!field) {
        return true;
    }

    const actual = field.getValue(log);

    switch (field.type) {
        case 'boolean':
            return evaluateBoolean(actual === true, condition);
        case 'number':
            return evaluateNumber(typeof actual === 'number' ? actual : null, condition, field);
        case 'date':
            return evaluateDate(typeof actual === 'string' ? actual : null, condition, nowMs);
        default:
            return evaluateText(actual === null ? '' : String(actual), condition);
    }
}

// Resolves the filter's logic expression once, so a whole list pass doesn't
// re-parse it per row. Also drives the UI's validation message.
export const resolveFilterLogic = (filter: AdvancedLogFilter): FilterLogicState => {
    if (filter.logic.trim() === '') {
        return { status: 'default', node: null, error: null, referencedIndexes: [] };
    }

    const parsed = parseFilterLogic(filter.logic, filter.conditions.length);

    if (!parsed.ok) {
        return { status: 'invalid', node: null, error: parsed.error, referencedIndexes: [] };
    }

    return {
        status: 'valid',
        node: parsed.node,
        error: null,
        referencedIndexes: parsed.referencedIndexes
    };
}

export const matchesAdvancedFilter = (
    log: LogEntry,
    filter: AdvancedLogFilter,
    nowMs: number = Date.now(),
    logicState: FilterLogicState = resolveFilterLogic(filter)
) => {
    // A broken expression pauses filtering rather than hiding everything -
    // you're mid-edit, and an unreadable expression is not a statement that
    // nothing should match.
    if (logicState.status === 'invalid') {
        return true;
    }

    if (logicState.status === 'default') {
        const activeConditions = getActiveConditions(filter);

        return activeConditions.length === 0
            || activeConditions.every(condition => evaluateCondition(log, condition, nowMs));
    }

    // Positional, because the expression references row numbers. An
    // incomplete row evaluates to `true` so it stays neutral under AND; if
    // it's referenced anywhere the UI flags it, which is a better place to
    // raise the problem than silently emptying the list.
    const conditionResults = filter.conditions.map(condition => (
        isConditionComplete(condition)
            ? evaluateCondition(log, condition, nowMs)
            : true
    ));

    return evaluateFilterLogic(logicState.node, conditionResults);
}

// Distinct values actually present in the loaded logs, for enum fields. Built
// from the data rather than a hardcoded list because Salesforce's Status is
// typed `ApexLogStatus | string` - orgs do surface values outside the four
// documented ones.
export const getEnumOptions = (fieldId: string, logs: LogEntry[]) => {
    const field = getFilterField(fieldId);

    // Text fields are included too: "is any of" needs a pick-list, and the
    // distinct users/applications actually present are exactly that list.
    if (!field || (field.type !== 'enum' && field.type !== 'text')) {
        return [];
    }

    const values = new Set<string>();

    for (const log of logs) {
        const value = field.getValue(log);

        if (typeof value === 'string' && value.trim() !== '') {
            values.add(value);
        }
    }

    return [...values].sort((first, second) => first.localeCompare(second));
}

let conditionIdCounter = 0;

export const createFilterCondition = (fieldId = FILTER_FIELDS[0]?.id ?? 'operation'): FilterCondition => {
    conditionIdCounter += 1;

    return {
        id: `condition-${conditionIdCounter}`,
        field: fieldId,
        operator: getOperatorsForField(fieldId)[0] ?? 'contains',
        value: '',
        secondValue: '',
        values: [],
        unit: 'minutes'
    };
}
