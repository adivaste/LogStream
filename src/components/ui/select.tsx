import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Wraps Radix Select so dropdowns inherit the app's theme. A native <select>
// renders its option list with OS chrome, which ignores the design tokens
// entirely and reads as foreign in dark mode.

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
    return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
    className,
    children,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
    return (
        <SelectPrimitive.Trigger
            data-slot="select-trigger"
            className={cn(
                `
                    flex h-8 min-w-0 cursor-pointer items-center justify-between gap-1 rounded-md border-0
                    bg-input/80 px-2 text-sm text-foreground shadow-xs outline-none
                    transition-[color,box-shadow] focus-visible:ring-[2px] focus-visible:ring-ring/50
                    disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/80
                    [&>span]:min-w-0 [&>span]:truncate
                `,
                className
            )}
            {...props}
        >
            {children}
            <SelectPrimitive.Icon asChild>
                <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    );
}

function SelectContent({
    className,
    children,
    position = 'popper',
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
    return (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                data-slot="select-content"
                position={position}
                className={cn(
                    `
                        relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border
                        bg-popover text-popover-foreground shadow-lg font-sans
                        data-[state=open]:animate-in data-[state=closed]:animate-out
                        data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
                        data-[state=open]:zoom-in-[97%] data-[state=closed]:zoom-out-[99%]
                        data-[state=open]:duration-250 data-[state=closed]:duration-150
                        data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)]
                    `,
                    position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
                    className
                )}
                {...props}
            >
                <SelectPrimitive.Viewport
                    className={cn(
                        'p-1',
                        position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]'
                    )}
                >
                    {children}
                </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    );
}

function SelectItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
    return (
        <SelectPrimitive.Item
            data-slot="select-item"
            className={cn(
                `
                    relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-7
                    text-sm text-foreground outline-none
                    data-[highlighted]:bg-muted data-[highlighted]:text-primary
                    data-[disabled]:pointer-events-none data-[disabled]:opacity-50
                `,
                className
            )}
            {...props}
        >
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
            <span className="absolute right-2 flex size-3.5 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                    <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                </SelectPrimitive.ItemIndicator>
            </span>
        </SelectPrimitive.Item>
    );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
