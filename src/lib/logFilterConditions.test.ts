import { describe, expect, it } from "vitest";

import {
    type AdvancedLogFilter,
    type FilterCondition,
    type FilterOperator,
    createFilterCondition,
    getActiveConditionCount,
    getEnumOptions,
    getOperatorsForField,
    isConditionComplete,
    matchesAdvancedFilter
} from "./logFilterConditions";
import type { LogEntry } from "@/types/ui";

const buildLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    id: 'log-1',
    operationType: 'Api',
    operation: 'AccountTrigger',
    user: 'Ada Lovelace',
    app: 'Salesforce',
    size: '1.2MB',
    duration: '450ms',
    timestamp: '15:42:07',
    startTime: '2026-08-18T15:42:07.000Z',
    readAt: null,
    byteLength: 1_258_291,
    durationMs: 450,
    status: 'Success',
    hasErrors: false,
    ...overrides
});

const condition = (
    field: string,
    operator: FilterOperator,
    value = '',
    secondValue = ''
): FilterCondition => ({ id: 'c1', field, operator, value, secondValue });

const filterOf = (
    conditions: FilterCondition[],
    conjunction: AdvancedLogFilter['conjunction'] = 'and'
): AdvancedLogFilter => ({ conjunction, conditions });

describe('isConditionComplete', () => {
    // The list must not blank out the instant a field is picked but before a
    // value is typed - an incomplete condition has to be inert, not exclusive.
    it('treats a condition with no value yet as incomplete', () => {
        expect(isConditionComplete(condition('operation', 'contains', ''))).toBe(false);
    });

    it('treats value-less operators as complete on their own', () => {
        expect(isConditionComplete(condition('operation', 'isEmpty'))).toBe(true);
        expect(isConditionComplete(condition('hasErrors', 'isTrue'))).toBe(true);
    });

    it('rejects a non-numeric value on a numeric field', () => {
        expect(isConditionComplete(condition('durationMs', 'greaterThan', 'abc'))).toBe(false);
        expect(isConditionComplete(condition('durationMs', 'greaterThan', '200'))).toBe(true);
    });

    it('requires both bounds for between', () => {
        expect(isConditionComplete(condition('durationMs', 'between', '100'))).toBe(false);
        expect(isConditionComplete(condition('durationMs', 'between', '100', '900'))).toBe(true);
    });

    it('rejects an operator that does not belong to the field type', () => {
        expect(isConditionComplete(condition('durationMs', 'startsWith', '4'))).toBe(false);
    });

    it('rejects an unknown field', () => {
        expect(isConditionComplete(condition('nope', 'contains', 'x'))).toBe(false);
    });
});

