import { ChevronDown, ListFilter, Plus, X } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    type AdvancedLogFilter,
    type FilterCondition,
    type FilterConjunction,
    type FilterOperator,
    type RelativeTimeUnit,
    FILTER_FIELDS,
    OPERATOR_LABELS,
    RELATIVE_TIME_UNITS,
    createFilterCondition,
    getActiveConditionCount,
    getEnumOptions,
    getFilterField,
    getOperatorsForField,
    isConditionComplete,
    operatorIsRelativeTime,
    operatorNeedsSecondValue,
    operatorNeedsValue,
    operatorUsesValueList
} from "@/lib/logFilterConditions";
import type { LogEntry } from "@/types/ui";

const INPUT_CLASS_NAME = `
    h-8 min-w-0 rounded-md border-0 bg-input/80 px-2 text-sm text-foreground shadow-xs outline-none
    transition-[color,box-shadow] placeholder:text-muted-foreground
    focus-visible:ring-[2px] focus-visible:ring-ring/50 dark:bg-input/80
    [appearance:textfield]
    [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
`;

type AdvancedFilterPopoverProps = {
    logs: LogEntry[];
    filter: AdvancedLogFilter;
    onChange: (_filter: AdvancedLogFilter) => void;
    onClear: () => void;
}

type ConditionRowProps = {
    condition: FilterCondition;
    logs: LogEntry[];
    onChange: (_condition: FilterCondition) => void;
    onRemove: () => void;
}

// `datetime-local` needs `YYYY-MM-DDTHH:mm`, but a stored value may be a full
// ISO string from a previous session - trim rather than hand the input
// something it silently rejects and renders blank.
const toDateTimeLocalValue = (value: string) => value.slice(0, 16);

type ValueListPickerProps = {
    selected: string[];
    options: string[];
    onChange: (_values: string[]) => void;
}

