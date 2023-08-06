import { ProgressLocation, window } from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { traceError } from '../../client/logging';
import { getPyenvDir } from '../../client/pythonEnvironments/common/environmentManagers/pyenv';
import { IServiceContainer } from '../../client/ioc/types';
import { getTerminalEnvVariables } from '../terminal';
import { createDeferred } from '../../client/common/utils/async';
import { registerCreateEnvironmentProvider } from '../../client/pythonEnvironments/creation/createEnvApi';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { CreateEnvironmentResult } from '../../client/pythonEnvironments/creation/proposed.createEnvApis';


const pyEnvEnvVars = createDeferred<NodeJS.ProcessEnv>();
pyEnvEnvVars.promise.then(() => {
    registerCreateEnvironmentProvider({
        createEnvironment: async () =>
            // eslint-disable-next-line no-async-promise-executor
            new Promise<CreateEnvironmentResult | undefined>(async (resolve) => {
                const input = window.createQuickPick();
                input.title = 'Select Python Version to Install';
                input.busy = true;
                input.ignoreFocusOut = false;
                input.matchOnDescription = true;;
                input.matchOnDetail = true;;
                input.onDidHide(() => { resolve({ action: 'Cancel', error: undefined, path: undefined, workspaceFolder: undefined }); input.hide(); })
                input.show();
                input.onDidAccept(async () => {
                    const version = input.selectedItems[0].label;
                    input.enabled = false;
                    input.busy = true;
                    installPython(version).finally(() => { input.hide(); resolve({ action: 'Cancel', error: undefined, path: undefined, workspaceFolder: undefined }) });

                })
                const [installedVersions, allVersions] = await Promise.all([getInstalledPythonVersions(), getPythonVersions()]);
                input.busy = false;
                input.items = allVersions.filter(v => !installedVersions.includes(v)).map(v => ({ label: v }));
            })
        ,
        description: "PyEnv",
        id: 'pyenv',
        name: 'PyEnv',
        tools: [EnvironmentType.Pyenv]
    })
})
export async function getPyEnvVersion(iocContainer: IServiceContainer) {
    const dir = getPyenvDir();
    const changelogFile = path.join(dir, 'CHANGELOG.md');
    try {
        if (await fs.pathExists(changelogFile)) {
            const textFile = await fs.readFile(changelogFile, 'utf-8');
            const versionStart = textFile.indexOf('## Release ');
            if (versionStart === -1) {
                traceError(
                    `Failed to identify pyenv version from ${changelogFile}, with text ${textFile.substring(0, 100)} `,
                );
                return;
            }

            const start = versionStart + '## Release '.length;
            const verionLines = textFile
                .substring(start, start + 20)
                .splitLines()
                .map((line) => line.trim())
                .filter((line) => line.length);

            return verionLines.length === 0 ? '' : verionLines[0];
        }

        return Promise.race([
            getPyEnvVersionFromSpawn(process.env),
            new Promise<string>((resolve) =>
                getTerminalEnvVariables(iocContainer).then(env => env ? getPyEnvVersionFromSpawn(env).then(resolve) : undefined))
        ]).catch(() => '');

    } catch (ex) {
        traceError('Failed to get pyenv version', ex);
    }
}

async function getPythonVersions() {
    return pyEnvEnvVars.promise.then(env => new Promise<string[]>(resolve => {
        const proc = spawn('pyenv', ['install', '-l'], { env });
        let output = '';
        proc.stdout.on('data', data => {
            output += data.toString();
        })
        proc.on('close', () => {
            const versions: string[] = output.trim().split(/\r?\n/g);
            resolve(versions.map(v => v.trim()).filter(v => v.length && v.trim() !== 'Available versions:'));
        });
    }));
}
async function getInstalledPythonVersions() {
    return pyEnvEnvVars.promise.then(env => new Promise<string[]>(resolve => {
        const proc = spawn('pyenv', ['version', '--bare'], { env });
        let output = '';
        proc.stdout.on('data', data => {
            output += data.toString();
        })
        proc.on('close', () => {
            const versions: string[] = output.trim().split(/\r?\n/g);
            resolve(versions.map(v => v.trim()).filter(v => v.length))
        });
    }));
}
async function installPython(version: string) {
    return window.withProgress({ location: ProgressLocation.Notification, cancellable: true, title: `Installing Python ${version}` }, (progress, token) =>
        pyEnvEnvVars.promise.then(env => new Promise<void>((resolve, reject) => {
            const proc = spawn('pyenv', ['install', version], { env });
            let stdErr = '';
            let failureError: Error | undefined;
            const ticker = ['.', '..', '...'];
            let counter = 0;
            const reportProgress = (data: string) => {
                if (token.isCancellationRequested) {
                    return;
                }
                const suffix = ticker[counter % 3];
                const trimmedOutput = data.toString().trim();
                counter += 1;
                const message =
                    trimmedOutput.length > 28 ? `${trimmedOutput.substring(0, 28)}${suffix}` : trimmedOutput;
                progress.report({ message });
            }
            proc.stdout.on('data', data => {
                stdErr += data.toString();
                reportProgress(data.toString());
            })
            proc.stderr.on('data', data => {
                stdErr += data.toString();
                reportProgress(data.toString());
            })
            proc.on('error', err => {
                console.error(`Failed to install Python ${version} via PyEnv`, err);
                failureError = err;
                stdErr += err.toString();
            });
            proc.on('close', (code) => {
                if (code) {
                    window.showErrorMessage(`Failed to install Python ${version}, via PyEnv`);
                    reject(failureError || new Error(stdErr));
                } else {
                    resolve();
                }
            });
            token.onCancellationRequested(() => proc.kill());
        }))
    );
}
async function getPyEnvVersionFromSpawn(env: NodeJS.ProcessEnv) {
    return new Promise<string>(resolve => {
        const proc = spawn('pyenv', ['--version'], { env });
        let output = '';
        proc.stdout.on('data', data => {
            output += data.toString();
        })
        proc.on('close', () => {
            const version: string = output.toString().trim().replace('pyenv', '').trim();
            if (version) {
                pyEnvEnvVars.resolve(env);
                resolve(version)
            }
        });
    });
}

