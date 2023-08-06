import { Environment, PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import * as fs from 'fs-extra';
import * as path from 'path';
import { EOL } from 'os';
import { CancellationToken, Progress, ProgressLocation, window } from 'vscode';
import { ApplicationShell } from '../../client/common/application/applicationShell';
import { execObservable } from '../../client/common/process/rawProcessApis';
import { InputStep, MultiStepInput } from '../../client/common/utils/multiStepInput';
import { getUserHomeDir } from '../../client/common/utils/platform';
import { traceError, traceInfo, traceVerbose } from '../../client/logging';
import { Conda } from '../../client/pythonEnvironments/common/environmentManagers/conda';
import { exec } from '../../client/pythonEnvironments/common/externalDependencies';
import { getDisplayPath, getEnvDisplayInfo, getEnvLoggingInfo, home } from '../helpers';
import { MICROMAMBA_ROOTPREFIX } from '../micromamba/constants';
import { isCondaEnvironment } from '../utils';

export type CondaPackageInfo = {
    // eslint-disable-next-line camelcase
    base_url?: string;
    // eslint-disable-next-line camelcase
    build_number?: number;
    // eslint-disable-next-line camelcase
    build_string?: string;
    channel?: string;
    // eslint-disable-next-line camelcase
    dist_name?: string;
    name: string;
    platform?: string;
    version: string;
};

type OutdatedPackageInfo = {
    actions: {
        FETCH: { version: string; name: string; }[],
        LINK: { version: string; name: string; }[],
        UNLINK: { version: string; name: string; }[],
    }
}

export async function getCondaPackages(env: Environment) {
    if (!isCondaEnvironment(env) || !env.executable.uri) {
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }
    const args = ['list'].concat(env.environment?.name ? ['-n', env.environment.name] : ['-p', env.environment?.folderUri?.fsPath || path.dirname(env.path)]);
    const result = await exec(conda.command, args.concat(['--json']), { timeout: 60_000 });
    const stdout = result.stdout.trim();
    traceVerbose(`conda info --json: ${result.stdout}`);
    const packages = stdout ? (JSON.parse(result.stdout) as CondaPackageInfo[]) : [];
    return packages;
}
export async function getOutdatedCondaPackages(env: Environment): Promise<Map<string, string> | undefined> {
    if (!isCondaEnvironment(env) || !env.executable.uri) {
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }

    const args = ['update', '--all', '-d'].concat(env.environment?.name ? ['-n', env.environment.name] : ['-p', env.environment?.folderUri?.fsPath || path.dirname(env.path)]);
    const result = await exec(conda.command, args.concat(['--json']), { timeout: 60_000 });
    const stdout = result.stdout.trim();
    traceVerbose(`conda ${args.join(' ')} --json: ${result.stdout}`);
    if (!stdout) {
        return;
    }
    const map = new Map<string, string>();
    const unlink = new Set<string>();
    const { actions } = (JSON.parse(result.stdout) as OutdatedPackageInfo);
    actions.UNLINK.forEach(pkg => unlink.add(pkg.name));
    actions.LINK.forEach(pkg => {
        if (unlink.has(pkg.name)) {
            map.set(pkg.name, pkg.version);
        }
    });

    return map;
}
export async function updateCondaPackages(env: Environment) {
    if (!isCondaEnvironment(env) || !env.executable.uri) {
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }

    const args = ['update', '--all'].concat(env.environment?.name ? ['-n', env.environment.name] : ['-p', env.environment?.folderUri?.fsPath || path.dirname(env.path)]);
    await exec(conda.command, args, { timeout: 60_000 });
}
export async function uninstallCondaPackage(env: Environment, pkg: CondaPackageInfo) {
    if (!isCondaEnvironment(env) || !env.executable.uri) {
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }

    const args = ['remove', pkg.name, '-y'].concat(env.environment?.name ? ['-n', env.environment.name] : ['-p', env.environment?.folderUri?.fsPath || path.dirname(env.path)]);
    await exec(conda.command, args, { timeout: 60_000 });
}
export async function updateCondaPackage(env: Environment, pkg: CondaPackageInfo) {
    if (!isCondaEnvironment(env) || !env.executable.uri) {
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }

    const args = ['update', pkg.name, '-y'].concat(env.environment?.name ? ['-n', env.environment.name] : ['-p', env.environment?.folderUri?.fsPath || path.dirname(env.path)]);
    await exec(conda.command, args, { timeout: 60_000 });
}

export async function deleteEnv(env: Environment | ResolvedEnvironment, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>) {
    if (!isCondaEnvironment(env)) {
        traceError(`Cannot delete as its not a conda environment or no name/path for ${getEnvLoggingInfo(env)}`);
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }
    const args = env.environment?.name ? ['-n', env.environment.name] : ['-p', env.environment?.folderUri?.fsPath || env.path];
    const message = `Deleting conda environment ${getEnvLoggingInfo(env)} with command ${[conda.command, 'env', 'remove'].concat(args).join(' ')}`;
    traceVerbose(message);
    progress.report({ message });
    const result = await execObservable(conda.command, ['env', 'remove'].concat(args), { timeout: 60_000 });
    await new Promise<void>(resolve => {
        result.out.subscribe({
            next: output => progress.report({ message: output.out }),
            complete: () => resolve()
        });
    });
    // // Check if it was deleted successfully.
    if (await fs.pathExists(env.path)) {
        throw new Error(`Failed to delete conda environment ${getEnvDisplayInfo(env)}, folder still exists ${getDisplayPath(env.path)} `);
    }
}

export async function getCondaVersion() {
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }
    return conda.getInfo().catch((ex) => traceError('Failed to get conda info', ex));
}

