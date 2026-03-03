import { SalesforceEnvironment } from '@/types/salesforce';

import { useUIStore } from '@/store/uiStore';

import { Badge } from '../ui/badge'
import { Button } from '../ui/button';

import Logo from '../../assets/images/Logo.png'
import { 
    Settings,
    HelpCircle,
    Bug,
    Moon
} from 'lucide-react';


function Header() {

    // Data
    const organizationName: string = "Acme";
    const environment: SalesforceEnvironment = SalesforceEnvironment.Production;

    // State
    const isLiveStreamOn: boolean = useUIStore(state => state.isLiveStreamOn);
    const isTraceFlagModalOpen: boolean = useUIStore(state => state.isTraceFlagModalOpen);
    const isShortcutsModalOpen: boolean = useUIStore(state => state.isShortcutsModalOpen);
    const isSettingsModalOpen: boolean = useUIStore(state => state.isSettingsModalOpen);

    // Event Handlers
    const handleDarkModeToggle = useUIStore(state => state.toggleTheme);
    const handleLiveStreamToggle = useUIStore(state => state.toggleLiveStream);
    const handleSetTraceFlag = useUIStore(state => state.toggleTraceFlagModalOpen);
    const handleViewShortcuts = useUIStore(state => state.toggleShortcutsModal);
    const handleSettings = useUIStore(state => state.toggleSettingsModal);

    // Render
    return (

        <header className='
            flex items-center h-12 px-2
            border-b border-dashed border-zinc-300 dark:border-zinc-700'
        >
            
            {/* Header - Left */}
            <div className='header-left flex items-center gap-2'>

                {/* Logo */}
                <div className='flex items-center px-2 py-1'>
                    <img src={Logo} alt="LogStream Logo" className="h-7 dark:invert" />
                </div>

                {/* Organization Badge */}
                <div className='badge items-center'>
                    <Badge variant="outline" className='font-sans text-sm px-4'>{organizationName} {'\u2022'} {environment}</Badge>
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
                    { isLiveStreamOn 
                        ? 
                        <div className='flex items-center gap-2'>
                            <span className='w-2 h-2 bg-emerald-500 rounded-full inline-block animate-pulse'></span>
                            <span className='text-sm font-sans'>Live Streaming</span>
                        </div>
                        : 
                        <div className='flex items-center gap-2'>
                            <span className='w-2 h-2 bg-yellow-500 rounded-full inline-block'></span>
                            <span className='text-sm font-sans'>Paused</span>
                        </div>
                    }
                </Button>
                
                {/* Set Trace Flag */}
                <Button 
                    size='icon-sm' 
                    variant='outline' 
                    title='Set Trace Flag' 
                    aria-label='Set Trace Flag' 
                    aria-expanded={isTraceFlagModalOpen}
                    className='cursor-pointer'
                    onClick={handleSetTraceFlag}
                >
                    <Bug className='w-5 h-5' />
                </Button>

                {/* View Shortcuts */}
                <Button 
                    size='icon-sm' 
                    variant='outline' 
                    title='View Shortcuts' 
                    aria-label='View Shortcuts' 
                    aria-expanded={isShortcutsModalOpen}
                    className='cursor-pointer'
                    onClick={handleViewShortcuts}
                >
                    <HelpCircle className='w-5 h-5' />
                </Button>

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
