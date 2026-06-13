import React from 'react'
import './App.css'
import { Header } from './components/layout/Header'
import { LogList } from './components/layout/LogList'
import { Insights } from './components/layout/Insights'
import { LogPanel } from './components/layout/LogPanel'
import { Button } from './components/ui/button'
import { useShortcutManager } from './hooks/useShortcutManager'
import { connectSalesforceOrg } from './services/salesforceConnection'
import { removeTestLogData } from './services/testLogDataCleanup'
import { useUIStore } from './store/uiStore'
import { Database, PlugZap, Radio } from 'lucide-react'

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
        <main className="flex min-h-[calc(100vh-52px)] items-center justify-center px-6">
            <section className="mx-auto flex max-w-xl flex-col items-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                    <Radio className="h-7 w-7" />
                </div>

                <h1 className="text-2xl font-semibold tracking-normal text-foreground font-sans">
                    Connect a Salesforce org to start streaming logs
                </h1>

                <p className="mt-3 text-sm leading-6 text-muted-foreground font-sans">
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
    useShortcutManager();

    React.useEffect(() => {
        void removeTestLogData();
    }, []);

    return (
        <div className="App">
            <Header />

            {connectionInfo ? (
                <>
                    <Insights />
                    <LogList />
                    <LogPanel />
                </>
            ) : (
                <ConnectOrgGuide />
            )}
        </div>
    )
}

export default App
