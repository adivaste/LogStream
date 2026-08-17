import React from "react";

// Standard "avoid a loading-state flash" pattern: if the real content is
// ready before `showDelayMs` has passed, skip the loading state entirely
// (nothing renders in that brief window). If it takes longer and the loading
// state does get shown, keep it up for at least `minVisibleMs` so it never
// flickers on and immediately back off within the same frame or two - e.g. a
// cache-hit that resolves in 20ms shouldn't still flash a skeleton at all,
// but one that takes 250ms should hold the skeleton for a beat once shown
// rather than swapping to content one frame later.
const DEFAULT_SHOW_DELAY_MS = 200;
const DEFAULT_MIN_VISIBLE_MS = 400;

export const useDelayedLoadingGate = (
    isComplete: boolean,
    showDelayMs: number = DEFAULT_SHOW_DELAY_MS,
    minVisibleMs: number = DEFAULT_MIN_VISIBLE_MS
) => {
    const [isVisible, setIsVisible] = React.useState(false);
    const shownAtRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (isComplete) {
            return;
        }

        const showTimeoutId = window.setTimeout(() => {
            shownAtRef.current = Date.now();
            setIsVisible(true);
        }, showDelayMs);

        return () => window.clearTimeout(showTimeoutId);
    }, [isComplete, showDelayMs]);

    React.useEffect(() => {
        if (!isComplete || !isVisible) {
            return;
        }

        const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
        const remaining = Math.max(0, minVisibleMs - elapsed);
        const hideTimeoutId = window.setTimeout(() => setIsVisible(false), remaining);

        return () => window.clearTimeout(hideTimeoutId);
    }, [isComplete, isVisible, minVisibleMs]);

    return isVisible;
}
