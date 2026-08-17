// Builds a call tree out of an Apex debug log body.
//
// Line grammar (the `(nanos)` field is nanoseconds since the transaction
// started, and is the source of every duration reported here):
//
//   15:42:07.259 (7259000)|METHOD_ENTRY|[47]|01pXXXX|AccountTriggerHandler.execute()
//   ^time         ^nanos   ^event       ^apexLine    ^event-specific fields
//
// Pure module - no React, no DOM. Everything it returns is structured-clone
// safe (plain arrays/numbers/strings, no class instances and deliberately no
// parent back-pointers), so if the parse ever needs to move into a Web Worker
// that becomes a wrapper change rather than a rewrite.

export type CallNodeKind =
    | 'execution'
    | 'codeUnit'
    | 'method'
    | 'soql'
    | 'dml'
    | 'callout'
    | 'flow';

export type CallNode = {
    // The 0-based index of the entering line in the caller's `lines` array.
    // Doubles as the node's identity: unique per frame, stable across
    // re-parses of the same body, and directly the jump-to-raw-line target.
    id: number;
    parentId: number | null;
    depth: number;
    kind: CallNodeKind;
    label: string;
    apexLine: number | null;
    sourceLineIndex: number;
    endSourceLineIndex: number;
    startNs: number;
    endNs: number;
    totalMs: number;
    selfMs: number;
    rowCount: number | null;
    dmlOp: string | null;
    // 1 unless sibling call sites were merged by aggregateCallTree.
    callCount: number;
    // This frame never got its matching exit (log cut off mid-transaction).
    truncated: boolean;
    children: CallNode[];
}

export type CallTreeStatus = 'ok' | 'noMethodData' | 'empty';

export type CallTreeParseResult = {
    status: CallTreeStatus;
    roots: CallNode[];
    nodeCount: number;
    maxDepth: number;
    totalMs: number;
    // True when any frame had to be auto-closed at end of log.
    truncated: boolean;
    // Distinguishes "this log has no method events" (trace flag APEX_CODE was
    // coarser than FINE) from "this log has nothing at all". Kept separate
    // from `status` because a log with SOQL/DML but no methods still produces
    // a genuinely useful flat tree - the UI shows it plus a trace-level hint
    // rather than a dead-end empty state.
    hasMethodData: boolean;
    unmatchedExitCount: number;
    eventLineCount: number;
}

export const EMPTY_CALL_TREE: CallTreeParseResult = {
    status: 'empty',
    roots: [],
    nodeCount: 0,
    maxDepth: 0,
    totalMs: 0,
    truncated: false,
    hasMethodData: false,
    unmatchedExitCount: 0,
    eventLineCount: 0
};

type EventRole = 'enter' | 'exit';

type EventSpec = {
    role: EventRole;
    kind: CallNodeKind;
}

const EVENT_SPECS = new Map<string, EventSpec>([
    ['EXECUTION_STARTED', { role: 'enter', kind: 'execution' }],
    ['EXECUTION_FINISHED', { role: 'exit', kind: 'execution' }],
    ['CODE_UNIT_STARTED', { role: 'enter', kind: 'codeUnit' }],
    ['CODE_UNIT_FINISHED', { role: 'exit', kind: 'codeUnit' }],
    ['METHOD_ENTRY', { role: 'enter', kind: 'method' }],
    ['METHOD_EXIT', { role: 'exit', kind: 'method' }],
    ['SOQL_EXECUTE_BEGIN', { role: 'enter', kind: 'soql' }],
    ['SOQL_EXECUTE_END', { role: 'exit', kind: 'soql' }],
    ['DML_BEGIN', { role: 'enter', kind: 'dml' }],
    ['DML_END', { role: 'exit', kind: 'dml' }],
    ['CALLOUT_REQUEST', { role: 'enter', kind: 'callout' }],
    ['CALLOUT_RESPONSE', { role: 'exit', kind: 'callout' }],
    ['FLOW_START_INTERVIEW_BEGIN', { role: 'enter', kind: 'flow' }],
    ['FLOW_START_INTERVIEW_END', { role: 'exit', kind: 'flow' }]
]);

// A pathological log must not make the exit-matching scan quadratic.
const MAX_UNWIND_SCAN = 32;
// Bounds worst-case memory on a runaway log. Real Apex stacks never approach
// this (the platform's own limit is far lower).
const MAX_DEPTH = 1024;
// Bounds memory when a single SOQL statement is enormous.
const MAX_LABEL_LENGTH = 300;

