import React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button"
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
import { parseSizeBytes } from "@/lib/logListConfig";
import { formatCompactDate, formatDateInput, formatTime } from "@/lib/utils";
import { useTableUIStore } from "@/store/tableUIStore";
import type { LogEntry } from "@/types/ui";

type UserFilterOption = {
    id: string;
    name: string;
}

type SizeUnit = 'b' | 'kb' | 'mb';

const formatSizeBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }

    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }

    return `${bytes}B`;
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
    const minSizeBytes = useTableUIStore(state => state.minSizeBytes);
    const maxSizeBytes = useTableUIStore(state => state.maxSizeBytes);
    const searchQuery = useTableUIStore(state => state.searchQuery);

    // Filter actions
    const setSelectedUser = useTableUIStore(state => state.setSelectedUser);
    const setTimeRange = useTableUIStore(state => state.setTimeRange);
    const setSizeRange = useTableUIStore(state => state.setSizeRange);
    const setSearchQuery = useTableUIStore(state => state.setSearchQuery);
    const clearFilters = useTableUIStore(state => state.clearFilters);
    const isDefaultFilterRange = useTableUIStore(state => state.isDefaultFilterRange);

    const hasActiveFilters = Boolean(searchQuery.trim() || selectedUser || !isDefaultFilterRange());
    const [isTimeRangePopoverOpen, setTimeRangePopoverOpen] = React.useState(false);
    const [isSizeRangePopoverOpen, setSizeRangePopoverOpen] = React.useState(false);
    const isSameDayRange = formatDateInput(startTime) === formatDateInput(endTime);

    // Size filter inputs are entered in a friendly unit (independent per
    // field) and converted to bytes on change - the store only ever holds
    // bytes, matching how sorting/filtering already work internally.
    const [minSizeValue, setMinSizeValue] = React.useState('');
    const [minSizeUnit, setMinSizeUnit] = React.useState<SizeUnit>('kb');
    const [maxSizeValue, setMaxSizeValue] = React.useState('');
    const [maxSizeUnit, setMaxSizeUnit] = React.useState<SizeUnit>('kb');
    const hasSizeFilter = minSizeBytes !== null || maxSizeBytes !== null;

    const sizeRangeLabel = React.useMemo(() => {
        if (minSizeBytes !== null && maxSizeBytes !== null) {
            return `${formatSizeBytes(minSizeBytes)} - ${formatSizeBytes(maxSizeBytes)}`;
        }

        if (minSizeBytes !== null) {
            return `≥ ${formatSizeBytes(minSizeBytes)}`;
        }

        if (maxSizeBytes !== null) {
            return `≤ ${formatSizeBytes(maxSizeBytes)}`;
        }

        return 'Any size';
    }, [maxSizeBytes, minSizeBytes]);

    const users = React.useMemo<UserFilterOption[]>(() => {
        const uniqueUsers = new Set(logs.map(log => log.user).filter(Boolean));

        return [...uniqueUsers]
            .sort((firstUser, secondUser) => firstUser.localeCompare(secondUser))
            .map(user => ({
                id: user,
                name: user
            }));
    }, [logs]);

    // Keeps the popover's local input text in sync when filters are cleared
    // from elsewhere (e.g. the "Clear All" button), which resets the store
    // directly without going through these local input handlers.
    React.useEffect(() => {
        if (minSizeBytes === null) {
            setMinSizeValue('');
        }
    }, [minSizeBytes]);

    React.useEffect(() => {
        if (maxSizeBytes === null) {
            setMaxSizeValue('');
        }
    }, [maxSizeBytes]);

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
    const handleSizeChange = (
        type: "min" | "max",
        value: string,
        unit: SizeUnit
    ) => {
        const bytes = value.trim() === '' ? null : parseSizeBytes(`${value}${unit}`);

        if (type === "min") {
            setMinSizeValue(value);
            setSizeRange(bytes, maxSizeBytes);
        } else {
            setMaxSizeValue(value);
            setSizeRange(minSizeBytes, bytes);
        }
    }

    const handleSizeUnitChange = (type: "min" | "max", unit: SizeUnit) => {
        if (type === "min") {
            setMinSizeUnit(unit);
            setSizeRange(minSizeValue.trim() === '' ? null : parseSizeBytes(`${minSizeValue}${unit}`), maxSizeBytes);
        } else {
            setMaxSizeUnit(unit);
            setSizeRange(minSizeBytes, maxSizeValue.trim() === '' ? null : parseSizeBytes(`${maxSizeValue}${unit}`));
        }
    }

    const handleClearSizeRange = () => {
        setMinSizeValue('');
        setMaxSizeValue('');
        setSizeRange(null, null);
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
                flex items-center gap-2 border-0 px-2 h-9 rounded-md w-full max-w-md bg-input/80 shadow-xs transition-[color,box-shadow]
                focus-within:ring-[3px] focus-within:ring-ring/50 font-sans'
            >
                <Search className='text-muted-foreground' size={16} />
                <input
                    type="text"
                    value={searchQuery}
                    placeholder="Search logs..."
                    onChange={handleSearch}
                    aria-label="Search logs"
                    className='flex-1 outline-none text-sm p-0 text-foreground placeholder:text-muted-foreground bg-transparent font-sans'
                />
            </div>

            
            {/* Time Picker */}
            <Popover open={isTimeRangePopoverOpen} onOpenChange={setTimeRangePopoverOpen}>

                {/* PopOver Trigger */}
                <PopoverTrigger
                    aria-label="Select time range"
                    aria-expanded={isTimeRangePopoverOpen}
                    className="bg-input/80 border-0 text-sm px-2.5 h-9 rounded-md cursor-pointer flex items-center justify-center gap-1.5 text-foreground shadow-xs hover:bg-input/90 transition-[color,box-shadow,background-color] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 font-sans"
                >
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium">{formatCompactDate(startTime)}</span>
                    <span className="tabular-nums font-medium">{formatTime(startTime)}</span>
                    <span className="text-muted-foreground">-</span>
                    {/* Same day: the date above already gives the context - a second,
                        identical date here would just be redundant. */}
                    {!isSameDayRange && (
                        <span className="font-medium">{formatCompactDate(endTime)}</span>
                    )}
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
                                    className="h-8 w-32 border-0 rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={formatDateInput(startTime)}
                                    onChange={(e) => handleDateChange("start", e.target.value)}
                                />
                                <input
                                    type="time"
                                    aria-label="Start time"
                                    className="h-8 w-24 border-0 rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
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
                                    className="h-8 w-32 border-0 rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={formatDateInput(endTime)}
                                    onChange={(e) => handleDateChange("end", e.target.value)}
                                />
                                <input
                                    type="time"
                                    aria-label="End time"
                                    className="h-8 w-24 border-0 rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                    value={formatTime(endTime)}
                                    onChange={(e) => handleTimeChange("end", e.target.value)}
                                />
                            </div>
                        </div>

                    </div>
                </PopoverContent>
            </Popover>

            {/* Size Filter */}
            <Popover open={isSizeRangePopoverOpen} onOpenChange={setSizeRangePopoverOpen}>

                {/* PopOver Trigger */}
                <PopoverTrigger
                    aria-label="Select log size range"
                    aria-expanded={isSizeRangePopoverOpen}
                    className={`
                        bg-input/80 border-0 text-sm px-2.5 h-9 rounded-md cursor-pointer flex items-center
                        justify-center gap-1.5 shadow-xs hover:bg-input/90 transition-[color,box-shadow,background-color]
                        outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 font-sans
                        ${hasSizeFilter ? 'text-foreground' : 'text-muted-foreground'}
                    `}
                >
                    <span className="text-muted-foreground">Size</span>
                    <span className="font-medium tabular-nums">{sizeRangeLabel}</span>
                </PopoverTrigger>

                {/* PopOver Content */}
                <PopoverContent className="w-auto bg-popover border border-border shadow-lg px-3 py-3 font-sans">

                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3 inline-block font-sans">
                        Filter by Log Size
                    </label>

                    <div className="grid grid-cols-2 gap-3">

                        {/* Min Size */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1 font-sans">
                                Min
                            </label>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    aria-label="Minimum log size"
                                    placeholder="0"
                                    className="h-8 w-20 border-0 rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={minSizeValue}
                                    onChange={(e) => handleSizeChange("min", e.target.value, minSizeUnit)}
                                />
                                <select
                                    aria-label="Minimum log size unit"
                                    className="h-8 rounded-md border-0 bg-background px-1.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={minSizeUnit}
                                    onChange={(e) => handleSizeUnitChange("min", e.target.value as SizeUnit)}
                                >
                                    <option value="b">B</option>
                                    <option value="kb">KB</option>
                                    <option value="mb">MB</option>
                                </select>
                            </div>
                        </div>

                        {/* Max Size */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1 font-sans">
                                Max
                            </label>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    aria-label="Maximum log size"
                                    placeholder="Any"
                                    className="h-8 w-20 border-0 rounded-md px-2 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={maxSizeValue}
                                    onChange={(e) => handleSizeChange("max", e.target.value, maxSizeUnit)}
                                />
                                <select
                                    aria-label="Maximum log size unit"
                                    className="h-8 rounded-md border-0 bg-background px-1.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={maxSizeUnit}
                                    onChange={(e) => handleSizeUnitChange("max", e.target.value as SizeUnit)}
                                >
                                    <option value="b">B</option>
                                    <option value="kb">KB</option>
                                    <option value="mb">MB</option>
                                </select>
                            </div>
                        </div>

                    </div>

                    {hasSizeFilter && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClearSizeRange}
                            className="mt-3 w-full text-muted-foreground hover:text-foreground"
                        >
                            Clear size filter
                        </Button>
                    )}
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
                    className="w-48 max-w-48 bg-input/80 dark:bg-input/80 border-0 h-9 text-sm text-foreground placeholder:text-muted-foreground font-sans"
                    showClear={Boolean(selectedUser)}
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
            <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
                className="shrink-0 font-sans text-muted-foreground hover:text-foreground"
            >
                Clear All
            </Button>

            {/* Search/Filter Result Count */}
            <div
                aria-live="polite"
                className="text-sm text-muted-foreground ml-auto font-sans"
            > 
                Showing 
                <span className="font-medium tabular-nums text-foreground mx-1">{filteredLogCount.toLocaleString()}</span>
                from
                <span className="font-medium"> {logs.length.toLocaleString()} logs</span>
            </div>

        </div>
    );
}

export { LogFilterBar };
