import { ListFilter, Plus, X } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    type AdvancedLogFilter,
    type FilterCondition,
    type FilterConjunction,
    type FilterOperator,
    FILTER_FIELDS,
    OPERATOR_LABELS,
    createFilterCondition,
    getActiveConditionCount,
    getEnumOptions,
    getFilterField,
    getOperatorsForField,
    isConditionComplete,
    operatorNeedsSecondValue,
    operatorNeedsValue
} from "@/lib/logFilterConditions";
import type { LogEntry } from "@/types/ui";

const SELECT_CLASS_NAME = `
    h-8 min-w-0 rounded-md border-0 bg-input/80 px-1.5 text-sm text-foreground shadow-xs outline-none
    transition-[color,box-shadow] focus-visible:ring-[2px] focus-visible:ring-ring/50
    dark:bg-input/80
`;

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

function ConditionRow({ condition, logs, onChange, onRemove }: ConditionRowProps) {
    const field = getFilterField(condition.field);
    const operators = getOperatorsForField(condition.field);
    const enumOptions = React.useMemo(
        () => getEnumOptions(condition.field, logs),
        [condition.field, logs]
    );

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
            secondValue: ''
        });
    };

    const showValue = operatorNeedsValue(condition.operator);
    const showSecondValue = operatorNeedsSecondValue(condition.operator);
    const isIncomplete = !isConditionComplete(condition);

    return (
        <div className="flex items-center gap-1.5">
            <select
                aria-label="Filter field"
                value={condition.field}
                onChange={(event) => handleFieldChange(event.target.value)}
                className={`${SELECT_CLASS_NAME} w-[7.5rem] shrink-0`}
            >
                {FILTER_FIELDS.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                ))}
            </select>

            <select
                aria-label="Filter operator"
                value={condition.operator}
                onChange={(event) => onChange({
                    ...condition,
                    operator: event.target.value as FilterOperator,
                    // Dropping the second value when leaving `between` keeps a
                    // stale bound from reappearing if the user switches back.
                    secondValue: operatorNeedsSecondValue(event.target.value as FilterOperator)
                        ? condition.secondValue
                        : ''
                })}
                className={`${SELECT_CLASS_NAME} w-[8.5rem] shrink-0`}
            >
                {operators.map(operator => (
                    <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>
                ))}
            </select>

            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {!showValue && (
                    <span className="text-xs text-muted-foreground">no value needed</span>
                )}

                {showValue && field?.type === 'enum' && (
                    <select
                        aria-label="Filter value"
                        value={condition.value}
                        onChange={(event) => onChange({ ...condition, value: event.target.value })}
                        className={`${SELECT_CLASS_NAME} min-w-0 flex-1`}
                    >
                        <option value="">Select…</option>
                        {enumOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                        {/* A value stored from a previous session may no longer
                            be present in the loaded logs; keep it selectable so
                            the filter doesn't silently retarget itself. */}
                        {condition.value !== '' && !enumOptions.includes(condition.value) && (
                            <option value={condition.value}>{condition.value}</option>
                        )}
                    </select>
                )}

                {showValue && field?.type === 'date' && (
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

                {showValue && field?.type === 'number' && (
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

                {showValue && field?.type === 'text' && (
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
                        <select
                            aria-label="Match all or any condition"
                            value={filter.conjunction}
                            onChange={(event) => onChange({
                                ...filter,
                                conjunction: event.target.value as FilterConjunction
                            })}
                            className={`${SELECT_CLASS_NAME} h-7 w-[4.5rem] normal-case tracking-normal`}
                        >
                            <option value="and">all</option>
                            <option value="or">any</option>
                        </select>
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