const CHAR_COLON = 58;
const CHAR_DOT = 46;
const CHAR_SPACE = 32;
const CHAR_OPEN_PAREN = 40;
const CHAR_OPEN_BRACKET = 91;
const CHAR_PIPE = 124;
const CHAR_ZERO = 48;
const CHAR_NINE = 57;

// Rejects continuation lines (multi-line SOQL text, multi-line USER_DEBUG
// payloads, the "MAXIMUM DEBUG LOG SIZE REACHED" banner) by construction
// rather than by failing to parse them later. Five charCode compares, zero
// allocation - this runs on every one of up to ~200k lines.
const isEventLineStart = (line: string) => {
    return line.length > 14
        && line.charCodeAt(2) === CHAR_COLON
        && line.charCodeAt(5) === CHAR_COLON
        && line.charCodeAt(8) === CHAR_DOT
        && line.charCodeAt(12) === CHAR_SPACE
        && line.charCodeAt(13) === CHAR_OPEN_PAREN;
}

const parseDigits = (text: string, start: number, end: number) => {
    let value = 0;

    for (let index = start; index < end; index += 1) {
        const charCode = text.charCodeAt(index);

        if (charCode < CHAR_ZERO || charCode > CHAR_NINE) {
            return -1;
        }

        value = value * 10 + (charCode - CHAR_ZERO);
    }

    return value;
}

// `[47]` -> 47, `[EXTERNAL]` -> null, anything else -> null.
const parseApexLine = (line: string, fieldStart: number) => {
    if (line.charCodeAt(fieldStart) !== CHAR_OPEN_BRACKET) {
        return null;
    }

    const closeBracket = line.indexOf(']', fieldStart + 1);

    if (closeBracket === -1) {
        return null;
    }

    const apexLine = parseDigits(line, fieldStart + 1, closeBracket);

    return apexLine === -1 ? null : apexLine;
}

const readField = (line: string, start: number) => {
    if (start >= line.length) {
        return { value: '', next: line.length };
    }

    const pipe = line.indexOf('|', start);

    if (pipe === -1) {
        return { value: line.slice(start), next: line.length };
    }

    return { value: line.slice(start, pipe), next: pipe + 1 };
}

const clampLabel = (label: string) => {
    return label.length > MAX_LABEL_LENGTH ? label.slice(0, MAX_LABEL_LENGTH) : label;
}

// `Rows:150` -> 150. Returns null when the marker isn't present.
const parseRowCount = (line: string) => {
    const marker = line.indexOf('Rows:');

    if (marker === -1) {
        return null;
    }

    const start = marker + 5;
    let end = start;

    while (end < line.length) {
        const charCode = line.charCodeAt(end);

        if (charCode < CHAR_ZERO || charCode > CHAR_NINE) {
            break;
        }

        end += 1;
    }

    if (end === start) {
        return null;
    }

    return parseDigits(line, start, end);
}

type OpenFrame = {
    node: CallNode;
    childTotalNs: number;
}

const buildLabel = (kind: CallNodeKind, event: string, line: string, fieldStart: number) => {
    // Everything after the apex-line field, pipe-delimited. The useful display
    // name differs per event, so read only as far as each one needs.
    if (kind === 'method' || kind === 'codeUnit') {
        // METHOD_ENTRY: `[47]|01pXXXX|Class.method()` - the signature is last.
        // CODE_UNIT_STARTED: `[EXTERNAL]|01q|Trigger on Account` - also last.
        const lastPipe = line.lastIndexOf('|');

        if (lastPipe >= fieldStart) {
            return clampLabel(line.slice(lastPipe + 1));
        }

        return clampLabel(line.slice(fieldStart));
    }

    if (kind === 'soql') {
        // `[15]|Aggregations:0|SELECT Id FROM Account` - the query is last.
        const lastPipe = line.lastIndexOf('|');

        if (lastPipe >= fieldStart) {
            return clampLabel(line.slice(lastPipe + 1));
        }

        return clampLabel(line.slice(fieldStart));
    }

    if (kind === 'dml') {
        // `[20]|Op:Update|Type:Account|Rows:3`
        const opField = readField(line, fieldStart);
        const typeField = readField(line, opField.next);
        const op = opField.value.startsWith('Op:') ? opField.value.slice(3) : opField.value;
        const type = typeField.value.startsWith('Type:') ? typeField.value.slice(5) : typeField.value;

        return clampLabel(`${op} ${type}`.trim());
    }

    if (kind === 'execution') {
        return 'Execution';
    }

    const rest = line.slice(fieldStart);

    return clampLabel(rest.length > 0 ? rest : event);
}

