import { create } from "zustand";
import { 
    SortBy,
    SortDirection
} from "../types/ui";


// State
type TableUIState = {
    sortBy: SortBy;
    sortDirection: SortDirection;
    searchQuery: string;
}
type TableUIActions = {
    setSorting: (sortBy: SortBy, sortDirection: SortDirection) => void;
    setSearchQuery: (query: string) => void;
}
type TableUIStore = TableUIState & TableUIActions;


// Defaults
const DEFAULT_SORT_BY:SortBy = SortBy.TIMESTAMP;
const DEFAULT_SORT_DIRECTION:SortDirection = SortDirection.DESC;
const DEFAULT_SEARCH_QUERY:string = '';


export const useTableUIStore = create<TableUIStore>((set) => ({

    // Initial State
    sortBy: DEFAULT_SORT_BY,
    sortDirection: DEFAULT_SORT_DIRECTION,
    searchQuery: DEFAULT_SEARCH_QUERY,
    
    // Actions
    setSorting: (sortBy: SortBy, sortDirection: SortDirection) => set({ sortBy, sortDirection }),
    setSearchQuery: (query: string) => set({ searchQuery: query })

}));