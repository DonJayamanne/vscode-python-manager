// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

declare interface String {
    /**
     * Appropriately formats a string so it can be used as an argument for a command in a shell.
     * E.g. if an argument contains a space, then it will be enclosed within double quotes.
     */
    toCommandArgumentForPythonMgrExt(): string;
    /**
     * Appropriately formats a a file path so it can be used as an argument for a command in a shell.
     * E.g. if an argument contains a space, then it will be enclosed within double quotes.
     */
    fileToCommandArgumentForPythonMgrExt(): string;
    /**
     * String.format() implementation.
     * Tokens such as {0}, {1} will be replaced with corresponding positional arguments.
     */
    format(...args: string[]): string;

    /**
     * String.trimQuotes implementation
     * Removes leading and trailing quotes from a string
     */
    trimQuotes(): string;
}

/**
 * Appropriately formats a string so it can be used as an argument for a command in a shell.
 * E.g. if an argument contains a space, then it will be enclosed within double quotes.
 * @param {String} value.
 */
String.prototype.toCommandArgumentForPythonMgrExt = function (this: string): string {
    if (!this) {
        return this;
    }
    return (this.indexOf(' ') >= 0 || this.indexOf('&') >= 0 || this.indexOf('(') >= 0 || this.indexOf(')') >= 0) &&
        !this.startsWith('"') &&
        !this.endsWith('"')
        ? `"${this}"`
        : this.toString();
};

/**
 * Appropriately formats a a file path so it can be used as an argument for a command in a shell.
 * E.g. if an argument contains a space, then it will be enclosed within double quotes.
 */
String.prototype.fileToCommandArgumentForPythonMgrExt = function (this: string): string {
    if (!this) {
        return this;
    }
    return this.toCommandArgumentForPythonMgrExt().replace(/\\/g, '/');
};

/**
 * String.trimQuotes implementation
 * Removes leading and trailing quotes from a string
 */
export function trimQuotes(value: string): string {
    if (!value) {
        return value;
    }
    return value.replace(/(^['"])|(['"]$)/g, '');
};

declare interface Promise<T> {
    /**
     * Catches task error and ignores them.
     */
    ignoreErrors(): Promise<void>;
}

/**
 * Explicitly tells that promise should be run asynchonously.
 */
Promise.prototype.ignoreErrors = function <T>(this: Promise<T>) {
    // @ts-ignore
    return this.catch(() => { });
};

export function format(value: string) {
    const args = arguments;
    return value.replace(/{(\d+)}/g, (match, number) => (args[number] === undefined ? match : args[number]));
};
