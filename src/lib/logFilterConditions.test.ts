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
    matchesAdvancedFilter,
    resolveFilterLogic
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
    secondValue = '',
    extra: Partial<FilterCondition> = {}
): FilterCondition => ({
    id: 'c1',
    field,
    operator,
    value,
    secondValue,
    values: [],
    unit: 'minutes',
    ...extra
});

const filterOf = (
    conditions: FilterCondition[],
    logic = ''
): AdvancedLogFilter => ({ logic, conditions });

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

    it('ANDs every condition when the logic expression is blank', () => {
        const log = buildLog({ operation: 'AccountTrigger', durationMs: 450 });
        const conditions = [
            { ...condition('operation', 'contains', 'Trigger'), id: 'a' },
            { ...condition('durationMs', 'greaterThan', '1000'), id: 'b' }
        ];

        expect(matchesAdvancedFilter(log, filterOf(conditions))).toBe(false);
        expect(matchesAdvancedFilter(log, filterOf(conditions, '1 OR 2'))).toBe(true);
    });

    it('ignores incomplete conditions under the blank default', () => {
        const log = buildLog({ operation: 'AccountTrigger' });
        // The empty condition must not count as a match and pull in every log.
        const conditions = [
            { ...condition('operation', 'contains', 'Nothing'), id: 'a' },
            { ...condition('user', 'contains', ''), id: 'b' }
        ];

        expect(matchesAdvancedFilter(log, filterOf(conditions))).toBe(false);
    });
});

describe('filter logic expression', () => {
    const slowTrigger = () => [
        { ...condition('operation', 'contains', 'Trigger'), id: 'a' },
        { ...condition('status', 'notEquals', 'Success'), id: 'b' },
        { ...condition('durationMs', 'greaterThan', '1000'), id: 'c' },
        { ...condition('hasErrors', 'isTrue'), id: 'd' }
    ];

    it('applies grouping the blank default cannot express', () => {
        // "1 AND 2 AND (3 OR 4)" - a failing trigger that was either slow or
        // errored. No all/any toggle can say this.
        const filter = filterOf(slowTrigger(), '1 AND 2 AND (3 OR 4)');
        const slow = buildLog({
            operation: 'AccountTrigger', status: 'OperationFailed', durationMs: 5000, hasErrors: false
        });
        const errored = buildLog({
            operation: 'AccountTrigger', status: 'OperationFailed', durationMs: 10, hasErrors: true
        });
        const neither = buildLog({
            operation: 'AccountTrigger', status: 'OperationFailed', durationMs: 10, hasErrors: false
        });

        expect(matchesAdvancedFilter(slow, filter)).toBe(true);
        expect(matchesAdvancedFilter(errored, filter)).toBe(true);
        expect(matchesAdvancedFilter(neither, filter)).toBe(false);
    });

    it('ignores conditions the expression does not reference', () => {
        // Condition 3 would exclude this log, but the expression never uses it.
        const filter = filterOf(slowTrigger(), '1 AND 2');
        const log = buildLog({
            operation: 'AccountTrigger', status: 'OperationFailed', durationMs: 10, hasErrors: false
        });

        expect(matchesAdvancedFilter(log, filter)).toBe(true);
    });

    it('supports NOT', () => {
        const filter = filterOf(slowTrigger(), 'NOT 4');

        expect(matchesAdvancedFilter(buildLog({ hasErrors: true }), filter)).toBe(false);
        expect(matchesAdvancedFilter(buildLog({ hasErrors: false }), filter)).toBe(true);
    });

    it('pauses filtering rather than hiding everything when the expression is broken', () => {
        // Mid-typing must not blank the list - an unreadable expression is not
        // a statement that nothing should match.
        const filter = filterOf(slowTrigger(), '1 AND (2 OR');

        expect(resolveFilterLogic(filter).status).toBe('invalid');
        expect(matchesAdvancedFilter(buildLog({ operation: 'Nothing' }), filter)).toBe(true);
    });

    it('keeps a referenced-but-incomplete condition neutral', () => {
        const conditions = [
            { ...condition('operation', 'contains', 'Trigger'), id: 'a' },
            { ...condition('user', 'contains', ''), id: 'b' }
        ];
        const filter = filterOf(conditions, '1 AND 2');

        // 2 is incomplete, so it must not veto a log that satisfies 1.
        expect(matchesAdvancedFilter(buildLog({ operation: 'AccountTrigger' }), filter)).toBe(true);
        expect(matchesAdvancedFilter(buildLog({ operation: 'Something' }), filter)).toBe(false);
    });

    it('reports validation state for the UI', () => {
        expect(resolveFilterLogic(filterOf(slowTrigger())).status).toBe('default');
        expect(resolveFilterLogic(filterOf(slowTrigger(), '1 AND 2')).status).toBe('valid');
        expect(resolveFilterLogic(filterOf(slowTrigger(), '1 AND 9')).error)
            .toContain("Condition 9 doesn't exist");
    });
});

