import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react";

import { cn } from "@/lib/utils";

function ScrollArea({
    className,
    ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
    return (
        <ScrollAreaPrimitive.Root
            data-slot="scroll-area"
            className={cn("relative", className)}
            {...props}
        />
    );
}

const ScrollAreaViewport = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>
>(({ className, ...props }, ref) => (
    <ScrollAreaPrimitive.Viewport
        ref={ref}
        data-slot="scroll-area-viewport"
        // The Viewport scrolls via native `overflow: scroll` internally, which
        // still renders the browser's own scrollbar unless explicitly hidden -
        // the custom Scrollbar/Thumb below is the only one meant to be visible.
        className={cn(
            "h-full w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            className
        )}
        // Base UI makes a scrollable Viewport a tab stop by default so it can
        // be scrolled via keyboard - the actual focusable content inside
        // (rows, buttons) already covers that, so this just adds a redundant
        // stop in the tab order.
        tabIndex={-1}
        {...props}
    />
));
ScrollAreaViewport.displayName = "ScrollAreaViewport";

function ScrollAreaContent({
    className,
    ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Content>) {
    return (
        <ScrollAreaPrimitive.Content
            data-slot="scroll-area-content"
            className={className}
            {...props}
        />
    );
}

function ScrollAreaScrollbar({
    className,
    orientation = "vertical",
    ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
    return (
        <ScrollAreaPrimitive.Scrollbar
            orientation={orientation}
            data-slot="scroll-area-scrollbar"
            className={cn(
                `
                    flex touch-none select-none opacity-0 transition-opacity duration-150
                    data-[hovering]:opacity-100 data-[scrolling]:opacity-100
                `,
                orientation === "vertical" && "h-full w-2.5 p-0.5",
                orientation === "horizontal" && "h-2.5 w-full flex-col p-0.5",
                className
            )}
            {...props}
        >
            <ScrollAreaPrimitive.Thumb
                data-slot="scroll-area-thumb"
                className="relative flex-1 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60"
            />
        </ScrollAreaPrimitive.Scrollbar>
    );
}

export { ScrollArea, ScrollAreaViewport, ScrollAreaContent, ScrollAreaScrollbar };
