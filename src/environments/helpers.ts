import type { Environment, ResolvedEnvironment } from '@vscode/python-extension';
import { CancellationToken, Progress, workspace } from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import type { TemporaryFile } from '../client/common/platform/types';
import { getEnvironmentType } from './utils';
import { IDisposable } from '../client/common/types';
import { disposeAll } from '../client/common/utils/resourceLifecycle';
import { loggingOutputChannel } from './constants';
import { traceVerbose } from '../client/logging';
import { execObservable } from '../client/common/process/rawProcessApis';

const untildify = require('untildify');

export const home = untildify('~');

export function getDisplayPath(value?: string) {
    if (!value) {
        return '';
    }
    value = workspace.asRelativePath(value, (workspace.workspaceFolders || []).length > 1);
    return value.startsWith(home) ? `~${path.sep}${path.relative(home, value)}` : value;
}

export function createTempFile(extension = '.txt') {
    return new Promise<TemporaryFile>((resolve, reject) => {
        tmp.file({ postfix: extension }, (err, filename, _fd, cleanUp) => {
            if (err) {
                return reject(err);
            }
            resolve({
                filePath: filename,
                dispose: cleanUp,
            });
        });
    });
}

export function getEnvLoggingInfo(env: Environment | ResolvedEnvironment) {
    return `${getEnvironmentType(env)}:(${env.environment?.name || env.path},${getDisplayPath(env.path)})`;
}
export function getEnvDisplayInfo(env: Environment | ResolvedEnvironment) {
    return env.environment?.name || env.environment?.folderUri
        ? getDisplayPath(env.environment.folderUri.fsPath)
        : getDisplayPath(env.path);
}

export async function reportStdOutProgress(
    title: string,
    argsForExecution: Parameters<typeof execObservable>,
    progress: Progress<{
        message?: string;
        increment?: number;
    }>,
    token: CancellationToken,
) {
    traceVerbose(title);
    loggingOutputChannel.appendLine('>>>>>>>>>>>>>>>>>>>>>>>');
    loggingOutputChannel.appendLine(title);
    loggingOutputChannel.appendLine('');
    const result = await execObservable(...argsForExecution);
    const disposables: IDisposable[] = [];
    token.onCancellationRequested(() => result.proc?.kill(), undefined, disposables);
    const ticker = ['.', '..', '...'];
    let counter = 0;
    await new Promise<void>((resolve) => {
        const subscription = result.out.subscribe({
            next: (output) => {
                const suffix = ticker[counter % 3];
                const trimmedOutput = output.out.trim();
                counter += 1;
                // Borrowed magic number from Jupyter Extension.
                const message =
                    trimmedOutput.length > 28 ? `${trimmedOutput.substring(0, 28)}${suffix}` : trimmedOutput;
                progress.report({ message });
            },
            complete: () => resolve(),
        });
        disposables.push({
            dispose: () => {
                try {
                    subscription.unsubscribe();
                    loggingOutputChannel.appendLine('<<<<<<<<<<<<<<<<<<<<<<<');
                    loggingOutputChannel.appendLine('');
                } catch {
                    //
                }
            },
        });
    }).finally(() => disposeAll(disposables));
}
