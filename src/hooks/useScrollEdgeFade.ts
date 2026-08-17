import React from "react";

const EDGE_THRESHOLD_PX = 2;

export type ScrollEdgeState = {
    atTop: boolean;
    atBottom: boolean;
}

const NOT_SCROLLABLE_STATE: ScrollEdgeState = { atTop: true, atBottom: true };

const computeEdgeState = (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number
): ScrollEdgeState => {
    if (scrollHeight <= clientHeight) {
        return NOT_SCROLLABLE_STATE;
    }

    return {
        atTop: scrollTop <= EDGE_THRESHOLD_PX,
        atBottom: scrollTop + clientHeight >= scrollHeight - EDGE_THRESHOLD_PX
    };
}

export const useElementScrollEdges = (
    elementRef: React.RefObject<HTMLElement | null>
): ScrollEdgeState => {
    const [edgeState, setEdgeState] = React.useState<ScrollEdgeState>(NOT_SCROLLABLE_STATE);

    React.useEffect(() => {
        const element = elementRef.current;

        if (!element) {
            return;
        }

        const updateEdgeState = () => {
            setEdgeState(computeEdgeState(element.scrollTop, element.scrollHeight, element.clientHeight));
        };

        updateEdgeState();
        element.addEventListener('scroll', updateEdgeState, { passive: true });

        // A ResizeObserver on `element` only reports when the *container's*
        // own border-box changes - both call sites here are fixed-height
        // flex children, so their box never resizes as rows are added or
        // removed. What actually needs watching is `scrollHeight`, which is
        // driven by the *content* inside (e.g. a virtualizer's total-size
        // div growing/shrinking as the row/line count changes). Neither a
        // 'scroll' event nor a container resize fires for that on its own -
        // e.g. filtering a log list down from many rows to one shrinks
        // scrollHeight below clientHeight with no scroll event guaranteed,
        // leaving a stale "still scrolled" shadow showing forever. A
        // MutationObserver on the subtree catches that content change
        // directly, including the virtualizer's inline `style.height` writes.
        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(updateEdgeState);

        resizeObserver?.observe(element);

        const mutationObserver = typeof MutationObserver === 'undefined'
            ? null
            : new MutationObserver(updateEdgeState);

        mutationObserver?.observe(element, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });

        return () => {
            element.removeEventListener('scroll', updateEdgeState);
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
        };
    }, [elementRef]);

    return edgeState;
}