describe('matchesAdvancedFilter', () => {
    it('matches everything when no condition is complete', () => {
        const log = buildLog();

        expect(matchesAdvancedFilter(log, filterOf([]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('operation', 'contains', '')]))).toBe(true);
    });

    it('applies text operators case-insensitively', () => {
        const log = buildLog({ operation: 'AccountTrigger' });

        expect(matchesAdvancedFilter(log, filterOf([condition('operation', 'contains', 'trigger')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('operation', 'notContains', 'trigger')]))).toBe(false);
        expect(matchesAdvancedFilter(log, filterOf([condition('operation', 'startsWith', 'account')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('operation', 'endsWith', 'trigger')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('operation', 'equals', 'accounttrigger')]))).toBe(true);
    });

    it('converts size input from KB to bytes', () => {
        const log = buildLog({ byteLength: 2048 });

        // 2048 bytes is exactly 2KB, so "> 1KB" matches and "> 3KB" does not.
        expect(matchesAdvancedFilter(log, filterOf([condition('byteLength', 'greaterThan', '1')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('byteLength', 'greaterThan', '3')]))).toBe(false);
    });

    it('excludes logs with no duration from numeric comparisons', () => {
        const log = buildLog({ durationMs: null });

        expect(matchesAdvancedFilter(log, filterOf([condition('durationMs', 'greaterThan', '1')]))).toBe(false);
        expect(matchesAdvancedFilter(log, filterOf([condition('durationMs', 'lessThan', '99999')]))).toBe(false);
    });

    it('accepts between bounds entered in either order', () => {
        const log = buildLog({ durationMs: 450 });

        expect(matchesAdvancedFilter(log, filterOf([condition('durationMs', 'between', '100', '900')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('durationMs', 'between', '900', '100')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('durationMs', 'between', '500', '900')]))).toBe(false);
    });

    it('compares dates', () => {
        const log = buildLog({ startTime: '2026-08-18T15:42:07.000Z' });

        expect(matchesAdvancedFilter(log, filterOf([condition('startTime', 'after', '2026-08-18T10:00')]))).toBe(true);
        expect(matchesAdvancedFilter(log, filterOf([condition('startTime', 'before', '2026-08-18T10:00')]))).toBe(false);
    });

    it('handles booleans, including the derived read flag', () => {
        const unread = buildLog({ readAt: null, hasErrors: true });
        const read = buildLog({ readAt: '2026-08-18T16:00:00.000Z', hasErrors: false });

        expect(matchesAdvancedFilter(unread, filterOf([condition('isRead', 'isFalse')]))).toBe(true);
        expect(matchesAdvancedFilter(read, filterOf([condition('isRead', 'isTrue')]))).toBe(true);
        expect(matchesAdvancedFilter(unread, filterOf([condition('hasErrors', 'isTrue')]))).toBe(true);
        expect(matchesAdvancedFilter(read, filterOf([condition('hasErrors', 'isTrue')]))).toBe(false);
    });

    it('excludes successful logs, the case this feature exists for', () => {
        const success = buildLog({ status: 'Success' });
        const failed = buildLog({ status: 'OperationFailed' });
        const filter = filterOf([condition('status', 'notEquals', 'Success')]);

        expect(matchesAdvancedFilter(success, filter)).toBe(false);
        expect(matchesAdvancedFilter(failed, filter)).toBe(true);
    });

    it('honours the and/or conjunction', () => {
        const log = buildLog({ operation: 'AccountTrigger', durationMs: 450 });
        const conditions = [
            { ...condition('operation', 'contains', 'Trigger'), id: 'a' },
            { ...condition('durationMs', 'greaterThan', '1000'), id: 'b' }
        ];

        expect(matchesAdvancedFilter(log, filterOf(conditions, 'and'))).toBe(false);
        expect(matchesAdvancedFilter(log, filterOf(conditions, 'or'))).toBe(true);
    });

    it('ignores incomplete conditions under OR instead of matching everything', () => {
        const log = buildLog({ operation: 'AccountTrigger' });
        // The empty condition must not count as a match and pull in every log.
        const conditions = [
            { ...condition('operation', 'contains', 'Nothing'), id: 'a' },
            { ...condition('user', 'contains', ''), id: 'b' }
        ];

        expect(matchesAdvancedFilter(log, filterOf(conditions, 'or'))).toBe(false);
    });
});

describe('helpers', () => {
    it('counts only the conditions that actually filter', () => {
        const filter = filterOf([
            { ...condition('operation', 'contains', 'x'), id: 'a' },
            { ...condition('user', 'contains', ''), id: 'b' }
        ]);

        expect(getActiveConditionCount(filter)).toBe(1);
    });

    it('offers type-appropriate operators', () => {
        expect(getOperatorsForField('operation')).toContain('startsWith');
        expect(getOperatorsForField('durationMs')).toContain('between');
        expect(getOperatorsForField('durationMs')).not.toContain('startsWith');
        expect(getOperatorsForField('hasErrors')).toEqual(['isTrue', 'isFalse']);
    });

    it('derives enum options from the loaded logs', () => {
        const logs = [
            buildLog({ status: 'Success' }),
            buildLog({ status: 'OperationFailed' }),
            buildLog({ status: 'Success' })
        ];

        expect(getEnumOptions('status', logs)).toEqual(['OperationFailed', 'Success']);
        expect(getEnumOptions('operation', logs)).toEqual([]);
    });

    it('creates conditions with a valid default operator and unique ids', () => {
        const first = createFilterCondition('durationMs');
        const second = createFilterCondition('durationMs');

        expect(getOperatorsForField('durationMs')).toContain(first.operator);
        expect(first.id).not.toBe(second.id);
    });
});
