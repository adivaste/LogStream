import { useState } from "react";
import { Search } from "lucide-react";
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
import { formatTime } from "@/lib/utils";
import { LOG_FILTER_START_TIME, LOG_FILTER_END_TIME } from "@/lib/constants";

const users = [
    { id: "Aditya Vaste", name: "Aditya Vaste"},
    { id: "John Doe", name: "John Doe"},
    { id: "Jane Smith", name: "Jane Smith"},
    { id: "Alex Johnson", name: "Alex Johnson"},
    { id: "Sarah Williams", name: "Sarah Williams"},
    { id: "Michael Brown", name: "Michael Brown"},
    { id: "Emily Davis", name: "Emily Davis"},
    { id: "Robert Wilson", name: "Robert Wilson"},
    { id: "Lisa Anderson", name: "Lisa Anderson"},
    { id: "James Taylor", name: "James Taylor"},
    { id: "Jennifer Martinez", name: "Jennifer Martinez"},
    { id: "David Thompson", name: "David Thompson"},
    { id: "Mary White", name: "Mary White"},
    { id: "Christopher Harris", name: "Christopher Harris"},
    { id: "Patricia Martin", name: "Patricia Martin"},
    { id: "Daniel Lee", name: "Daniel Lee"},
    { id: "Nancy Hall", name: "Nancy Hall"},
    { id: "Matthew Clark", name: "Matthew Clark"},
    { id: "Karen Rodriguez", name: "Karen Rodriguez"},
    { id: "Anthony Lewis", name: "Anthony Lewis"},
];

const totalLogs = 1200;
const filteredLogs = 295;
const defaultLogFiterStartTime = LOG_FILTER_START_TIME;
const defaultLogFiterEndTime = LOG_FILTER_END_TIME;

function LogFilterBar() {

    // Filter UI State
    const [user, setUser] = useState("");
    const [startTime, setStartTime] = useState(defaultLogFiterStartTime);
    const [endTime, setEndTime] = useState(defaultLogFiterEndTime);
    const [searchQuery, setSearchQuery] = useState("");


    // Event Handlers
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    }
    const handleUserChange = (value: string | null) => {
        if (value !== null) {
            setUser(value);
        }
    }
    const handleTimeChange = (type: "start" | "end", value: string) => {
        const [hours = 0, minutes = 0] = value.split(":").map(Number);
        if (type === "start") {
            const newStartTime = new Date(startTime);
            newStartTime.setHours(hours);
            newStartTime.setMinutes(minutes);
            setStartTime(newStartTime);
        } else {
            const newEndTime = new Date(endTime);
            newEndTime.setHours(hours);
            newEndTime.setMinutes(minutes);
            setEndTime(newEndTime);
        }
    }

    return (
        <div className="bg-background border-border border-b-0 flex items-center gap-2 px-4 py-2 z-10 sticky top-0">
            
            {/* Search Bar */}
            <div className='
                flex items-center gap-2 border border-input px-2 h-9 rounded-md w-full max-w-md bg-input/30 shadow-xs transition-[color,box-shadow]
                focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50'
            >
                <Search className='text-muted-foreground' size={16} />
                <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    placeholder="Search logs..."
                    onChange={handleSearch}
                    aria-label="Search logs"
                    className='flex-1 outline-none text-sm p-0 text-foreground placeholder:text-muted-foreground bg-transparent'
                />
            </div>

            
            {/* Time Picker */}
            <Popover>
                
                {/* PopOver Trigger */}
                <PopoverTrigger
                    aria-label="Select time range"
                    className="bg-input/30 border border-input text-sm px-2.5 h-9 rounded-md cursor-pointer flex items-center justify-center gap-1.5 text-foreground shadow-xs hover:bg-input/40 transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    <span className="text-muted-foreground">From</span>
                    <span className="tabular-nums font-medium">{formatTime(startTime)}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="tabular-nums font-medium">{formatTime(endTime)}</span>
                </PopoverTrigger>

                {/* PopOver Content */}
                <PopoverContent className="w-auto bg-popover border border-border shadow-lg px-4 py-3">
                    
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3 inline-block">
                        Select Time Range
                    </label>

                    <div className="flex items-center justify-center gap-4">
                        
                        {/* Start Time */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                                Start Time
                            </label>
                            <input
                                type="time"
                                aria-label="Start time"
                                className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                value={formatTime(startTime)}
                                onChange={(e) => handleTimeChange("start", e.target.value)}
                            />                            
                        </div>

                        {/* End Time */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                                End Time
                            </label>
                            <input
                                type="time"
                                aria-label="End time"
                                className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                value={formatTime(endTime)}
                                onChange={(e) => handleTimeChange("end", e.target.value)}
                            />
                        </div>

                    </div>
                </PopoverContent>
            </Popover>


            {/* User Select */}
            <Combobox
                value={user}
                items={users}
                onValueChange={handleUserChange}
                autoHighlight
            >
                <ComboboxInput 
                    placeholder="Select a user" 
                    className="bg-input/30 dark:bg-input/30 h-9 text-sm text-foreground placeholder:text-muted-foreground"
                    showClear
                />
                <ComboboxContent >
                    <ComboboxEmpty>No user found.</ComboboxEmpty>
                    <ComboboxList className="max-h-60 overflow-y-auto no-scrollbar">
                        {(item) => (
                            <ComboboxItem key={item.id} value={item.id}>
                                {item.name}
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>


            {/* Search/Filter Result Count */}
            <div
                aria-live="polite"
                className="text-sm text-muted-foreground ml-auto"
            > 
                Showing 
                <span className="font-medium text-foreground mx-1">{filteredLogs}</span>
                from
                <span className="font-medium"> {totalLogs} logs</span>
            </div>

        </div>
    );
}

export { LogFilterBar };