describe('multi-value operators', () => {
    it('matches any of the selected values', () => {
        const filter = filterOf([
            condition('status', 'isAnyOf', '', '', { values: ['OperationFailed', 'Unknown'] })
        ]);

        expect(matchesAdvancedFilter(buildLog({ status: 'OperationFailed' }), filter)).toBe(true);
        expect(matchesAdvancedFilter(buildLog({ status: 'Unknown' }), filter)).toBe(true);
        expect(matchesAdvancedFilter(buildLog({ status: 'Success' }), filter)).toBe(false);
    });

    it('excludes every selected value with is none of', () => {
        const filter = filterOf([
            condition('status', 'isNoneOf', '', '', { values: ['Success', 'Unknown'] })
        ]);

        expect(matchesAdvancedFilter(buildLog({ status: 'Success' }), filter)).toBe(false);
        expect(matchesAdvancedFilter(buildLog({ status: 'Unknown' }), filter)).toBe(false);
        expect(matchesAdvancedFilter(buildLog({ status: 'OperationFailed' }), filter)).toBe(true);
    });

    it('treats an empty selection as inert rather than matching nothing', () => {
        const emptySelection = condition('status', 'isAnyOf', '', '', { values: [] });

        expect(isConditionComplete(emptySelection)).toBe(false);
        expect(matchesAdvancedFilter(buildLog({ status: 'Success' }), filterOf([emptySelection]))).toBe(true);
    });

    it('works on text fields too', () => {
        const filter = filterOf([
            condition('user', 'isAnyOf', '', '', { values: ['Ada Lovelace', 'Grace Hopper'] })
        ]);

        expect(matchesAdvancedFilter(buildLog({ user: 'Grace Hopper' }), filter)).toBe(true);
        expect(matchesAdvancedFilter(buildLog({ user: 'Someone Else' }), filter)).toBe(false);
    });
});

describe('relative time', () => {
    const now = new Date('2026-08-25T12:00:00.000Z').getTime();

    it('matches logs inside the window and excludes older ones', () => {
        const filter = filterOf([
            condition('startTime', 'inLast', '30', '', { unit: 'minutes' })
        ]);
        const recent = buildLog({ startTime: '2026-08-25T11:45:00.000Z' });
        const old = buildLog({ startTime: '2026-08-25T11:00:00.000Z' });

        expect(matchesAdvancedFilter(recent, filter, now)).toBe(true);
        expect(matchesAdvancedFilter(old, filter, now)).toBe(false);
    });

    it('honours the unit', () => {
        const log = buildLog({ startTime: '2026-08-24T18:00:00.000Z' });
        const inHours = filterOf([condition('startTime', 'inLast', '2', '', { unit: 'hours' })]);
        const inDays = filterOf([condition('startTime', 'inLast', '2', '', { unit: 'days' })]);

        expect(matchesAdvancedFilter(log, inHours, now)).toBe(false);
        expect(matchesAdvancedFilter(log, inDays, now)).toBe(true);
    });

    it('rejects a zero or negative window as incomplete', () => {
        expect(isConditionComplete(condition('startTime', 'inLast', '0'))).toBe(false);
        expect(isConditionComplete(condition('startTime', 'inLast', '-5'))).toBe(false);
        expect(isConditionComplete(condition('startTime', 'inLast', '15'))).toBe(true);
    });

    it('evaluates every row against one instant', () => {
        // Injecting `now` is what makes this deterministic - reading the clock
        // per row could straddle a boundary mid-pass on a large list.
        const filter = filterOf([condition('startTime', 'inLast', '1', '', { unit: 'minutes' })]);
        const boundary = buildLog({ startTime: '2026-08-25T11:59:30.000Z' });

        expect(matchesAdvancedFilter(boundary, filter, now)).toBe(true);
        expect(matchesAdvancedFilter(boundary, filter, now + 60_000)).toBe(false);
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

    it('derives pick-list options from the loaded logs, deduped and sorted', () => {
        const logs = [
            buildLog({ status: 'Success', user: 'Ada Lovelace' }),
            buildLog({ status: 'OperationFailed', user: 'Grace Hopper' }),
            buildLog({ status: 'Success', user: 'Ada Lovelace' })
        ];

        expect(getEnumOptions('status', logs)).toEqual(['OperationFailed', 'Success']);
        // Text fields expose options too, so "is any of" has a pick-list.
        expect(getEnumOptions('user', logs)).toEqual(['Ada Lovelace', 'Grace Hopper']);
        // Non-pick-list types have none.
        expect(getEnumOptions('durationMs', logs)).toEqual([]);
        expect(getEnumOptions('hasErrors', logs)).toEqual([]);
    });

    it('creates conditions with a valid default operator and unique ids', () => {
        const first = createFilterCondition('durationMs');
        const second = createFilterCondition('durationMs');

        expect(getOperatorsForField('durationMs')).toContain(first.operator);
        expect(first.id).not.toBe(second.id);
    });
});
