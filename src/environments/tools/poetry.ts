// Copyright (c) Don Jayamanne.
// Licensed under the MIT License.

import * as fs from 'fs-extra';
import { CancellationToken, CancellationTokenSource, Progress, QuickPickItem, WorkspaceFolder, window, workspace } from 'vscode';
import { Environment, ResolvedEnvironment } from '@vscode/python-extension';
import { getEnvironmentType } from '../utils';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { Poetry } from '../../client/pythonEnvironments/common/environmentManagers/poetry';
import { traceError, traceVerbose } from '../../client/logging';
import { getDisplayPath, getEnvDisplayInfo, getEnvLoggingInfo } from '../helpers';
import { execObservable, shellExec } from '../../client/common/process/rawProcessApis';
import { noop } from '../../client/common/utils/misc';

const folderMappings = new Map<string, string[]>();

export async function getPoetryVersion(): Promise<string | undefined | void> {
    const cwd = !workspace.workspaceFolders || workspace.workspaceFolders.length <= 1 ? __dirname : workspace.workspaceFolders[0].uri.fsPath;
    return Poetry.getVersion(cwd).catch(noop);
}

export async function getPoetryEnvironments(workspaceFolder: WorkspaceFolder, envs: readonly Environment[]): Promise<Environment[]> {
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length <= 1) {
        const poetryEnvs = envs.filter(e => getEnvironmentType(e) === EnvironmentType.Poetry);
        folderMappings.set(workspaceFolder.uri.fsPath, poetryEnvs.map(e => e.path));
        return poetryEnvs;
    }
    const poetry = await Poetry.getPoetry(workspaceFolder.uri.fsPath);
    if (!poetry) {
        return [];
    }
    const envPaths = await poetry.getEnvList();
    if (!envPaths || !Array.isArray(envPaths)) {
        return [];
    }
    folderMappings.set(workspaceFolder.uri.fsPath, envPaths);
    return envs.filter(e => envPaths.includes(e.path)).filter(e => getEnvironmentType(e) === EnvironmentType.Poetry);
}

export function hasPoetryEnvs(envs: Environment[] | readonly Environment[]) {
    return envs.some(e => getEnvironmentType(e) === EnvironmentType.Poetry);
}
function getMatchingWorkspaceFolder(env: Environment) {
    if (getEnvironmentType(env) !== EnvironmentType.Poetry) {
        traceError(`Cannot delete as its not a Poetry environment ${getEnvLoggingInfo(env)}`);
        return;
    }
    let workspaceFolderPath: string | undefined;
    folderMappings.forEach((envPaths, folder) => {
        if (envPaths.some(e => env.path.includes(e))) {
            workspaceFolderPath = folder;
        }
    });
    if (!workspaceFolderPath) {
        traceError(`Cannot delete as its not a belong to any workspace folder we know of ${getEnvLoggingInfo(env)}`);
    }
    return workspace.workspaceFolders?.find(w => w.uri.fsPath === workspaceFolderPath);
}
async function getPoetry(env: Environment) {
    const workspaceFolder = getMatchingWorkspaceFolder(env);
    if (!workspaceFolder) {
        return { workspaceFolder: undefined, poetry: undefined };
    }
    const poetry = await Poetry.getPoetry(workspaceFolder.uri.fsPath);
    return { workspaceFolder, poetry };
}
export async function deleteEnv(env: Environment | ResolvedEnvironment, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>) {
    const { poetry, workspaceFolder } = await getPoetry(env);
    if (!poetry) {
        return [];
    }
    const args = [env.path.fileToCommandArgumentForPythonExt()];
    const message = `Deleting Poetry environment ${getEnvLoggingInfo(env)} with command ${[poetry.command, 'env', env.path].concat(args).join(' ')}`;
    traceVerbose(message);
    progress.report({ message });
    const result = await execObservable(poetry.command, ['env', 'remove'].concat(args), { timeout: 60_000, cwd: workspaceFolder!.uri.fsPath });
    await new Promise<void>(resolve => {
        result.out.subscribe({
            next: output => progress.report({ message: output.out }),
            complete: () => resolve()
        });
    });
    // // Check if it was deleted successfully.
    if (await fs.pathExists(env.path)) {
        throw new Error(`Failed to delete Poetry environment ${getEnvDisplayInfo(env)}, folder still exists ${getDisplayPath(env.path)} `);
    }
}
export async function updatePoetryPackages(env: Environment | ResolvedEnvironment) {
    const { poetry, workspaceFolder } = await getPoetry(env);
    if (!poetry) {
        return [];
    }
    const message = `Updating Poetry environment ${getEnvLoggingInfo(env)} with command ${[poetry.command, 'update']}`;
    traceVerbose(message);
    const result = await execObservable(poetry.command, ['update'], { timeout: 60_000, cwd: workspaceFolder!.uri.fsPath });
    await new Promise<void>(resolve => {
        result.out.subscribe({
            // next: output => progress.report({ message: output.out }),
            complete: () => resolve()
        });
    });

}
export async function uninstallPoetryPackage(env: Environment | ResolvedEnvironment, packageName: string) {
    const { poetry, workspaceFolder } = await getPoetry(env);
    if (!poetry) {
        return;
    }
    const message = `Removing Poetry package from ${getEnvLoggingInfo(env)} with command ${[poetry.command, 'remove', packageName]}]}`;
    traceVerbose(message);
    const result = await execObservable(poetry.command, ['remove', packageName], { timeout: 60_000, cwd: workspaceFolder!.uri.fsPath });
    await new Promise<void>(resolve => {
        result.out.subscribe({
            // next: output => progress.report({ message: output.out }),
            complete: () => resolve()
        });
    });

}
export async function installPoetryPackage(env: Environment | ResolvedEnvironment, packageName: string) {
    const { poetry, workspaceFolder } = await getPoetry(env);
    if (!poetry) {
        return;
    }
    const message = `Installing Poetry package from ${getEnvLoggingInfo(env)} with command ${[poetry.command, 'add', packageName]}]}`;
    traceVerbose(message);
    const result = await execObservable(poetry.command, ['add', packageName], { timeout: 60_000, cwd: workspaceFolder!.uri.fsPath });
    await new Promise<void>(resolve => {
        result.out.subscribe({
            // next: output => progress.report({ message: output.out }),
            complete: () => resolve()
        });
    });

}
export async function exportPoetryPackages(env: Environment | ResolvedEnvironment) {
    const { poetry, workspaceFolder } = await getPoetry(env);
    if (!poetry) {
        return;
    }
    const message = `Exporting Poetry package from ${getEnvLoggingInfo(env)} with command ${[poetry.command, 'export', '-f', 'requirements.txt']}]}`;
    traceVerbose(message);
    const result = await shellExec(`${poetry.command.fileToCommandArgumentForPythonExt()} export -f requirements.txt`, { timeout: 60_000, cwd: workspaceFolder!.uri.fsPath, throwOnStdErr: true }).catch(ex => traceError(`Failed to export packages from ${getEnvLoggingInfo(env)}`, ex));
    return { contents: result?.stdout, language: 'pip-requirements', file: 'requirements.txt' };
}

