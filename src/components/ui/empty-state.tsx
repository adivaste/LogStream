import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
    icon: LucideIcon;
    title: string;
    description?: string;
    tone?: 'default' | 'destructive';
    className?: string;
    iconClassName?: string;
}

function EmptyState({
    icon: Icon,
    title,
    description,
    tone = 'default',
    className,
    iconClassName
}: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-3 px-8 py-10 text-center font-sans", className)}>
            <div
                className={cn(
                    "flex size-10 items-center justify-center rounded-full",
                    tone === 'destructive'
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                    iconClassName
                )}
            >
                <Icon className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
                <p className={cn("text-sm font-medium", tone === 'destructive' ? "text-destructive" : "text-foreground")}>
                    {title}
                </p>
                {description && (
                    <p className="max-w-sm text-xs leading-5 text-muted-foreground [text-wrap:pretty]">
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}

export { EmptyState };
