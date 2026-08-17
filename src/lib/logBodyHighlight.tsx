// Shared presentation helpers for the log body views. These started life as
// module-private functions inside LogBodyViewer, but the call-tree view needs
// the same token->color map and the same toolbar button styling - and
// duplicating the color map would be the single easiest way for the two views
// to visually drift apart, since that map *is* the viewer's visual identity.
// This is a .tsx (not .ts) because renderHighlightedLine returns JSX.

export const LOG_LINE_HEIGHT = 24;
export const LOG_VIEWER_OVERSCAN = 24;

const APEX_TOKEN_PATTERN = /(FATAL_ERROR|EXCEPTION_THROWN|System\.[A-Za-z]+Exception|SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|DML_BEGIN|DML_END|CUMULATIVE_LIMIT_USAGE|LIMIT_USAGE_FOR_NS|USER_DEBUG|METHOD_ENTRY|METHOD_EXIT)/g;
const APEX_TOKEN_EXACT_PATTERN = /^(FATAL_ERROR|EXCEPTION_THROWN|System\.[A-Za-z]+Exception|SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|DML_BEGIN|DML_END|CUMULATIVE_LIMIT_USAGE|LIMIT_USAGE_FOR_NS|USER_DEBUG|METHOD_ENTRY|METHOD_EXIT)$/;

export const getApexTokenClassName = (token: string) => {
    if (
        token === 'FATAL_ERROR'
        || token === 'EXCEPTION_THROWN'
        || token.startsWith('System.')
    ) {
        return 'text-red-700 dark:text-red-400';
    }

    if (token.startsWith('SOQL_')) {
        return 'text-sky-700 dark:text-sky-400';
    }

    if (token.startsWith('DML_')) {
        return 'text-amber-700 dark:text-amber-400';
    }

    if (token.includes('LIMIT')) {
        return 'text-yellow-700 dark:text-yellow-300';
    }

    if (token === 'USER_DEBUG') {
        return 'text-emerald-700 dark:text-emerald-400';
    }

    return 'text-violet-700 dark:text-violet-300';
}

// Compiles the user's query once per render pass rather than per line - a
// bad regex (unbalanced group, trailing backslash) throws at compile time,
// so callers get `null` back and fall through to treating the query as a
// plain literal instead of breaking the whole log body.
export const compileSearchPattern = (searchQuery: string, isRegexEnabled: boolean): RegExp | null => {
    if (!searchQuery) {
        return null;
    }

    if (!isRegexEnabled) {
        return null;
    }

    try {
        return new RegExp(searchQuery, 'gi');
    } catch {
        return null;
    }
}

type SearchChunk = { text: string; isMatch: boolean };

// Returns chunks tagged with whether each one IS a match, rather than making
// callers re-test each chunk against the pattern afterward - re-testing would
// mean compiling a fresh anchored RegExp per chunk, per line, on every render.
export const splitBySearchTerm = (text: string, searchQuery: string, searchPattern: RegExp | null): SearchChunk[] => {
    if (!searchQuery) {
        return [{ text, isMatch: false }];
    }

    if (searchPattern) {
        const chunks: SearchChunk[] = [];
        let cursor = 0;
        searchPattern.lastIndex = 0;
        let match = searchPattern.exec(text);

        while (match) {
            if (match.index > cursor) {
                chunks.push({ text: text.slice(cursor, match.index), isMatch: false });
            }

            // A zero-length match (e.g. `a*`) would otherwise loop forever -
            // treat it as a one-character match and keep advancing.
            const matchText = match[0].length > 0 ? match[0] : (text[match.index] ?? '');
            chunks.push({ text: matchText, isMatch: true });
            cursor = match.index + Math.max(matchText.length, 1);
            searchPattern.lastIndex = cursor;
            match = searchPattern.exec(text);
        }

        if (cursor < text.length) {
            chunks.push({ text: text.slice(cursor), isMatch: false });
        }

        return chunks;
    }

    const chunks: SearchChunk[] = [];
    let cursor = 0;
    const lowerText = text.toLowerCase();
    const lowerSearchQuery = searchQuery.toLowerCase();
    let matchIndex = lowerText.indexOf(lowerSearchQuery);

    while (matchIndex >= 0) {
        if (matchIndex > cursor) {
            chunks.push({ text: text.slice(cursor, matchIndex), isMatch: false });
        }

        chunks.push({ text: text.slice(matchIndex, matchIndex + searchQuery.length), isMatch: true });
        cursor = matchIndex + searchQuery.length;
        matchIndex = lowerText.indexOf(lowerSearchQuery, cursor);
    }

    if (cursor < text.length) {
        chunks.push({ text: text.slice(cursor), isMatch: false });
    }

    return chunks;
}

export const renderHighlightedLine = (line: string, searchQuery: string, searchPattern: RegExp | null) => {
    const apexParts = line.split(APEX_TOKEN_PATTERN);

    return apexParts.map((part, partIndex) => {
        const tokenClassName = APEX_TOKEN_EXACT_PATTERN.test(part)
            ? getApexTokenClassName(part)
            : '';

        return splitBySearchTerm(part, searchQuery, searchPattern).map(({ text: chunk, isMatch: isSearchMatch }, chunkIndex) => {
            return (
                <span
                    key={`${partIndex}-${chunkIndex}`}
                    className={isSearchMatch ? 'bg-emerald-300/80 text-emerald-950 dark:bg-emerald-500/60 dark:text-emerald-100' : tokenClassName}
                >
                    {chunk}
                </span>
            );
        });
    });
}

// The toolbar's button language. Shared so the call-tree toolbar's controls
// are styled by the same function rather than a copied class string.
export const getActionButtonClassName = (isFeedbackVisible = false) => {
    return `
        rounded-md border-0 p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500
        ${isFeedbackVisible
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        : 'bg-input/80 dark:bg-input/80 text-muted-foreground hover:text-primary hover:bg-input/90 dark:hover:bg-input/90'}
    `;
}
