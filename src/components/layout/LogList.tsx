import { ArrowDown, ArrowUp } from "lucide-react";
import { useTableUIStore } from "@/store/tableUIStore";
import { SortBy, SortDirection } from "@/types/ui";
import { LogFilterBar } from "./LogFilterBar";
import React from "react";

function LogList() {

    // Mock Logs Data
    const logs = [
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '32.8KB', duration: '400ms', timestamp: '18:14:32' },
        { operationType: 'R', operation: 'SessionManager', user: 'Aditya Vaste', app: 'Browser', size: '12.4KB', duration: '120ms', timestamp: '18:15:01' },
        { operationType: 'U', operation: 'UserProfileUpdate', user: 'Aditya Vaste', app: 'Browser', size: '2.1MB', duration: '1102ms', timestamp: '18:15:10' },
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '45.2KB', duration: '215ms', timestamp: '18:15:22' },
        { operationType: 'U', operation: 'AuthTokenRefresh', user: 'Aditya Vaste', app: 'Browser', size: '1.2KB', duration: '89ms', timestamp: '18:15:45' },
        { operationType: 'R', operation: 'DataGridLoader', user: 'Aditya Vaste', app: 'Browser', size: '850.5KB', duration: '640ms', timestamp: '18:16:02' },
        { operationType: 'U', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '0.5KB', duration: '45ms', timestamp: '18:16:15' },
        { operationType: 'R', operation: 'ImageResourceFetch', user: 'Aditya Vaste', app: 'Browser', size: '3.4MB', duration: '1540ms', timestamp: '18:16:30' },
        { operationType: 'U', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '15.6KB', duration: '310ms', timestamp: '18:17:05' },
        { operationType: 'R', operation: 'ConfigService', user: 'Aditya Vaste', app: 'Browser', size: '5.2KB', duration: '112ms', timestamp: '18:17:12' },
        { operationType: 'U', operation: 'PreferenceSync', user: 'Aditya Vaste', app: 'Browser', size: '0.9KB', duration: '205ms', timestamp: '18:17:40' },
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '112.3KB', duration: '390ms', timestamp: '18:18:01' },
        { operationType: 'R', operation: 'AssetDiscovery', user: 'Aditya Vaste', app: 'Browser', size: '22.0KB', duration: '150ms', timestamp: '18:18:15' },
        { operationType: 'U', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '4.2KB', duration: '95ms', timestamp: '18:18:22' },
        { operationType: 'U', operation: 'TelemetryPush', user: 'Aditya Vaste', app: 'Browser', size: '18.9KB', duration: '430ms', timestamp: '18:18:50' },
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '205.1KB', duration: '422ms', timestamp: '18:19:10' },
        { operationType: 'R', operation: 'SidebarHydration', user: 'Aditya Vaste', app: 'Browser', size: '14.2KB', duration: '180ms', timestamp: '18:19:33' },
        { operationType: 'U', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '0.8KB', duration: '55ms', timestamp: '18:19:45' },
        { operationType: 'R', operation: 'FontLoader', user: 'Aditya Vaste', app: 'Browser', size: '420.0KB', duration: '310ms', timestamp: '18:20:02' },
        { operationType: 'U', operation: 'CacheInvalidator', user: 'Aditya Vaste', app: 'Browser', size: '0.2KB', duration: '20ms', timestamp: '18:20:15' },
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '98.5KB', duration: '290ms', timestamp: '18:20:45' },
        { operationType: 'R', operation: 'SidebarHydration', user: 'Aditya Vaste', app: 'Browser', size: '14.2KB', duration: '180ms', timestamp: '18:19:33' },
        { operationType: 'U', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '0.8KB', duration: '55ms', timestamp: '18:19:45' },
        { operationType: 'R', operation: 'FontLoader', user: 'Aditya Vaste', app: 'Browser', size: '420.0KB', duration: '310ms', timestamp: '18:20:02' },
        { operationType: 'U', operation: 'CacheInvalidator', user: 'Aditya Vaste', app: 'Browser', size: '0.2KB', duration: '20ms', timestamp: '18:20:15' },
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '98.5KB', duration: '290ms', timestamp: '18:20:45' },
        { operationType: 'R', operation: 'SidebarHydration', user: 'Aditya Vaste', app: 'Browser', size: '14.2KB', duration: '180ms', timestamp: '18:19:33' },
        { operationType: 'U', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '0.8KB', duration: '55ms', timestamp: '18:19:45' },
        { operationType: 'R', operation: 'FontLoader', user: 'Aditya Vaste', app: 'Browser', size: '420.0KB', duration: '310ms', timestamp: '18:20:02' },
        { operationType: 'U', operation: 'CacheInvalidator', user: 'Aditya Vaste', app: 'Browser', size: '0.2KB', duration: '20ms', timestamp: '18:20:15' },
        { operationType: 'R', operation: 'UniversalPerfLogger', user: 'Aditya Vaste', app: 'Browser', size: '98.5KB', duration: '290ms', timestamp: '18:20:45' }
    ];


    // Sorting State
    const sortBy: SortBy = useTableUIStore(state => state.sortBy);
    const sortDirection: SortDirection = useTableUIStore(state => state.sortDirection);
    const setSorting = useTableUIStore(state => state.setSorting);

    const handleSort = (event: React.MouseEvent<HTMLDivElement>) => {    
        const newSortBy = event.currentTarget.getAttribute('data-column') as SortBy;
        const newSortDirection = sortBy === newSortBy
            ? (sortDirection === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC)
            : SortDirection.ASC;
        
        setSorting(newSortBy, newSortDirection);
    }


    // Sorting Logic
    logs.sort((a, b) => {
        let compareValue = 0;
        if (sortBy === SortBy.SIZE) {
            const sizeA = parseFloat(a.size);
            const sizeB = parseFloat(b.size);
            compareValue = sizeA - sizeB;
        } else if (sortBy === SortBy.DURATION) {
            const durationA = parseFloat(a.duration);
            const durationB = parseFloat(b.duration);
            compareValue = durationA - durationB;
        } else if (sortBy === SortBy.TIMESTAMP) {
            const timeA = new Date(`1970-01-01T${a.timestamp}Z`).getTime();
            const timeB = new Date(`1970-01-01T${b.timestamp}Z`).getTime();
            compareValue = timeA - timeB;
        } else {
            compareValue = a[sortBy].localeCompare(b[sortBy]);
        }
        return sortDirection === SortDirection.ASC ? compareValue : -compareValue;
    });

    const tableColumns: string[] = ['operation', 'user', 'app', 'size', 'duration', 'timestamp'];

    return (

        <section className="flex-1">
            <table className="table w-full">

                {/* Filter Bar */}
                <LogFilterBar />

                {/* Table Header */}
                <thead className="grid grid-cols-6 border-y border-border py-1 px-8 bg-card sticky top-12 z-10">
                    {tableColumns.map((column) => (
                        <td
                            key={column}
                            tabIndex={0}
                            data-column={column}
                            onClick={handleSort}
                            className={`
                                text-sans text-xs font-medium uppercase tracking-wider
                                dark:text-neutral-400 py-1 px-2 cursor-pointer rounded
                                focus-visible:ring-emerald-400/70 focus-visible:outline-none 
                                focus-visible:ring-1 focus-visible:ring-inset flex items-center
                            `}
                        >
                            {/* Column Name */}
                            {column.charAt(0).toUpperCase() + column.slice(1)}
                            
                            {/* Sort Icon */}
                            { sortBy === column && (
                                sortDirection === SortDirection.ASC ? (
                                    <ArrowUp size={16} className="ml-1 text-emerald-500" />
                                ) : (
                                    <ArrowDown size={16} className="ml-1 text-emerald-500" />
                                )
                            )}
                        </td>
                    ))}
                </thead>


                {/* Table Body */}
                <tbody>

                    {/* Table Row */}
                    {logs.map((log, index) => (
                        <tr 
                            key={index} 
                            className="grid grid-cols-6 gap-4 border-b border-border py-2 px-8"
                        >
                            
                            <td tabIndex={0} className="
                                text-sans text-sm text-primary rounded px-2 py-px
                                focus-visible:ring-emerald-600 focus-visible:outline-none
                                focus-visible:ring-1 focus-visible:ring-inset" 
                            >
                                {log.operation}
                            </td>
                            <td className="text-sans text-sm text-primary">{log.user}</td>
                            <td className="text-sans text-sm text-primary">{log.app}</td>
                            <td className="text-sans text-sm text-primary/70 dark:text-primary/50 font-mono">{log.size}</td>
                            <td className="text-sans text-sm text-muted-foreground font-mono bg-muted w-fit px-2 py-px rounded">
                                {log.duration}
                            </td>
                            <td className="text-sans text-sm text-muted-foreground font-mono">{log.timestamp}</td>
                        </tr>
                    ))}

                </tbody>

            </table>
        </section>

    );
}

export { LogList };