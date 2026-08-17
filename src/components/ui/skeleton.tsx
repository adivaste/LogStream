import * as React from "react";

import { cn } from "@/lib/utils";

// Tailwind's built-in `animate-pulse` already does exactly the opacity
// 100%<->50% loop a skeleton needs - no custom keyframe required.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            aria-hidden="true"
            className={cn("animate-pulse rounded-md bg-muted", className)}
            {...props}
        />
    );
}

export { Skeleton };
