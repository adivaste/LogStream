import * as React from "react"

import { cn } from "@/lib/utils"

type IconCrossfadeProps = {
    activeKey: string
    icons: Record<string, React.ReactNode>
    className?: string
}

// No motion library is installed in this project, so state changes between
// icons (e.g. theme sun/moon, trace-flag loading/active/inactive) cross-fade
// with plain CSS instead of framer-motion's spring transition. Every icon
// stays mounted, stacked in the same grid cell, and only opacity/scale/blur
// toggle - keeping both an enter and an exit animation without JS timers.
function IconCrossfade({ activeKey, icons, className }: IconCrossfadeProps) {
    return (
        <span className={cn("relative inline-grid place-items-center", className)}>
            {Object.entries(icons).map(([key, icon]) => (
                <span
                    key={key}
                    aria-hidden={key !== activeKey}
                    className={cn(
                        "col-start-1 row-start-1 pointer-events-none transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        key === activeKey
                            ? "scale-100 opacity-100 blur-none"
                            : "scale-25 opacity-0 blur-[4px]"
                    )}
                >
                    {icon}
                </span>
            ))}
        </span>
    )
}

export { IconCrossfade }
