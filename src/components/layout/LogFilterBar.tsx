import React from "react";
import { Search, X } from "lucide-react";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { formatCompactDate, formatDateInput, formatTime } from "@/lib/utils";
import { useTableUIStore } from "@/store/tableUIStore";
import type { LogEntry } from "@/types/ui";

type UserFilterOption = {
    id: string;
    name: string;
}

type LogFilterBarProps = {
    logs: LogEntry[];
    filteredLogCount: number;
}

function LogFilterBar({
    logs,
    filteredLogCount
}: LogFilterBarProps) {

    // Filter state
    const selectedUser = useTableUIStore(state => state.selectedUser);
    const startTime = useTableUIStore(state => state.startTime);
    const endTime = useTableUIStore(state => state.endTime);
    const searchQuery = useTableUIStore(state => state.searchQuery);

    // Filter actions
    const setSelectedUser = useTableUIStore(state => state.setSelectedUser);
    const setTimeRange = useTableUIStore(state => state.setTimeRange);
    const setSearchQuery = useTableUIStore(state => state.setSearchQuery);
    const clearFilters = useTableUIStore(state => state.clearFilters);
    const isDefaultFilterRange = useTableUIStore(state => state.isDefaultFilterRange);

    const hasActiveFilters = Boolean(searchQuery.trim() || selectedUser || !isDefaultFilterRange());

    const users = React.useMemo<UserFilterOption[]>(() => {
        const uniqueUsers = new Set(logs.map(log => log.user).filter(Boolean));

        return [...uniqueUsers]
            .sort((firstUser, secondUser) => firstUser.localeCompare(secondUser))
            .map(user => ({
                id: user,
                name: user
            }));
    }, [logs]);

    // Event Handlers
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    }
    const handleUserChange = (value: string | null) => {
        setSelectedUser(value);
    }
    const handleDateChange = (type: "start" | "end", value: string) => {
        const [year = 0, month = 1, day = 1] = value.split("-").map(Number);

        if (type === "start") {
            const newStartTime = new Date(startTime);
            newStartTime.setFullYear(year, month - 1, day);
            setTimeRange(newStartTime, endTime);
        } else {
            const newEndTime = new Date(endTime);
            newEndTime.setFullYear(year, month - 1, day);
            setTimeRange(startTime, newEndTime);
        }
    }
    const handleTimeChange = (type: "start" | "end", value: string) => {
        const [hours = 0, minutes = 0] = value.split(":").map(Number);

        if (type === "start") {
            const newStartTime = new Date(startTime);
            newStartTime.setHours(hours);
            newStartTime.setMinutes(minutes);
            setTimeRange(newStartTime, endTime);
        } else {
            const newEndTime = new Date(endTime);
            newEndTime.setHours(hours);
            newEndTime.setMinutes(minutes);
            setTimeRange(startTime, newEndTime);
        }
    }

    return (
        <div className="bg-background border-border border-b-0 flex items-center gap-2 px-4 py-2 z-10 sticky top-0">
            
            {/* Search Bar */}
            <div className='
                flex items-center gap-2 border border-input px-2 h-9 rounded-md w-full max-w-md bg-input/30 shadow-xs transition-[color,box-shadow]
                focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 font-sans'
            >
                <Search className='text-muted-foreground' size={16} />
                <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    placeholder="Search logs..."
                    onChange={handleSearch}
                    aria-label="Search logs"
                    className='flex-1 outline-none text-sm p-0 text-foreground placeholder:text-muted-foreground bg-transparent font-sans'
                />
            </div>

            
            {/* Time Picker */}
            <Popover>
                
                {/* PopOver Trigger */}
                <PopoverTrigger
                    aria-label="Select time range"
                    className="bg-input/30 border border-input text-sm px-2.5 h-9 rounded-md cursor-pointer flex items-center justify-center gap-1.5 text-foreground shadow-xs hover:bg-input/40 transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 font-sans"
                >
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium">{formatCompactDate(startTime)}</span>
                    <span className="tabular-nums font-medium">{formatTime(startTime)}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="font-medium">{formatCompactDate(endTime)}</span>
                    <span className="tabular-nums font-medium">{formatTime(endTime)}</span>
                </PopoverTrigger>

                {/* PopOver Content */}
                <PopoverContent className="w-auto bg-popover border border-border shadow-lg px-3 py-3 font-sans">
                    
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3 inline-block font-sans">
                        Select Date & Time Range
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        
                        {/* Start Date & Time */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1 font-sans">
                                Start
                            </label>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="date"
                                    aria-label="Start date"
                                    className="h-8 w-32 border border-input rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={formatDateInput(startTime)}
                                    onChange={(e) => handleDateChange("start", e.target.value)}
                                />
                                <input
                                    type="time"
                                    aria-label="Start time"
                                    className="h-8 w-24 border border-input rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                    value={formatTime(startTime)}
                                    onChange={(e) => handleTimeChange("start", e.target.value)}
                                />
                            </div>
                        </div>

                        {/* End Date & Time */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1 font-sans">
                                End
                            </label>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="date"
                                    aria-label="End date"
                                    className="h-8 w-32 border border-input rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={formatDateInput(endTime)}
                                    onChange={(e) => handleDateChange("end", e.target.value)}
                                />
                                <input
                                    type="time"
                                    aria-label="End time"
                                    className="h-8 w-24 border border-input rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                    value={formatTime(endTime)}
                                    onChange={(e) => handleTimeChange("end", e.target.value)}
                                />
                            </div>
                        </div>

                    </div>
                </PopoverContent>
            </Popover>


            {/* User Select */}
            <Combobox
                value={selectedUser ?? ""}
                items={users}
                onValueChange={handleUserChange}
                autoHighlight
            >
                <ComboboxInput 
                    placeholder="Select a user" 
                    className="bg-input/30 dark:bg-input/30 h-9 text-sm text-foreground placeholder:text-muted-foreground font-sans"
                    showClear
                />
                <ComboboxContent >
                    <ComboboxEmpty>No user found.</ComboboxEmpty>
                    <ComboboxList className="max-h-60 overflow-y-auto no-scrollbar">
                        {(item) => (
                            <ComboboxItem key={item.id} value={item.id} className="font-sans">
                                {item.name}
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>

            {/* Clear Filters */}
            <button
                type="button"
                disabled={!hasActiveFilters}
                aria-label="Clear filters"
                title="Clear filters"
                className="
                    flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-input/30
                    text-muted-foreground shadow-xs transition-[color,box-shadow,background-color]
                    hover:bg-input/40 hover:text-foreground
                    focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50
                    disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-input/30 disabled:hover:text-muted-foreground
                "
                onClick={clearFilters}
            >
                <X size={16} />
            </button>

            {/* Search/Filter Result Count */}
            <div
                aria-live="polite"
                className="text-sm text-muted-foreground ml-auto font-sans"
            > 
                Showing 
                <span className="font-medium text-foreground mx-1">{filteredLogCount.toLocaleString()}</span>
                from
                <span className="font-medium"> {logs.length.toLocaleString()} logs</span>
            </div>

        </div>
    );
}

export { LogFilterBar };
