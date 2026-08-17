import { describe, expect, it } from "vitest";

import { aggregateCallTree, parseCallTree } from "./callTreeParser";

// Nanoseconds are what the real log carries; these helpers keep the fixtures
// readable in milliseconds so the expected timings are obvious at a glance.
const ms = (milliseconds: number) => milliseconds * 1_000_000;
const at = (milliseconds: number, rest: string) => `15:42:07.259 (${ms(milliseconds)})|${rest}`;

describe('parseCallTree', () => {
    it('nests frames and computes total vs self time', () => {
        const result = parseCallTree([
            at(0, 'EXECUTION_STARTED'),
            at(10, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(30, 'METHOD_ENTRY|[20]|01p|Inner.work()'),
            at(80, 'METHOD_EXIT|[20]|01p|Inner.work()'),
            at(100, 'METHOD_EXIT|[12]|01p|Outer.run()'),
            at(110, 'EXECUTION_FINISHED')
        ]);

        expect(result.status).toBe('ok');
        expect(result.truncated).toBe(false);
        expect(result.hasMethodData).toBe(true);
        expect(result.roots).toHaveLength(1);

        const execution = result.roots[0]!;
        const outer = execution.children[0]!;
        const inner = outer.children[0]!;

        expect(outer.label).toBe('Outer.run()');
        expect(outer.apexLine).toBe(12);
        expect(outer.totalMs).toBe(90);
        // 90ms total minus the 50ms spent inside Inner.
        expect(outer.selfMs).toBe(40);
        expect(inner.totalMs).toBe(50);
        expect(inner.selfMs).toBe(50);
    });

    it('points sourceLineIndex at the entering line so the UI can jump to it', () => {
        const result = parseCallTree([
            'irrelevant header line',
            at(0, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(50, 'METHOD_EXIT|[12]|01p|Outer.run()')
        ]);

        const outer = result.roots[0]!;

        expect(outer.sourceLineIndex).toBe(1);
        expect(outer.id).toBe(1);
        expect(outer.endSourceLineIndex).toBe(2);
    });

    it('auto-closes frames left open by a truncated log', () => {
        const result = parseCallTree([
            at(0, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(20, 'METHOD_ENTRY|[20]|01p|Inner.work()'),
            at(60, 'USER_DEBUG|[30]|DEBUG|still going'),
            '*********** MAXIMUM DEBUG LOG SIZE REACHED ***********'
        ]);

        expect(result.truncated).toBe(true);

        const outer = result.roots[0]!;
        const inner = outer.children[0]!;

        expect(outer.truncated).toBe(true);
        expect(inner.truncated).toBe(true);
        // Closed at the last *parsed event's* timestamp (20ms, the last line
        // the parser recognised), not at the banner line which has none.
        expect(outer.totalMs).toBe(20);
    });

    it('ignores an exit with no matching entry instead of corrupting the stack', () => {
        const result = parseCallTree([
            at(0, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(10, 'DML_END|[99]'),
            at(50, 'METHOD_EXIT|[12]|01p|Outer.run()')
        ]);

        expect(result.unmatchedExitCount).toBe(1);
        expect(result.roots).toHaveLength(1);

        const outer = result.roots[0]!;

        // The stray DML_END must not have closed Outer early.
        expect(outer.truncated).toBe(false);
        expect(outer.totalMs).toBe(50);
    });

    it('still parses SOQL and DML when the log has no method events', () => {
        const result = parseCallTree([
            at(0, 'SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id FROM Account'),
            at(40, 'SOQL_EXECUTE_END|[15]|Rows:150'),
            at(50, 'DML_BEGIN|[20]|Op:Update|Type:Account|Rows:3'),
            at(70, 'DML_END|[20]')
        ]);

        expect(result.hasMethodData).toBe(false);
        expect(result.status).toBe('ok');
        expect(result.roots).toHaveLength(2);

        const soql = result.roots[0]!;
        const dml = result.roots[1]!;

        expect(soql.kind).toBe('soql');
        expect(soql.label).toBe('SELECT Id FROM Account');
        expect(soql.rowCount).toBe(150);
        expect(soql.totalMs).toBe(40);

        expect(dml.kind).toBe('dml');
        expect(dml.label).toBe('Update Account');
        expect(dml.dmlOp).toBe('Update');
        expect(dml.rowCount).toBe(3);
    });

    it('skips continuation lines of a multi-line SOQL or debug payload', () => {
        const result = parseCallTree([
            at(0, 'SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id'),
            'FROM Account',
            "WHERE Name = 'has | a pipe'",
            at(40, 'SOQL_EXECUTE_END|[15]|Rows:2')
        ]);

        // The two bare continuation lines must not be mistaken for events.
        expect(result.eventLineCount).toBe(2);
        expect(result.roots).toHaveLength(1);
        expect(result.roots[0]!.rowCount).toBe(2);
    });

    it('reports empty for a body with no recognisable events', () => {
        const result = parseCallTree(['', 'just some text', 'more text']);

        expect(result.status).toBe('empty');
        expect(result.roots).toHaveLength(0);
        expect(result.nodeCount).toBe(0);
    });

    it('treats [EXTERNAL] as an absent apex line rather than a number', () => {
        const result = parseCallTree([
            at(0, 'CODE_UNIT_STARTED|[EXTERNAL]|01q|AccountTrigger on Account'),
            at(90, 'CODE_UNIT_FINISHED|AccountTrigger on Account')
        ]);

        const unit = result.roots[0]!;

        expect(unit.apexLine).toBeNull();
        expect(unit.label).toBe('AccountTrigger on Account');
        expect(unit.totalMs).toBe(90);
    });
});

describe('aggregateCallTree', () => {
    it('merges repeated sibling call sites and sums their timings', () => {
        const result = parseCallTree([
            at(0, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(10, 'SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id FROM Opportunity'),
            at(20, 'SOQL_EXECUTE_END|[15]|Rows:5'),
            at(30, 'SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id FROM Opportunity'),
            at(45, 'SOQL_EXECUTE_END|[15]|Rows:7'),
            at(60, 'METHOD_EXIT|[12]|01p|Outer.run()')
        ]);

        const aggregated = aggregateCallTree(result.roots);
        const outer = aggregated[0]!;

        expect(outer.children).toHaveLength(1);

        const soql = outer.children[0]!;

        expect(soql.callCount).toBe(2);
        expect(soql.totalMs).toBe(25);
        expect(soql.rowCount).toBe(12);
        // Keeps the FIRST occurrence's line so jump-to-line still lands.
        expect(soql.sourceLineIndex).toBe(1);
    });

    it('merges non-adjacent siblings, since a loop body interleaves calls', () => {
        const result = parseCallTree([
            at(0, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(5, 'SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id FROM Account'),
            at(10, 'SOQL_EXECUTE_END|[15]|Rows:1'),
            at(15, 'DML_BEGIN|[18]|Op:Update|Type:Account|Rows:1'),
            at(20, 'DML_END|[18]'),
            at(25, 'SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id FROM Account'),
            at(30, 'SOQL_EXECUTE_END|[15]|Rows:1'),
            at(40, 'METHOD_EXIT|[12]|01p|Outer.run()')
        ]);

        const outer = aggregateCallTree(result.roots)[0]!;

        expect(outer.children).toHaveLength(2);
        expect(outer.children[0]!.callCount).toBe(2);
        expect(outer.children[1]!.kind).toBe('dml');
        expect(outer.children[1]!.callCount).toBe(1);
    });

    it('does not merge calls to the same method from different apex lines', () => {
        const result = parseCallTree([
            at(0, 'METHOD_ENTRY|[12]|01p|Outer.run()'),
            at(5, 'METHOD_ENTRY|[20]|01p|Helper.work()'),
            at(10, 'METHOD_EXIT|[20]|01p|Helper.work()'),
            at(15, 'METHOD_ENTRY|[44]|01p|Helper.work()'),
            at(20, 'METHOD_EXIT|[44]|01p|Helper.work()'),
            at(30, 'METHOD_EXIT|[12]|01p|Outer.run()')
        ]);

        const outer = aggregateCallTree(result.roots)[0]!;

        expect(outer.children).toHaveLength(2);
    });
});
