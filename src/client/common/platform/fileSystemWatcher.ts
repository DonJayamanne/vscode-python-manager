// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { RelativePattern, workspace } from 'vscode';
import { traceError, traceVerbose } from '../../logging';
import { Disposables, IDisposable } from '../utils/resourceLifecycle';

/**
 * Enumeration of file change types.
 */
export enum FileChangeType {
    Changed = 'changed',
    Created = 'created',
    Deleted = 'deleted',
}

export function watchLocationForPattern(
    baseDir: string,
    pattern: string,
    callback: (type: FileChangeType, absPath: string) => void,
): IDisposable {
    const globPattern = new RelativePattern(baseDir, pattern);
    const disposables = new Disposables();
    traceVerbose(`Start watching: ${baseDir} with pattern ${pattern} using VSCode API`);
    try {
        const watcher = workspace.createFileSystemWatcher(globPattern);
        disposables.push(watcher.onDidCreate((e) => callback(FileChangeType.Created, e.fsPath)));
        disposables.push(watcher.onDidChange((e) => callback(FileChangeType.Changed, e.fsPath)));
        disposables.push(watcher.onDidDelete((e) => callback(FileChangeType.Deleted, e.fsPath)));
    } catch (ex) {
        traceError(`Failed to create File System watcher for patter ${pattern} in ${baseDir}`, ex);
    }
    return disposables;
}
