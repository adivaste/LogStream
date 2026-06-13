import React from 'react';
import { SalesforceEnvironment } from '@/types/salesforce';

import { useUIStore } from '@/store/uiStore';
import { connectSalesforceOrg } from '@/services/salesforceConnection';

import { Badge } from '../ui/badge'
import { Button } from '../ui/button';
import { Popover, PopoverTrigger } from '../ui/popover';
import { ApiLimitPopover } from './ApiLimitPopover';
import { KeyboardShortcutsPopover } from './KeyboardShortcutsPopover';
import { TraceFlagPopover } from './TraceFlagPopover';

import { 
    Settings,
    Bug,
    Moon,
    PlugZap,
    Gauge,
    Keyboard
} from 'lucide-react';

type SessionDetectionState =
    | 'idle'
    | 'detecting'
    | 'connected'
    | 'not_found'
    | 'failed';

function Header() {

    // Data
    const organizationName: string = "Acme";
    const environment: SalesforceEnvironment = SalesforceEnvironment.Production;
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const setConnectionInfo = useUIStore(state => state.setConnectionInfo);
    const [sessionDetectionState, setSessionDetectionState] = React.useState<SessionDetectionState>('idle');

    // State
    const isLiveStreamOn: boolean = useUIStore(state => state.isLiveStreamOn);
    const livePollingState = useUIStore(state => state.livePollingState);
    const isTraceFlagPopoverOpen: boolean = useUIStore(state => state.isTraceFlagPopoverOpen);
    const [isApiLimitPopoverOpen, setIsApiLimitPopoverOpen] = React.useState(false);
    const isShortcutsPopoverOpen: boolean = useUIStore(state => state.isShortcutsPopoverOpen);
    const isSettingsModalOpen: boolean = useUIStore(state => state.isSettingsModalOpen);

    // Event Handlers
    const handleDarkModeToggle = useUIStore(state => state.toggleTheme);
    const handleLiveStreamToggle = useUIStore(state => state.toggleLiveStream);
    const setTraceFlagPopoverOpen = useUIStore(state => state.setTraceFlagPopoverOpen);
    const setShortcutsPopoverOpen = useUIStore(state => state.setShortcutsPopoverOpen);
    const handleSettings = useUIStore(state => state.toggleSettingsModal);

    const liveStreamLabel = React.useMemo(() => {
        if (!isLiveStreamOn || livePollingState === 'manual_paused') {
            return 'Paused';
        }

        if (livePollingState === 'syncing') {
            return 'Syncing';
        }

        if (livePollingState === 'idle_paused') {
            return 'Idle Paused';
        }

        if (livePollingState === 'offline') {
            return 'Offline';
        }

        if (livePollingState === 'api_throttled') {
            return 'Throttled';
        }

        if (livePollingState === 'api_exceeded') {
            return 'Limit Reached';
        }

        if (livePollingState === 'session_expired') {
            return 'Session Expired';
        }

        return 'Live Streaming';
    }, [isLiveStreamOn, livePollingState]);

    const liveStreamDotClassName = React.useMemo(() => {
        if (livePollingState === 'syncing') {
            return 'bg-sky-500 animate-pulse';
        }

        if (livePollingState === 'live') {
            return 'bg-emerald-500 animate-pulse';
        }

        if (livePollingState === 'idle_paused' || livePollingState === 'manual_paused') {
            return 'bg-yellow-500';
        }

        if (livePollingState === 'offline' || livePollingState === 'session_expired' || livePollingState === 'api_exceeded') {
            return 'bg-red-500';
        }

        return 'bg-muted-foreground';
    }, [livePollingState]);

    const sessionBadgeLabel = React.useMemo(() => {
        if (sessionDetectionState === 'detecting') {
            return 'Detecting org...';
        }

        if (sessionDetectionState === 'connected' && connectionInfo) {
            return `${connectionInfo.orgName ?? connectionInfo.orgId} - ${connectionInfo.environment}`;
        }

        if (sessionDetectionState === 'failed') {
            return 'Session check failed';
        }

        if (sessionDetectionState === 'not_found') {
            return 'No Salesforce org';
        }

        return `${organizationName} - ${environment}`;
    }, [connectionInfo, environment, organizationName, sessionDetectionState]);

    const sessionBadgeClassName = React.useMemo(() => {
        if (sessionDetectionState === 'connected') {
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        }

        if (sessionDetectionState === 'detecting') {
            return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
        }

        if (sessionDetectionState === 'failed') {
            return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
        }

        if (sessionDetectionState === 'not_found') {
            return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        }

        return '';
    }, [sessionDetectionState]);

    const handleRefreshSession = React.useCallback(async () => {
        setSessionDetectionState('detecting');

        try {
            const result = await connectSalesforceOrg();
            setConnectionInfo(result.connectionInfo);
            setSessionDetectionState(result.status === 'connected' ? 'connected' : 'not_found');
        } catch {
            setConnectionInfo(null);
            setSessionDetectionState('failed');
        }
    }, [setConnectionInfo]);

    // Render
    return (

        <header className='
            flex items-center h-13 px-2
            border-b border-zinc-300 dark:border-zinc-800'
        >
            
            {/* Header - Left */}
            <div className='header-left flex items-center gap-2'>

                {/* Logo */}
                <div className='flex items-center px-2 py-1 gap-1'>

                    {/* Icon */}
                    <div className='rotate-90'>
                        <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#00BC7D" fillRule="evenodd" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10m-5.293.793l-4-4a1 1 0 0 0-1.414 0l-4 4a1 1 0 1 0 1.414 1.414L12 10.914l3.293 3.293a1 1 0 0 0 1.414-1.414" clipRule="evenodd"/></svg>
                    </div>

                    {/* Text */}
                    <div className='flex items-center justify-center'>
                        <span className='text-[22px] font-serif font-semibold -tracking-wide'>Log</span>
                        <span className='text-[22px] font-serif font-semibold -tracking-wide text-neutral-500'>Stream</span>
                    </div>
                </div>

                {/* Organization Badge */}
                <div className='badge items-center'>
                    <Badge
                        variant="outline"
                        className={`font-sans text-sm px-4 transition-colors ${sessionBadgeClassName}`}
                    >
                        {sessionBadgeLabel}
                    </Badge>
                </div>

            </div>


            {/* Header - Right */}
            <div className='header-right ml-auto flex items-center gap-2 px-2'>

                {/* Live Log Stream - Toggle */}
                <Button 
                    size="sm" 
                    variant="outline" 
                    title='Live Log Stream Toggle'
                    role='switch'
                    aria-label='Live Log Stream Toggle'
                    aria-checked={isLiveStreamOn}
                    className='border-zinc-200 rounded-md px-4 cursor-pointer' 
                    onClick={handleLiveStreamToggle}
                >
                    <div className='flex items-center gap-2'>
                        <span className={`w-2 h-2 rounded-full inline-block ${liveStreamDotClassName}`}></span>
                        <span className='text-sm font-sans'>{liveStreamLabel}</span>
                    </div>
                </Button>

                {/* Detect Salesforce Session */}
                <Button
                    size='icon-sm'
                    variant='outline'
                    title='Detect Salesforce Session'
                    aria-label='Detect Salesforce Session'
                    aria-busy={sessionDetectionState === 'detecting'}
                    className={`
                        cursor-pointer
                        ${sessionDetectionState === 'connected' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-300' : ''}
                    `}
                    onClick={handleRefreshSession}
                >
                    <PlugZap className={`w-5 h-5 ${sessionDetectionState === 'detecting' ? 'animate-pulse' : ''}`} />
                </Button>

                {/* API Limit Usage */}
                <Popover
                    open={isApiLimitPopoverOpen}
                    onOpenChange={setIsApiLimitPopoverOpen}
                >
                    <PopoverTrigger asChild>
                        <Button
                            size='icon-sm'
                            variant='outline'
                            title='API Limit Usage'
                            aria-label='API Limit Usage'
                            aria-expanded={isApiLimitPopoverOpen}
                            className='cursor-pointer'
                        >
                            <Gauge className='w-5 h-5' />
                        </Button>
                    </PopoverTrigger>
                    <ApiLimitPopover isOpen={isApiLimitPopoverOpen} />
                </Popover>

                {/* Set Trace Flag */}
                <Popover
                    open={isTraceFlagPopoverOpen}
                    onOpenChange={setTraceFlagPopoverOpen}
                >
                    <PopoverTrigger asChild>
                        <Button 
                            size='icon-sm' 
                            variant='outline' 
                            title='Set Trace Flag' 
                            aria-label='Set Trace Flag' 
                            aria-expanded={isTraceFlagPopoverOpen}
                            className='cursor-pointer'
                        >
                            <Bug className='w-5 h-5' />
                        </Button>
                    </PopoverTrigger>
                    <TraceFlagPopover />
                </Popover>

                {/* Keyboard Shortcuts */}
                <Popover
                    open={isShortcutsPopoverOpen}
                    onOpenChange={setShortcutsPopoverOpen}
                >
                    <PopoverTrigger asChild>
                        <Button
                            size='icon-sm'
                            variant='outline'
                            title='Keyboard Shortcuts'
                            aria-label='Keyboard Shortcuts'
                            aria-expanded={isShortcutsPopoverOpen}
                            className='cursor-pointer'
                        >
                            <Keyboard className='w-5 h-5' />
                        </Button>
                    </PopoverTrigger>
                    <KeyboardShortcutsPopover />
                </Popover>

                {/* Theme */}
                <Button 
                    size='icon-sm' 
                    variant='outline' 
                    title='Theme' 
                    aria-label='Theme'
                    className='cursor-pointer'
                    onClick={handleDarkModeToggle}
                >
                    <Moon className='w-5 h-5' />
                </Button>

                {/* Settings */}
                <Button 
                    size='icon-sm' 
                    variant='outline' 
                    title='Settings' 
                    aria-label='Settings' 
                    aria-expanded={isSettingsModalOpen}
                    className='cursor-pointer'
                    onClick={handleSettings}
                >
                    <Settings className='w-5 h-5' />
                </Button>

            </div>

        </header>
    )
}

export { Header }
