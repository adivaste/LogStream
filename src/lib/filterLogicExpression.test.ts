import { describe, expect, it } from "vitest";

import {
    buildDefaultLogicExpression,
    evaluateFilterLogic,
    parseFilterLogic
} from "./filterLogicExpression";

const evaluate = (expression: string, results: boolean[]) => {
    const parsed = parseFilterLogic(expression, results.length);

    if (!parsed.ok) {
        throw new Error(`expected "${expression}" to parse, got: ${parsed.error}`);
    }

    return evaluateFilterLogic(parsed.node, results);
};

const errorFor = (expression: string, conditionCount: number) => {
    const parsed = parseFilterLogic(expression, conditionCount);

    return parsed.ok ? null : parsed.error;
};

describe('parseFilterLogic', () => {
    it('evaluates a single reference', () => {
        expect(evaluate('1', [true])).toBe(true);
        expect(evaluate('1', [false])).toBe(false);
    });

    it('binds AND tighter than OR', () => {
        // Read as 1 OR (2 AND 3): false OR (true AND false) === false.
        expect(evaluate('1 OR 2 AND 3', [false, true, false])).toBe(false);
        // ...and true OR anything is true, which only holds with this precedence.
        expect(evaluate('1 OR 2 AND 3', [true, true, false])).toBe(true);
    });

    it('lets parentheses override precedence', () => {
        expect(evaluate('(1 OR 2) AND 3', [false, true, false])).toBe(false);
        expect(evaluate('(1 OR 2) AND 3', [false, true, true])).toBe(true);
    });

    it('handles the shape from the original request', () => {
        // 1 AND 2 AND (3 OR 4)
        expect(evaluate('1 AND 2 AND (3 OR 4)', [true, true, false, true])).toBe(true);
        expect(evaluate('1 AND 2 AND (3 OR 4)', [true, true, false, false])).toBe(false);
        expect(evaluate('1 AND 2 AND (3 OR 4)', [true, false, true, true])).toBe(false);
    });

    it('supports NOT, binding tighter than AND', () => {
        expect(evaluate('NOT 1', [false])).toBe(true);
        expect(evaluate('NOT 1 AND 2', [false, true])).toBe(true);
        expect(evaluate('NOT (1 AND 2)', [true, true])).toBe(false);
    });

    it('accepts lowercase and mixed-case keywords', () => {
        expect(evaluate('1 and 2', [true, true])).toBe(true);
        expect(evaluate('1 Or 2', [false, true])).toBe(true);
        expect(evaluate('not 1', [false])).toBe(true);
    });

    it('handles nested parentheses and multi-digit references', () => {
        const results = Array.from({ length: 12 }, (_, index) => index === 11);

        expect(evaluate('((12))', results)).toBe(true);
        expect(evaluate('1 OR (2 OR (3 OR 12))', results)).toBe(true);
    });

    it('reports which references it found, so unused rows can be flagged', () => {
        const parsed = parseFilterLogic('1 AND (3 OR 3)', 4);

        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.referencedIndexes).toEqual([1, 3, 3]);
    });
});

describe('parseFilterLogic errors', () => {
    it('rejects a reference to a condition that does not exist', () => {
        expect(errorFor('1 AND 5', 3)).toContain("Condition 5 doesn't exist");
        expect(errorFor('1', 0)).toContain('no conditions');
    });

    it('rejects unbalanced parentheses', () => {
        expect(errorFor('(1 AND 2', 2)).toContain('Missing a closing parenthesis');
        expect(errorFor('1 AND 2)', 2)).toContain('no matching');
    });

    it('rejects a trailing operator', () => {
        expect(errorFor('1 AND', 2)).toContain('incomplete');
        expect(errorFor('1 OR NOT', 2)).toContain('incomplete');
    });

    it('names the missing operator rather than guessing an implicit AND', () => {
        // The shape a user is most likely to type by accident. Silently
        // treating juxtaposition as AND would hide real typos.
        expect(errorFor('1 AND 2 (3 OR 4)', 4)).toContain('Missing AND or OR');
        expect(errorFor('1 2', 2)).toContain('Missing AND or OR');
    });

    it('rejects unknown words and characters', () => {
        expect(errorFor('1 XOR 2', 2)).toContain("isn't valid here");
        expect(errorFor('1 & 2', 2)).toContain('Unexpected character');
    });

    it('rejects an empty expression', () => {
        expect(errorFor('   ', 2)).toContain('leave it blank');
    });
});

describe('buildDefaultLogicExpression', () => {
    it('ANDs every condition together', () => {
        expect(buildDefaultLogicExpression(3)).toBe('1 AND 2 AND 3');
        expect(buildDefaultLogicExpression(1)).toBe('1');
        expect(buildDefaultLogicExpression(0)).toBe('');
    });
});
