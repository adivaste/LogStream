import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root>;

function Switch({ className, ...props }: SwitchProps) {
    return (
        <SwitchPrimitive.Root
            className={cn(
                "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0",
                "bg-input/80 transition-colors outline-none",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "data-[checked]:bg-emerald-500 dark:data-[checked]:bg-emerald-500",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                className={cn(
                    "block size-4 translate-x-0.5 rounded-full bg-background shadow-xs transition-transform",
                    "data-[checked]:translate-x-[18px]"
                )}
            />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
