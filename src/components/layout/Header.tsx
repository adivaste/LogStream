import React from 'react';

import { useUIStore } from '@/store/uiStore';

import { Badge } from '../ui/badge'
import { Button } from '../ui/button';
import { IconCrossfade } from '../ui/icon-crossfade';
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
    Keyboard,
    Sun
} from 'lucide-react';

// Borderless, elevated-background treatment for every header toolbar button -
// bg-input/80 (up from the outline variant's default bg-input/30) reads as a
// solid, cleaner surface without needing a border for definition. The
// dark: variants are required, not redundant: Button's own `outline` variant
// bakes in `dark:bg-input/30`/`dark:hover:bg-input/50`, which is a *different*
// variant scope from a plain `bg-input/80` as far as tailwind-merge is
// concerned - without an explicit dark: override here, cascade order (not
// this className) would decide which one wins in dark mode.
const HEADER_BUTTON_CLASSNAME = 'cursor-pointer border-0 bg-input/80 hover:bg-input/90 dark:bg-input/80 dark:hover:bg-input/90';

function Header() {

    // Data
    const connectionInfo = useUIStore(state => state.connectionInfo);
    const sessionDetectionState = useUIStore(state => state.sessionDetectionState);
    const refreshSession = useUIStore(state => state.refreshSession);

    // State
    const isLiveStreamOn: boolean = useUIStore(state => state.isLiveStreamOn);
    const livePollingState = useUIStore(state => state.livePollingState);
    const isTraceFlagPopoverOpen: boolean = useUIStore(state => state.isTraceFlagPopoverOpen);
    const [isApiLimitPopoverOpen, setIsApiLimitPopoverOpen] = React.useState(false);
    const isShortcutsPopoverOpen: boolean = useUIStore(state => state.isShortcutsPopoverOpen);
    const isSettingsModalOpen: boolean = useUIStore(state => state.isSettingsModalOpen);
    const theme = useUIStore(state => state.theme);

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

    // The background can lose the Salesforce session between detections (cookie
    // expiry, sign-out, service worker restart) and reports it via
    // livePollingState. Without this check the badge would keep showing the
    // last-detected org as "connected" even after the live stream pill says
    // "Session Expired" - the two indicators must agree.
    const isSessionExpired = livePollingState === 'session_expired';

    const sessionBadgeLabel = React.useMemo(() => {
        if (isSessionExpired) {
            return 'Session expired - reconnect';
        }

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

        return 'Not connected';
    }, [connectionInfo, isSessionExpired, sessionDetectionState]);

    const sessionBadgeClassName = React.useMemo(() => {
        if (isSessionExpired) {
            return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
        }

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
    }, [isSessionExpired, sessionDetectionState]);

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
                    className={`rounded-md px-4 ${HEADER_BUTTON_CLASSNAME}`}
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
                        ${HEADER_BUTTON_CLASSNAME}
                        ${sessionDetectionState === 'connected' ? 'text-emerald-600 dark:text-emerald-300' : ''}
                    `}
                    onClick={() => void refreshSession()}
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
                            className={HEADER_BUTTON_CLASSNAME}
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
                            className={HEADER_BUTTON_CLASSNAME}
                        >
                            <Bug className='w-5 h-5' />
                        </Button>
                    </PopoverTrigger>
                    <TraceFlagPopover isOpen={isTraceFlagPopoverOpen} />
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
                            className={HEADER_BUTTON_CLASSNAME}
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
                    className={HEADER_BUTTON_CLASSNAME}
                    onClick={handleDarkModeToggle}
                >
                    {/* Icon shows the action a click will take, matching SettingsSheet's
                        theme toggle: Sun (switch to light) while dark, Moon while light. */}
                    <IconCrossfade
                        activeKey={theme}
                        className="size-5"
                        icons={{
                            dark: <Sun className='w-5 h-5' />,
                            light: <Moon className='w-5 h-5' />
                        }}
                    />
                </Button>

                {/* Settings */}
                <Button 
                    size='icon-sm' 
                    variant='outline' 
                    title='Settings' 
                    aria-label='Settings' 
                    aria-expanded={isSettingsModalOpen}
                    className={HEADER_BUTTON_CLASSNAME}
                    onClick={handleSettings}
                >
                    <Settings className='w-5 h-5' />
                </Button>

            </div>

        </header>
    )
}

export { Header }
