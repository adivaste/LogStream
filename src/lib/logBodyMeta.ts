const ERROR_LINE_PATTERN = /\|(FATAL_ERROR|EXCEPTION_THROWN)\|/;

export const countLogBodyLines = (body: string) => {
    if (!body) {
        return 0;
    }

    let lineCount = 1;

    for (let index = 0; index < body.length; index += 1) {
        if (body.charCodeAt(index) === 10) {
            lineCount += 1;
        }
    }

    return lineCount;
}

export const getErrorLineNumbers = (body: string) => {
    const errorLineNumbers: number[] = [];
    const lines = body.split(/\r?\n/);

    lines.forEach((line, index) => {
        if (ERROR_LINE_PATTERN.test(line)) {
            errorLineNumbers.push(index + 1);
        }
    });

    return errorLineNumbers;
}

export const formatByteSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }

    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)}KB`;
    }

    return `${bytes}B`;
}
