// Parses the filter-logic expression that decides how numbered conditions
// combine - "1 AND 2 AND (3 OR 4)", the same shape Salesforce report filter
// logic uses, so it should already be familiar.
//
// Grammar (AND binds tighter than OR, NOT tighter than both):
//
//   expression := orExpression
//   orExpression  := andExpression ( OR andExpression )*
//   andExpression := unary ( AND unary )*
//   unary         := NOT unary | primary
//   primary       := NUMBER | '(' expression ')'

export type FilterLogicNode =
    | { type: 'reference'; index: number }
    | { type: 'not'; operand: FilterLogicNode }
    | { type: 'and'; left: FilterLogicNode; right: FilterLogicNode }
    | { type: 'or'; left: FilterLogicNode; right: FilterLogicNode };

export type FilterLogicParseResult =
    | { ok: true; node: FilterLogicNode; referencedIndexes: number[] }
    | { ok: false; error: string };

type Token =
    | { kind: 'number'; value: number; position: number }
    | { kind: 'and' | 'or' | 'not' | 'openParen' | 'closeParen'; position: number };

const KEYWORDS: Record<string, 'and' | 'or' | 'not'> = {
    AND: 'and',
    OR: 'or',
    NOT: 'not'
};

class FilterLogicError extends Error {}

const tokenize = (input: string): Token[] => {
    const tokens: Token[] = [];
    let index = 0;

    while (index < input.length) {
        const character = input[index] ?? '';

        if (/\s/.test(character)) {
            index += 1;
            continue;
        }

        if (character === '(') {
            tokens.push({ kind: 'openParen', position: index });
            index += 1;
            continue;
        }

        if (character === ')') {
            tokens.push({ kind: 'closeParen', position: index });
            index += 1;
            continue;
        }

        if (/[0-9]/.test(character)) {
            const start = index;

            while (index < input.length && /[0-9]/.test(input[index] ?? '')) {
                index += 1;
            }

            tokens.push({
                kind: 'number',
                value: Number(input.slice(start, index)),
                position: start
            });
            continue;
        }

        if (/[a-zA-Z]/.test(character)) {
            const start = index;

            while (index < input.length && /[a-zA-Z]/.test(input[index] ?? '')) {
                index += 1;
            }

            const word = input.slice(start, index);
            const keyword = KEYWORDS[word.toUpperCase()];

            if (!keyword) {
                throw new FilterLogicError(`"${word}" isn't valid here - use AND, OR, NOT, parentheses, or a condition number.`);
            }

            tokens.push({ kind: keyword, position: start });
            continue;
        }

        throw new FilterLogicError(`Unexpected character "${character}".`);
    }

    return tokens;
}

const parseTokens = (tokens: Token[], conditionCount: number) => {
    let cursor = 0;
    const referencedIndexes: number[] = [];

    const peek = () => tokens[cursor];

    const parseExpression = (): FilterLogicNode => parseOr();

    const parseOr = (): FilterLogicNode => {
        let left = parseAnd();

        while (peek()?.kind === 'or') {
            cursor += 1;
            const right = parseAnd();

            left = { type: 'or', left, right };
        }

        return left;
    };

    const parseAnd = (): FilterLogicNode => {
        let left = parseUnary();

        while (peek()?.kind === 'and') {
            cursor += 1;
            const right = parseUnary();

            left = { type: 'and', left, right };
        }

        return left;
    };

    const parseUnary = (): FilterLogicNode => {
        if (peek()?.kind === 'not') {
            cursor += 1;

            return { type: 'not', operand: parseUnary() };
        }

        return parsePrimary();
    };

    const parsePrimary = (): FilterLogicNode => {
        const token = peek();

        if (!token) {
            throw new FilterLogicError('The expression is incomplete - it ends with an operator.');
        }

        if (token.kind === 'number') {
            cursor += 1;

            if (token.value < 1 || token.value > conditionCount) {
                throw new FilterLogicError(
                    conditionCount === 0
                        ? 'There are no conditions to reference yet.'
                        : `Condition ${token.value} doesn't exist - there ${conditionCount === 1 ? 'is 1 condition' : `are ${conditionCount} conditions`}.`
                );
            }

            referencedIndexes.push(token.value);

            return { type: 'reference', index: token.value };
        }

        if (token.kind === 'openParen') {
            cursor += 1;
            const inner = parseExpression();

            if (peek()?.kind !== 'closeParen') {
                throw new FilterLogicError('Missing a closing parenthesis.');
            }

            cursor += 1;

            return inner;
        }

        if (token.kind === 'closeParen') {
            throw new FilterLogicError('Unexpected ")" - there is no matching "(".');
        }

        throw new FilterLogicError('Expected a condition number, NOT, or "(" here.');
    };

    const node = parseExpression();
    const trailing = peek();

    if (trailing) {
        if (trailing.kind === 'closeParen') {
            throw new FilterLogicError('Unexpected ")" - there is no matching "(".');
        }

        // Catches the most common slip: two operands with no operator between
        // them, e.g. "1 AND 2 (3 OR 4)". Guessing an implicit AND would hide
        // real typos, so this asks rather than assumes.
        throw new FilterLogicError(
            trailing.kind === 'number' || trailing.kind === 'openParen'
                ? 'Missing AND or OR between two conditions.'
                : 'The expression has leftover input.'
        );
    }

    return { node, referencedIndexes };
}

export const parseFilterLogic = (
    input: string,
    conditionCount: number
): FilterLogicParseResult => {
    try {
        const tokens = tokenize(input);

        if (tokens.length === 0) {
            throw new FilterLogicError('Enter an expression, or leave it blank to match all conditions.');
        }

        const { node, referencedIndexes } = parseTokens(tokens, conditionCount);

        return { ok: true, node, referencedIndexes };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof FilterLogicError
                ? error.message
                : 'That expression could not be read.'
        };
    }
}

// `conditionResults` is 0-based; expression references are 1-based, matching
// the numbers shown next to each row.
export const evaluateFilterLogic = (
    node: FilterLogicNode,
    conditionResults: boolean[]
): boolean => {
    switch (node.type) {
        case 'reference':
            return conditionResults[node.index - 1] ?? true;
        case 'not':
            return !evaluateFilterLogic(node.operand, conditionResults);
        case 'and':
            return evaluateFilterLogic(node.left, conditionResults)
                && evaluateFilterLogic(node.right, conditionResults);
        case 'or':
            return evaluateFilterLogic(node.left, conditionResults)
                || evaluateFilterLogic(node.right, conditionResults);
    }
}

// The expression implied by a blank input: every condition ANDed together.
// Shown as the input's placeholder so the default is visible rather than
// something the user has to infer.
export const buildDefaultLogicExpression = (conditionCount: number) => {
    return Array.from({ length: conditionCount }, (_, index) => index + 1).join(' AND ');
}