// A checkbox list rather than a multi-select: "Status is none of [Success,
// Unknown]" in one row is the whole point, and a plain select can't express
// it without one row per value.
function ValueListPicker({ selected, options, onChange }: ValueListPickerProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    // Selections stored from a previous session may no longer appear in the
    // loaded logs; surface them anyway so the filter is never silently
    // narrower than what the row claims.
    const visibleOptions = React.useMemo(() => {
        const missing = selected.filter(value => !options.includes(value));

        return [...options, ...missing];
    }, [options, selected]);

    const toggleValue = (value: string) => {
        onChange(selected.includes(value)
            ? selected.filter(entry => entry !== value)
            : [...selected, value]);
    };

    const summary = selected.length === 0
        ? 'Select values…'
        : selected.length === 1
            ? selected[0]
            : `${selected.length} selected`;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger
                aria-label="Filter values"
                aria-expanded={isOpen}
                title={selected.length > 0 ? selected.join(', ') : undefined}
                className="
                    flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-md
                    border-0 bg-input/80 px-2 text-sm text-foreground shadow-xs outline-none
                    transition-[color,box-shadow] focus-visible:ring-[2px] focus-visible:ring-ring/50
                    dark:bg-input/80
                "
            >
                <span className={`min-w-0 truncate ${selected.length === 0 ? 'text-muted-foreground' : ''}`}>
                    {summary}
                </span>
                <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 border border-border bg-popover p-1 font-sans">
                {visibleOptions.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No values in the loaded logs yet.
                    </p>
                ) : (
                    <div className="max-h-56 overflow-y-auto">
                        {visibleOptions.map(option => (
                            <label
                                key={option}
                                className="
                                    flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm
                                    text-foreground hover:bg-muted
                                "
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.includes(option)}
                                    onChange={() => toggleValue(option)}
                                    className="size-3.5 shrink-0 accent-emerald-500"
                                />
                                <span className="min-w-0 truncate">{option}</span>
                            </label>
                        ))}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

function ConditionRow({ condition, logs, onChange, onRemove }: ConditionRowProps) {
    const field = getFilterField(condition.field);
    const operators = getOperatorsForField(condition.field);
    const pickerOptions = React.useMemo(
        () => getEnumOptions(condition.field, logs),
        [condition.field, logs]
    );
    const usesValueList = operatorUsesValueList(condition.operator);
    const isRelativeTime = operatorIsRelativeTime(condition.operator);

    const handleFieldChange = (nextFieldId: string) => {
        const nextOperators = getOperatorsForField(nextFieldId);
        const nextOperator = nextOperators.includes(condition.operator)
            ? condition.operator
            : nextOperators[0] ?? 'contains';

        // Values are cleared on a field change: "> 2000" carried from Duration
        // onto Status would be nonsense, and silently keeping it invalid is
        // worse than making the user retype.
        onChange({
            ...condition,
            field: nextFieldId,
            operator: nextOperator,
            value: '',
            secondValue: '',
            values: []
        });
    };

    const showValue = operatorNeedsValue(condition.operator);
    const showSecondValue = operatorNeedsSecondValue(condition.operator);
    const isIncomplete = !isConditionComplete(condition);

    return (
        <div className="flex items-center gap-1.5">
            <Select value={condition.field} onValueChange={handleFieldChange}>
                <SelectTrigger aria-label="Filter field" className="w-[7.5rem] shrink-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {FILTER_FIELDS.map(option => (
                        <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={condition.operator}
                onValueChange={(nextOperator) => onChange({
                    ...condition,
                    operator: nextOperator as FilterOperator,
                    // Each operator owns a different value slot, so anything
                    // belonging to the previous one is dropped rather than left
                    // to reappear if the user switches back.
                    secondValue: operatorNeedsSecondValue(nextOperator as FilterOperator)
                        ? condition.secondValue
                        : '',
                    values: operatorUsesValueList(nextOperator as FilterOperator)
                        ? condition.values
                        : []
                })}
            >
                <SelectTrigger aria-label="Filter operator" className="w-[8.5rem] shrink-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {operators.map(operator => (
                        <SelectItem key={operator} value={operator}>{OPERATOR_LABELS[operator]}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {!showValue && (
                    <span className="text-xs text-muted-foreground">no value needed</span>
                )}

                {showValue && usesValueList && (
                    <ValueListPicker
                        selected={condition.values}
                        options={pickerOptions}
                        onChange={(values) => onChange({ ...condition, values })}
                    />
                )}

                {showValue && isRelativeTime && (
                    <>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            aria-label="Relative time amount"
                            placeholder="15"
                            value={condition.value}
                            onChange={(event) => onChange({ ...condition, value: event.target.value })}
                            className={`${INPUT_CLASS_NAME} w-16 shrink-0`}
                        />
                        <Select
                            value={condition.unit}
                            onValueChange={(unit) => onChange({ ...condition, unit: unit as RelativeTimeUnit })}
                        >
                            <SelectTrigger aria-label="Relative time unit" className="w-[6.5rem] shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RELATIVE_TIME_UNITS.map(unit => (
                                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </>
                )}

                {showValue && !usesValueList && field?.type === 'enum' && (
                    <Select
                        value={condition.value}
                        onValueChange={(value) => onChange({ ...condition, value })}
                    >
                        <SelectTrigger aria-label="Filter value" className="min-w-0 flex-1">
                            <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                            {pickerOptions.map(option => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                            {/* A value stored from a previous session may no longer
                                be present in the loaded logs; keep it selectable so
                                the filter doesn't silently retarget itself. */}
                            {condition.value !== '' && !pickerOptions.includes(condition.value) && (
                                <SelectItem value={condition.value}>{condition.value}</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                )}

                {showValue && !isRelativeTime && field?.type === 'date' && (
                    <>
                        <input
                            type="datetime-local"
                            aria-label="Filter value"
                            value={toDateTimeLocalValue(condition.value)}
                            onChange={(event) => onChange({ ...condition, value: event.target.value })}
                            className={`${INPUT_CLASS_NAME} min-w-0 flex-1`}
                        />
                        {showSecondValue && (
                            <input
                                type="datetime-local"
                                aria-label="Filter second value"
                                value={toDateTimeLocalValue(condition.secondValue)}
                                onChange={(event) => onChange({ ...condition, secondValue: event.target.value })}
                                className={`${INPUT_CLASS_NAME} min-w-0 flex-1`}
                            />
                        )}
                    </>
                )}

                {showValue && !usesValueList && field?.type === 'number' && (
                    <>
                        <input
                            type="number"
                            inputMode="decimal"
                            aria-label="Filter value"
                            placeholder="0"
                            value={condition.value}
                            onChange={(event) => onChange({ ...condition, value: event.target.value })}
                            className={`${INPUT_CLASS_NAME} min-w-0 flex-1`}
                        />
                        {showSecondValue && (
                            <>
                                <span className="shrink-0 text-xs text-muted-foreground">and</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    aria-label="Filter second value"
                                    placeholder="0"
                                    value={condition.secondValue}
                                    onChange={(event) => onChange({ ...condition, secondValue: event.target.value })}
                                    className={`${INPUT_CLASS_NAME} min-w-0 flex-1`}
                                />
                            </>
                        )}
                        {field.unit && (
                            <span className="shrink-0 text-xs text-muted-foreground">{field.unit}</span>
                        )}
                    </>
                )}

                {showValue && !usesValueList && field?.type === 'text' && (
                    <input
                        type="text"
                        aria-label="Filter value"
                        placeholder="Value"
                        value={condition.value}
                        onChange={(event) => onChange({ ...condition, value: event.target.value })}
                        className={`${INPUT_CLASS_NAME} min-w-0 flex-1`}
                    />
                )}
            </div>

            {/* Says why a row isn't affecting results, rather than leaving the
                user to wonder why the list didn't change. */}
            <span
                aria-hidden={!isIncomplete}
                title={isIncomplete ? 'Incomplete - this condition is not being applied' : undefined}
                className={`size-1.5 shrink-0 rounded-full bg-amber-500 ${isIncomplete ? '' : 'invisible'}`}
            />

            <button
                type="button"
                aria-label="Remove condition"
                onClick={onRemove}
                className="
                    flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md
                    text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive
                    focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive
                "
            >
                <X size={14} />
            </button>
        </div>
    );
}

function AdvancedFilterPopover({ logs, filter, onChange, onClear }: AdvancedFilterPopoverProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const activeCount = getActiveConditionCount(filter);

    const updateCondition = (nextCondition: FilterCondition) => {
        onChange({
            ...filter,
            conditions: filter.conditions.map(existing => (
                existing.id === nextCondition.id ? nextCondition : existing
            ))
        });
    };

    const removeCondition = (conditionId: string) => {
        onChange({
            ...filter,
            conditions: filter.conditions.filter(existing => existing.id !== conditionId)
        });
    };

    const addCondition = () => {
        onChange({
            ...filter,
            conditions: [...filter.conditions, createFilterCondition()]
        });
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger
                title="Advanced filter"
                aria-label={activeCount > 0
                    ? `Advanced filter, ${activeCount} condition${activeCount === 1 ? '' : 's'} active`
                    : 'Advanced filter'}
                aria-expanded={isOpen}
                className={`
                    relative flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border-0
                    px-2.5 shadow-xs outline-none transition-[color,box-shadow,background-color]
                    focus-visible:ring-[3px] focus-visible:ring-ring/50 font-sans
                    ${activeCount > 0
            ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-input/80 text-foreground hover:bg-input/90'}
                `}
            >
                <ListFilter size={16} />
                {/* The filter survives a reload, so it needs to advertise
                    itself - otherwise you come back tomorrow to a short list
                    and blame the extension rather than the filter. */}
                {activeCount > 0 && (
                    <span className="ml-1.5 text-xs font-medium tabular-nums">{activeCount}</span>
                )}
            </PopoverTrigger>

            <PopoverContent
                align="start"
                className="w-[36rem] max-w-[calc(100vw-2rem)] border border-border bg-popover px-3 py-3 font-sans shadow-lg"
            >
                <div className="mb-3 flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Match
                        <Select
                            value={filter.conjunction}
                            onValueChange={(conjunction) => onChange({
                                ...filter,
                                conjunction: conjunction as FilterConjunction
                            })}
                        >
                            <SelectTrigger
                                aria-label="Match all or any condition"
                                className="h-7 w-[4.5rem] normal-case tracking-normal"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="and">all</SelectItem>
                                <SelectItem value="or">any</SelectItem>
                            </SelectContent>
                        </Select>
                        of these
                    </label>

                    {filter.conditions.length > 0 && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="
                                cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground
                                transition-colors hover:bg-muted hover:text-primary
                                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50
                            "
                        >
                            Clear all
                        </button>
                    )}
                </div>

                {filter.conditions.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        No conditions yet. Add one to filter on any log field — for example, Status is not Success.
                    </p>
                ) : (
                    <div className="flex max-h-[16rem] flex-col gap-2 overflow-y-auto pr-1">
                        {filter.conditions.map(condition => (
                            <ConditionRow
                                key={condition.id}
                                condition={condition}
                                logs={logs}
                                onChange={updateCondition}
                                onRemove={() => removeCondition(condition.id)}
                            />
                        ))}
                    </div>
                )}

                <Button
                    variant="ghost"
                    onClick={addCondition}
                    className="mt-3 h-8 w-full justify-center gap-1.5 text-xs"
                >
                    <Plus size={14} />
                    Add condition
                </Button>
            </PopoverContent>
        </Popover>
    );
}

export { AdvancedFilterPopover };
