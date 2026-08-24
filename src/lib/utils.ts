import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// Guards every bare-key shortcut in the app: a key that means "navigate"
// somewhere else has to mean "type a character" inside a field, or shortcuts
// start eating text input.
export function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const tagName = target.tagName.toLowerCase();

    return (
        target.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select'
    );
}

export function formatTime(date: Date) {
    return date.toTimeString().slice(0, 5);
}

export function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function formatCompactDate(date: Date) {
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short'
    });
}