// `Op:Update` -> `Update`.
const parseDmlOp = (line: string, fieldStart: number) => {
    const opField = readField(line, fieldStart);

    return opField.value.startsWith('Op:') ? opField.value.slice(3) : null;
}

export const parseCallTree = (lines: string[]): CallTreeParseResult => {
    const roots: CallNode[] = [];
    const stack: OpenFrame[] = [];

    let nodeCount = 0;
    let maxDepth = 0;
    let eventLineCount = 0;
    let unmatchedExitCount = 0;
    let hasMethodData = false;
    let truncated = false;
    let lastEventNs = 0;
    let lastEventLineIndex = 0;
    let rootTotalNs = 0;

    const closeFrame = (
        frame: OpenFrame,
        endNs: number,
        endSourceLineIndex: number,
        isTruncated: boolean
    ) => {
        const node = frame.node;
        const totalNs = Math.max(0, endNs - node.startNs);

        node.endNs = endNs;
        node.endSourceLineIndex = endSourceLineIndex;
        node.totalMs = totalNs / 1e6;
        node.selfMs = Math.max(0, totalNs - frame.childTotalNs) / 1e6;
        node.truncated = isTruncated;

        const parentFrame = stack[stack.length - 1];

        if (parentFrame) {
            parentFrame.childTotalNs += totalNs;
        } else {
            rootTotalNs += totalNs;
        }
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex] ?? '';

        if (!isEventLineStart(line)) {
            continue;
        }

        const closeParen = line.indexOf(')', 14);

        if (closeParen === -1 || line.charCodeAt(closeParen + 1) !== CHAR_PIPE) {
            continue;
        }

        const nanos = parseDigits(line, 14, closeParen);

        if (nanos === -1) {
            continue;
        }

        const eventStart = closeParen + 2;
        const eventPipe = line.indexOf('|', eventStart);
        const eventEnd = eventPipe === -1 ? line.length : eventPipe;
        const event = line.slice(eventStart, eventEnd);
        const spec = EVENT_SPECS.get(event);

        if (!spec) {
            continue;
        }

        eventLineCount += 1;
        lastEventNs = nanos;
        lastEventLineIndex = lineIndex;

        const fieldStart = eventPipe === -1 ? line.length : eventPipe + 1;

        if (spec.role === 'enter') {
            if (stack.length >= MAX_DEPTH) {
                continue;
            }

            if (spec.kind === 'method' || spec.kind === 'codeUnit') {
                hasMethodData = true;
            }

            const apexLine = parseApexLine(line, fieldStart);
            const afterApexField = apexLine === null && line.charCodeAt(fieldStart) !== CHAR_OPEN_BRACKET
                ? fieldStart
                : readField(line, fieldStart).next;
            const parentFrame = stack[stack.length - 1];
            const node: CallNode = {
                id: lineIndex,
                parentId: parentFrame ? parentFrame.node.id : null,
                depth: stack.length,
                kind: spec.kind,
                label: buildLabel(spec.kind, event, line, afterApexField),
                apexLine,
                sourceLineIndex: lineIndex,
                endSourceLineIndex: lineIndex,
                startNs: nanos,
                endNs: nanos,
                totalMs: 0,
                selfMs: 0,
                rowCount: spec.kind === 'dml' ? parseRowCount(line) : null,
                dmlOp: spec.kind === 'dml' ? parseDmlOp(line, afterApexField) : null,
                callCount: 1,
                truncated: false,
                children: []
            };

            nodeCount += 1;
            maxDepth = Math.max(maxDepth, node.depth + 1);

            if (parentFrame) {
                parentFrame.node.children.push(node);
            } else {
                roots.push(node);
            }

            stack.push({ node, childTotalNs: 0 });
            continue;
        }

        // Exit. Match by KIND, never by label - real METHOD_EXIT signatures
        // are abbreviated or absent, so label matching produces false
        // negatives that silently corrupt every enclosing duration.
        let frameIndex = -1;
        const scanFloor = Math.max(0, stack.length - MAX_UNWIND_SCAN);

        for (let index = stack.length - 1; index >= scanFloor; index -= 1) {
            if (stack[index]?.node.kind === spec.kind) {
                frameIndex = index;
                break;
            }
        }

        if (frameIndex === -1) {
            // An exit with nothing to close. Count it and move on WITHOUT
            // popping - popping here would corrupt every enclosing frame.
            unmatchedExitCount += 1;
            continue;
        }

        // Frames above the match never got their own exit.
        while (stack.length - 1 > frameIndex) {
            const orphan = stack.pop();

            if (orphan) {
                closeFrame(orphan, nanos, lineIndex, true);
                truncated = true;
            }
        }

        const frame = stack.pop();

        if (frame) {
            if (spec.kind === 'soql') {
                frame.node.rowCount = parseRowCount(line);
            }

            closeFrame(frame, nanos, lineIndex, false);
        }
    }

    // Anything still open ran past the end of the log. Close at the last
    // PARSED event's timestamp - the final array element may be the
    // truncation banner or a blank line, neither of which has a timestamp.
    while (stack.length > 0) {
        const frame = stack.pop();

        if (frame) {
            closeFrame(frame, lastEventNs, lastEventLineIndex, true);
            truncated = true;
        }
    }

    const status: CallTreeStatus = eventLineCount === 0
        ? 'empty'
        : roots.length === 0
            ? 'noMethodData'
            : 'ok';

    return {
        status,
        roots,
        nodeCount,
        maxDepth,
        totalMs: rootTotalNs / 1e6,
        truncated,
        hasMethodData,
        unmatchedExitCount,
        eventLineCount
    };
}

