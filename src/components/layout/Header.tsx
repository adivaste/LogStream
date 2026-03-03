import { SalesforceEnvironment } from '@/types/salesforce';
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

    // Event Handlers
    const handleDarkModeToggle = () => {
        console.log('handleDarkModeToggle');
    };
    const handleLiveStreamToggle = () => {
        console.log('handleLiveStreamToggle');
    };
    const handleSetTraceFlag = () => {
        console.log('handleSetTraceFlag');
    };
    const handleViewShortcuts = () => {
        console.log('handleViewShortcuts');
    };
    const handleSettings = () => {
        console.log('handleSettings');
    };


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
                    aria-label='Live Log Stream Toggle'
                    className='border-zinc-200 rounded-md px-4 flex items-center gap-2' 
                    onClick={handleLiveStreamToggle}
                >
                    <span className='w-2 h-2 bg-emerald-500 rounded-full'></span>
                    <span className='text-sm font-sans'>Live Stream</span>
                </Button>
                
                {/* Set Trace Flag */}
                <Button variant='outline' size='icon-sm' title='Set Trace Flag' aria-label='Set Trace Flag' onClick={handleSetTraceFlag}>
                    <Bug className='w-5 h-5' />
                </Button>

                {/* View Shortcuts */}
                <Button variant='outline' size='icon-sm' title='View Shortcuts' aria-label='View Shortcuts' onClick={handleViewShortcuts}>
                    <HelpCircle className='w-5 h-5' />
                </Button>

                {/* Theme */}
                <Button variant='outline' size='icon-sm' title='Theme' aria-label='Theme' onClick={handleDarkModeToggle}>
                    <Moon className='w-5 h-5' />
                </Button>

                {/* Settings */}
                <Button variant='outline' size='icon-sm' title='Settings' aria-label='Settings' onClick={handleSettings}>
                    <Settings className='w-5 h-5' />
                </Button>

            </div>

        </header>
    )
}

export { Header }
