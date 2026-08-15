import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert, X } from "lucide-react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

import { useUIStore } from "@/store/uiStore";

// Use this project's existing icon library (lucide-react) instead of
// sonner's bundled default icons, matching every other status/loading
// indicator in the app (TraceFlagPopover, ApiLimitPopover, LogPanel, ...).
const TOAST_ICONS = {
    success: <CheckCircle2 className="size-4" />,
    error: <AlertCircle className="size-4" />,
    warning: <TriangleAlert className="size-4" />,
    info: <Info className="size-4" />,
    loading: <Loader2 className="size-4 animate-spin" />,
    close: <X className="size-4" />
};

const Toaster = (props: ToasterProps) => {
    const theme = useUIStore(state => state.theme);

    return (
        <SonnerToaster
            theme={theme}
            position="bottom-right"
            className="font-sans"
            icons={TOAST_ICONS}
            toastOptions={{
                classNames: {
                    toast: "font-sans !rounded-[6px] !border !border-border !bg-popover !text-popover-foreground !shadow-lg !min-h-0 !h-auto !py-2.5 !px-3",
                    title: "!text-popover-foreground",
                    description: "!text-muted-foreground",
                    actionButton: "!bg-primary !text-primary-foreground",
                    cancelButton: "!bg-muted !text-muted-foreground",
                    closeButton: "!border-border !bg-popover !text-muted-foreground",
                    loading: "!text-muted-foreground",
                    success: "[&_svg]:!text-emerald-500",
                    error: "[&_svg]:!text-destructive",
                    warning: "[&_svg]:!text-amber-500",
                    info: "[&_svg]:!text-sky-500"
                }
            }}
            {...props}
        />
    );
};

export { Toaster };
