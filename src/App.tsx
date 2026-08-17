import React from 'react'
import './App.css'
import { Header } from './components/layout/Header'
import { LogList } from './components/layout/LogList'
import { Insights } from './components/layout/Insights'
import { LogPanel } from './components/layout/LogPanel'
import { SettingsSheet } from './components/layout/SettingsSheet'
import { Toaster } from './components/ui/sonner'
import { Button } from './components/ui/button'
import { ScrollArea, ScrollAreaScrollbar, ScrollAreaViewport } from './components/ui/scroll-area'
import { useDelayedLoadingGate } from './hooks/useDelayedLoadingGate'
import { useLiveLogs } from './hooks/useLiveLogs'
import { useShortcutManager } from './hooks/useShortcutManager'
import { connectSalesforceOrg } from './services/salesforceConnection'
import { removeTestLogData } from './services/testLogDataCleanup'
import { useUIStore } from './store/uiStore'
import { Database, Loader2, PlugZap, Radio } from 'lucide-react'

function DetectingOrgScreen() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
            <div className="flex items-center gap-1">
                <div className="rotate-90">
                    <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#00BC7D" fillRule="evenodd" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10m-5.293.793l-4-4a1 1 0 0 0-1.414 0l-4 4a1 1 0 1 0 1.414 1.414L12 10.914l3.293 3.293a1 1 0 0 0 1.414-1.414" clipRule="evenodd"/></svg>
                </div>
                <span className="text-[22px] font-serif font-semibold -tracking-wide">Log</span>
                <span className="text-[22px] font-serif font-semibold -tracking-wide text-neutral-500">Stream</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
                <Loader2 className="h-4 w-4 animate-spin" />
                Detecting Salesforce session...
            </div>
        </main>
    )
}


function ConnectOrgGuide() {
    const setConnectionInfo = useUIStore(state => state.setConnectionInfo);
    const [isConnecting, setIsConnecting] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);

    const handleConnect = React.useCallback(async () => {
        setIsConnecting(true);
        setMessage(null);

        try {
            const result = await connectSalesforceOrg();

            if (result.status === 'connected') {
                setConnectionInfo(result.connectionInfo);
                return;
            }

            setConnectionInfo(null);
            setMessage('Open a Salesforce org tab, sign in, then try connecting again.');
        } catch {
            setConnectionInfo(null);
            setMessage('Could not detect a Salesforce session from the current browser context.');
        } finally {
            setIsConnecting(false);
        }
    }, [setConnectionInfo]);

    return (
        <main className="flex flex-1 items-center justify-center px-6">
            <section className="mx-auto flex max-w-xl flex-col items-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                    <Radio className="h-7 w-7" />
                </div>

                <h1 className="text-2xl font-semibold tracking-normal text-foreground font-sans [text-wrap:balance]">
                    Connect a Salesforce org to start streaming logs
                </h1>

                <p className="mt-3 text-sm leading-6 text-muted-foreground font-sans [text-wrap:pretty]">
                    LogStream reads your active Salesforce browser session, then streams Apex logs into this workspace.
                    No logs are loaded until an org is connected.
                </p>

                <div className="mt-6 grid w-full gap-2 text-left sm:grid-cols-2 font-sans">
                    <div className="rounded-md border border-border bg-card/40 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <PlugZap className="h-4 w-4 text-emerald-500" />
                            Detect session
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Open your Salesforce org in another tab and use Connect.
                        </p>
                    </div>

                    <div className="rounded-md border border-border bg-card/40 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Database className="h-4 w-4 text-sky-500" />
                            Start streaming
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Once connected, live polling and log body loading begin for that org.
                        </p>
                    </div>
                </div>

                <Button
                    className="mt-6 font-sans"
                    disabled={isConnecting}
                    onClick={handleConnect}
                >
                    <PlugZap className={`h-4 w-4 ${isConnecting ? 'animate-pulse' : ''}`} />
                    {isConnecting ? 'Connecting...' : 'Connect Org'}
                </Button>

                {message && (
                    <p className="mt-3 text-sm text-amber-700 dark:text-amber-300 font-sans">
                        {message}
                    </p>
                )}
            </section>
        </main>
    )
}

function App() {
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const isInsightsVisible = useUIStore(state => state.isInsightsVisible);
    const isInitialSessionDetectionComplete = useUIStore(state => state.isInitialSessionDetectionComplete);
    const refreshSession = useUIStore(state => state.refreshSession);
    const completeInitialSessionDetection = useUIStore(state => state.completeInitialSessionDetection);
    useShortcutManager();
    // Called once here and passed down - both LogList and Insights need the
    // same live log data, and useLiveLogs owns side effects (polling,
    // SET_LIVE_POLLING requests) that must not run twice in parallel.
    const liveLogs = useLiveLogs();
    // Insights + LogList share this one scroll viewport instead of scrolling
    // the window. Window/native scrollbars are OS-drawn chrome that no DOM
    // element - including LogPanel's fixed overlay - can ever visually cover,
    // which is why opening the log panel used to show two competing
    // scrollbars at once. A custom, DOM-rendered ScrollArea here can be
    // covered like any other element, and LogPanel's own overlay now hides it
    // naturally instead of needing a manual body-scroll-lock workaround.
    const mainScrollElementRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        void removeTestLogData();
    }, []);

    React.useEffect(() => {
        // Drives the auto-hiding scrollbar (see index.css): `scroll` events
        // don't bubble, but they ARE still delivered to a capture-phase
        // listener on window regardless of which nested overflow region
        // fired them - so this one listener covers every scrollable panel.
        let hideTimeoutId: number | undefined;

        const handleScroll = () => {
            document.documentElement.setAttribute('data-scrolling', 'true');
            window.clearTimeout(hideTimeoutId);
            hideTimeoutId = window.setTimeout(() => {
                document.documentElement.removeAttribute('data-scrolling');
            }, 600);
        };

        window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            window.clearTimeout(hideTimeoutId);
        };
    }, []);

    React.useEffect(() => {
        // Auto-detect the Salesforce session once on mount so the user
        // doesn't have to click the Detect Session button manually. This must
        // live here (not in Header) since Header only mounts once detection
        // is complete - triggering it from inside Header would deadlock the
        // full-page loader below.
        void refreshSession().finally(completeInitialSessionDetection);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const shouldShowDetectingScreen = useDelayedLoadingGate(isInitialSessionDetectionComplete);

    if (shouldShowDetectingScreen) {
        return (
            <div className="App">
                <DetectingOrgScreen />
            </div>
        )
    }

    if (!isInitialSessionDetectionComplete) {
        // Still detecting, but under the show-delay threshold - render
        // nothing rather than a screen that would just flash.
        return <div className="App" />
    }

    return (
        <div className="App flex h-screen flex-col overflow-hidden">
            <Header />
            <SettingsSheet />
            <Toaster />

            {connectionInfo ? (
                <>
                    <ScrollArea className="min-h-0 flex-1">
                        <ScrollAreaViewport ref={mainScrollElementRef} className="overscroll-contain">
                            {isInsightsVisible && <Insights logs={liveLogs.logs} />}
                            <LogList {...liveLogs} scrollElementRef={mainScrollElementRef} />
                        </ScrollAreaViewport>
                        <ScrollAreaScrollbar />
                    </ScrollArea>
                    <LogPanel />
                </>
            ) : (
                <ConnectOrgGuide />
            )}
        </div>
    )
}

export default App