function getLatestCondaPythonVersion(environments: readonly Environment[]) {
    let maxMajorVersion = 3;
    let maxMinorVersion = 9;
    environments
        .filter(env => isCondaEnvironment(env))
        .forEach(env => {
            if (!env.version?.major || env.version?.major < maxMajorVersion) {
                // Noop,
            } else if (env.version?.major > maxMajorVersion) {
                maxMajorVersion = env.version?.major;
                maxMinorVersion = env.version?.minor || 0;
            } else if ((env.version?.minor || 0) > maxMinorVersion) {
                maxMinorVersion = env.version?.minor || 0;
            }
        });
    return `${maxMajorVersion}.${maxMinorVersion}`;
}
export async function createEnv() {
    const api = await PythonExtension.api();
    const conda = await Conda.getConda();
    if (!conda) {
        traceError(`Conda not found`);
        return;
    }

    type StateType = { name: string, pythonVersion?: string };
    const initialState: StateType = { name: '' };
    const availableMaxPythonVersion = getLatestCondaPythonVersion(api.environments.known);
    const selectVersion = async (input: MultiStepInput<StateType>, state: StateType): Promise<InputStep<StateType> | void> => {
        const version = await input.showInputBox({
            title: 'Select Python Version',
            validate: async (value) => {
                if (!value.trim().length) {
                    return 'Enter a Python version such as 3.9';
                }
            },
            placeholder: '3.7, 3.8, 3.9, 3.10, etc',
            prompt: 'Python Version', value: availableMaxPythonVersion
        });
        state.pythonVersion = version?.trim();
    };

    const specifyName = async (input: MultiStepInput<StateType>, state: StateType): Promise<InputStep<StateType> | void> => {
        const name = await input.showInputBox({
            title: 'Enter the name of the virtual environment', value: '.venv', step: 1, totalSteps: 3, prompt: 'Name',
            validate: async (value) => {
                if (!value) {
                    return 'Enter a name';
                }
            }
        });
        if (name) {
            state.name = name.trim();
            return selectVersion(input, state);
        }
    };

    const multistepInput = new MultiStepInput<StateType>(new ApplicationShell());
    await multistepInput.run(specifyName, initialState);

    // Verify we completed.
    if (!initialState.name.trim() || !initialState.pythonVersion) {
        return;
    }
    await window.withProgress({ location: ProgressLocation.Notification, cancellable: true, title: `Creating environment '${initialState.name.trim()}'` }, async (uiProgress, token) => {
        await createEnvWithInfo(uiProgress, token, initialState.name.trim(), conda.command, initialState.pythonVersion);
    });
}

async function createEnvWithInfo(progress: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
}>, token: CancellationToken, name: string, condaFile: string, pythonVersion = '3.9') {
    try {
        const isMicroMamba = condaFile.includes('.micromamba');
        progress.report({ message: `Creating environment ${name}` });
        traceInfo(`Creating conda environment ${name} with python version ${pythonVersion}`);
        const extraCreationArgs = isMicroMamba ? ['-c', 'conda-forge'] : [];
        const args = ['create', `-n`, `${name.trim()}`, `python=${pythonVersion || '3.9'}`].concat(extraCreationArgs).concat(['-y']);
        traceInfo([condaFile].concat(args).join(' '));
        const result = await execObservable(condaFile, args, {
            timeout: 120_000,
            token,
        });
        result.proc?.on('error', ex => console.error(`Conda create exited with an error`, ex))
        await new Promise<void>((resolve, reject) => {
            result.out.subscribe({
                next: output => {
                    if (output.out.trim().length) {
                        progress.report({ message: output.out });
                    }
                    traceInfo(output.out);
                },
                complete: () => resolve(),
                error: (ex) => reject(ex)
            });
        });

        if (isMicroMamba) {
            await updateEnvironmentsTxt(path.join(MICROMAMBA_ROOTPREFIX, name.trim())).catch(ex => traceError('Failed to update environments.txt', ex));
        }

        progress.report({ message: 'Waiting for environment to be detected' });
        const api = await PythonExtension.api();
        await api.environments.refreshEnvironments();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex) {
        traceError(`Failed to create environment`, ex);
        window.showErrorMessage(`Failed to create environment ${name}, ${ex}`);
    }

}


export async function updateEnvironmentsTxt(envFolder: string) {
    const txtFile = path.join(getUserHomeDir() || home, '.conda', 'environments.txt');
    const contents = await fs.readFile(txtFile, 'utf-8');
    if (contents.includes(envFolder)) {
        return;
    }
    await fs.writeFile(txtFile, `${contents.trim()}${EOL}${envFolder}${EOL}`);
}
