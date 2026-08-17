import React from "react";

import {
    aggregateCallTree,
    type CallNode,
    type CallTreeParseResult,
    EMPTY_CALL_TREE,
    parseCallTree
} from "@/lib/callTreeParser";

type UseCallTreeResult = {
    tree: CallTreeParseResult;
    aggregatedRoots: CallNode[];
    isParsing: boolean;
}

// Parsing an 18MB log takes a few hundred ms. Running it in a `useMemo` would
// block the render commit, so the freeze would happen *before* anything
// paints; doing it in an effect instead means the tree's skeleton is already
// on screen when the stall happens. The parse is also deliberately lazy - it
// only runs once the user actually switches to tree mode, so opening a log
// and reading it raw never pays for it at all.
//
// The result is cached for the current log id so toggling Raw/Tree doesn't
// re-parse. Only one entry is kept: switching logs should re-parse anyway,
// and holding trees for several 18MB logs at once is not worth the memory.
export const useCallTree = (
    lines: string[],
    logId: string | null,
    isEnabled: boolean
): UseCallTreeResult => {
    const cacheRef = React.useRef<{ logId: string; tree: CallTreeParseResult } | null>(null);
    const [tree, setTree] = React.useState<CallTreeParseResult>(EMPTY_CALL_TREE);
    const [isParsing, setIsParsing] = React.useState(false);

    React.useEffect(() => {
        if (!isEnabled || !logId) {
            return;
        }

        const cached = cacheRef.current;

        if (cached && cached.logId === logId) {
            setTree(cached.tree);
            setIsParsing(false);
            return;
        }

        let isCurrent = true;

        setIsParsing(true);
        setTree(EMPTY_CALL_TREE);

        // Deferred to a macrotask so React can commit (and paint) the parsing
        // state before the main thread goes away for the parse itself. A
        // microtask would run before paint and defeat the point.
        const timeoutId = window.setTimeout(() => {
            const parsed = parseCallTree(lines);

            cacheRef.current = { logId, tree: parsed };

            if (!isCurrent) {
                return;
            }

            setTree(parsed);
            setIsParsing(false);
        }, 0);

        return () => {
            isCurrent = false;
            window.clearTimeout(timeoutId);
        };
    }, [isEnabled, lines, logId]);

    const aggregatedRoots = React.useMemo(() => {
        return aggregateCallTree(tree.roots);
    }, [tree.roots]);

    return { tree, aggregatedRoots, isParsing };
}
