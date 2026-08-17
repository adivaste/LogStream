import { Keyboard } from "lucide-react";

import { PopoverContent } from "@/components/ui/popover";

type ShortcutItem = {
    keys: string[];
    label: string;
}

const GENERAL_SHORTCUTS: ShortcutItem[] = [
    { keys: ['D'], label: 'Toggle theme' },
    { keys: ['C'], label: 'Connect org' },
    { keys: ['F'], label: 'Set trace flag' }
];

const SORT_SHORTCUTS: ShortcutItem[] = [
    { keys: ['S', 'O'], label: 'Sort by operation' },
    { keys: ['S', 'U'], label: 'Sort by user' },
    { keys: ['S', 'A'], label: 'Sort by app' },
    { keys: ['S', 'S'], label: 'Sort by size' },
    { keys: ['S', 'D'], label: 'Sort by duration' },
    { keys: ['S', 'T'], label: 'Sort by timestamp' }
];

// Only fire while focus is inside the log body panel, so they can use
// modifier combos the global bare-letter shortcuts above don't claim.
const LOG_BODY_SHORTCUTS: ShortcutItem[] = [
    { keys: ['Enter'], label: 'Pin line / open frame in raw log' },
    { keys: ['↑', '↓'], label: 'Move between lines or frames' },
    { keys: ['←', '→'], label: 'Collapse / expand frame' },
    { keys: ['Ctrl', 'C'], label: 'Copy focused line' },
    { keys: ['Ctrl', '⇧', 'C'], label: 'Copy pinned lines' },
    { keys: ['Ctrl', '+'], label: 'Zoom in' },
    { keys: ['Ctrl', '-'], label: 'Zoom out' },
    { keys: ['Ctrl', '0'], label: 'Reset zoom' }
];

const ShortcutKeys = ({ keys }: { keys: string[] }) => {
    return (
        <span className="flex shrink-0 items-center gap-1">
            {keys.map((key, index) => (
                <span key={`${key}-${index}`} className="flex items-center gap-1">
                    {index > 0 && (
                        <span className="text-[11px] text-muted-foreground">then</span>
                    )}
                    <kbd className="min-w-6 rounded-md border border-border bg-muted px-1.5 py-1 text-center font-mono text-[11px] font-medium leading-none text-foreground shadow-sm">
                        {key}
                    </kbd>
                </span>
            ))}
        </span>
    );
}

const ShortcutRow = ({ shortcut }: { shortcut: ShortcutItem }) => {
    return (
        <div className="flex items-center justify-between gap-4 rounded-md px-1.5 py-1.5">
            <span className="truncate text-xs text-muted-foreground">{shortcut.label}</span>
            <ShortcutKeys keys={shortcut.keys} />
        </div>
    );
}

const ShortcutSection = ({
    title,
    shortcuts
}: {
    title: string;
    shortcuts: ShortcutItem[];
}) => {
    return (
        <section>
            <h3 className="mb-1.5 px-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </h3>
            <div className="space-y-0.5">
                {shortcuts.map(shortcut => (
                    <ShortcutRow key={`${shortcut.keys.join('-')}-${shortcut.label}`} shortcut={shortcut} />
                ))}
            </div>
        </section>
    );
}

export const KeyboardShortcutsPopover = () => {
    return (
        <PopoverContent
            align="end"
            className="w-[20rem] overflow-hidden rounded-lg border-border bg-background p-0 font-sans shadow-xl"
        >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                        <Keyboard className="h-4 w-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold leading-none text-foreground">Keyboard Shortcuts</h2>
                        <p className="mt-1 text-xs leading-none text-muted-foreground">Actions, sort chords, and log body navigation</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-3">
                <ShortcutSection title="Actions" shortcuts={GENERAL_SHORTCUTS} />
                <ShortcutSection title="Sorting" shortcuts={SORT_SHORTCUTS} />
                <ShortcutSection title="Log body" shortcuts={LOG_BODY_SHORTCUTS} />
            </div>
        </PopoverContent>
    );
}
