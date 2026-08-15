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

        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(updateEdgeState);

        resizeObserver?.observe(element);

        return () => {
            element.removeEventListener('scroll', updateEdgeState);
            resizeObserver?.disconnect();
        };
    }, [elementRef]);

    return edgeState;
}