async function searchPackage(value: string, env: Environment, token: CancellationToken): Promise<QuickPickItem[]> {
    const { poetry, workspaceFolder } = await getPoetry(env);
    if (!poetry) {
        return [];
    }
    const message = `Searching for Poetry packages from ${getEnvLoggingInfo(env)} with command ${[poetry.command, 'search', value, '-n', '--no-ansi']}]}`;
    traceVerbose(message);
    const result = await shellExec(`${poetry.command.fileToCommandArgumentForPythonExt()} search ${value}`, { timeout: 60_000, cwd: workspaceFolder!.uri.fsPath, throwOnStdErr: true }).catch(noop);
    if (!result) {
        return [];
    }
    const items: QuickPickItem[] = []
    let label = '';
    let description = '';
    let detail = '';
    result.stdout.split(/\r?\n/g).forEach(line => {
        if (!label && !line.trim().length) {
            return;
        }
        if (!label && line.trim().startsWith(line.charAt(0))) {
            label = line.trim();
            if (label.includes('(') && label.endsWith(')')) {
                description = label.substring(label.lastIndexOf('(') + 1, label.lastIndexOf(')'));
                label = label.substring(0, label.lastIndexOf('(')).trim();
            }
            detail = '';
            return;
        }
        if (label) {
            detail = line.trim();
            items.push({ label, detail, description })
            label = '';
            detail = '';
        }
    });


    if (token.isCancellationRequested) {
        return [];
    }
    return items;
}

export async function searchPoetryPackage(env: Environment) {
    const { poetry } = await getPoetry(env);
    if (!poetry) {
        return;
    }
    const quickPick = window.createQuickPick();
    quickPick.placeholder = 'Enter package name to search';
    quickPick.canSelectMany = false;
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDetail = true;
    quickPick.show();
    let progressCounter = 0;
    const searchAndUpdate = async (value: string, token: CancellationToken) => {
        quickPick.busy = true;
        progressCounter += 1;
        const packages = await searchPackage(value, env, token);
        progressCounter -= 1;
        if (!progressCounter) {
            quickPick.busy = false;
        }
        if (token.isCancellationRequested) {
            return;
        }
        quickPick.items = packages;
    }
    let token: CancellationTokenSource | undefined;
    quickPick.onDidChangeValue(async value => {
        if (token) {
            token.cancel();
            token.dispose();
        }
        token = new CancellationTokenSource();
        searchAndUpdate(value, token.token)
    });
    return new Promise<string | undefined>(resolve => {
        quickPick.onDidHide(() => {
            if (token) {
                token.cancel();
                token.dispose();
            }
            resolve(undefined);
        })
        quickPick.onDidAccept(async () => {
            if (!quickPick.selectedItems.length) {
                return;
            }
            resolve(quickPick.selectedItems[0].label);
        });
    });
}
