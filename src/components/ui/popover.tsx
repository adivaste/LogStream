import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

function Popover({
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
    return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
    className,
    align = "center",
    sideOffset = 6,
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                data-slot="popover-content"
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    `
                        bg-popover text-popover-foreground z-50 w-72 origin-(--radix-popover-content-transform-origin)
                        rounded-md border p-3 shadow-md outline-hidden
                        data-[state=open]:animate-in data-[state=closed]:animate-out
                        data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
                    `,
                    // Menu-dropdown motion tokens (transitions-dev): grows from
                    // its trigger's origin on open, settles slightly on close
                    // instead of using a symmetric one-size zoom for both.
                    "data-[state=open]:zoom-in-[97%] data-[state=closed]:zoom-out-[99%]",
                    "data-[state=open]:duration-250 data-[state=closed]:duration-150",
                    "data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:ease-[cubic-bezier(0.22,1,0.36,1)]",
                    className
                )}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