// Collects the ids of every node at or below `fromDepth` that actually has
// children - i.e. everything that could meaningfully be collapsed. Used both
// for "collapse all" and for auto-collapsing a very large tree on open.
export const collectCollapsibleNodeIds = (
    nodes: CallNode[],
    fromDepth: number,
    collected: number[] = []
): number[] => {
    for (const node of nodes) {
        if (node.children.length === 0) {
            continue;
        }

        if (node.depth >= fromDepth) {
            collected.push(node.id);
        }

        collectCollapsibleNodeIds(node.children, fromDepth, collected);
    }

    return collected;
}

const getMergeKey = (node: CallNode) => {
    return `${node.kind} ${node.apexLine ?? -1} ${node.label}`;
}

// Merges repeated identical sibling call sites into one node carrying a
// callCount - a query fired 150x inside a loop collapses to a single `x150`
// row instead of 150 unreadable ones.
//
// Deliberately separate from parseCallTree rather than baked into it: the
// faithful tree is what jump-to-raw-line needs, and this is O(nodes) so
// re-running it is free, whereas merging during the parse would be
// irreversible.
export const aggregateCallTree = (roots: CallNode[]): CallNode[] => {
    if (roots.length === 0) {
        return roots;
    }

    const merged: CallNode[] = [];
    // Matches across ALL siblings, not just adjacent ones - a loop body
    // interleaves the repeated call with others, so adjacency-only merging
    // would miss most real repeats.
    const indexByKey = new Map<string, number>();

    for (const node of roots) {
        const key = getMergeKey(node);
        const existingIndex = indexByKey.get(key);

        if (existingIndex === undefined) {
            indexByKey.set(key, merged.length);
            merged.push({
                ...node,
                children: [...node.children]
            });
            continue;
        }

        const target = merged[existingIndex];

        if (!target) {
            continue;
        }

        // Sum rather than recompute from children. Mathematically identical
        // (aggregation preserves totals at every level) but avoids float
        // drift, and stays correct when one member was truncated.
        target.callCount += node.callCount;
        target.totalMs += node.totalMs;
        target.selfMs += node.selfMs;
        target.endNs = Math.max(target.endNs, node.endNs);
        target.endSourceLineIndex = Math.max(target.endSourceLineIndex, node.endSourceLineIndex);
        target.truncated = target.truncated || node.truncated;

        if (node.rowCount !== null) {
            target.rowCount = (target.rowCount ?? 0) + node.rowCount;
        }

        target.children.push(...node.children);
    }

    for (const node of merged) {
        node.children = aggregateCallTree(node.children);
    }

    return merged;
}
