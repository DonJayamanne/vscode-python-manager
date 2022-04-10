import * as fs from 'fs-extra';
import * as path from 'path';
import { EOL } from 'os';
import { CancellationToken, Progress, ProgressLocation, window } from 'vscode';
import { ApplicationShell } from '../client/common/application/applicationShell';
import { execObservable } from '../client/common/process/rawProcessApis';
import { InputStep, MultiStepInput } from '../client/common/utils/multiStepInput';
import { getUserHomeDir } from '../client/common/utils/platform';
import { traceError, traceInfo, traceVerbose } from '../client/logging';
import { Conda } from '../client/pythonEnvironments/common/environmentManagers/conda';
import { getPyenvDir } from '../client/pythonEnvironments/common/environmentManagers/pyenv';
import { exec } from '../client/pythonEnvironments/common/externalDependencies';
import { EnvironmentType, PythonEnvironment } from '../client/pythonEnvironments/info';
import { getDisplayPath, getEnvDisplayInfo, getEnvLoggingInfo, home } from './helpers';
import { MICROMAMBA_ROOTPREFIX } from './micromamba/constants';
import { RefreshUntilNewEnvIsAvailable } from './environments';

type CondaPackageInfo = {
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

type PipPackageInfo = {
    name: string;
    version: string;
};
export type PackageInfo = PipPackageInfo | CondaPackageInfo;
export async function getPackages(env: PythonEnvironment) {
    try {
        const [pipPackages, condaPackages] = await Promise.all([getPipPackages(env), getCondaPackages(env)]);
        const packages = new Map<string, PackageInfo>();
        (pipPackages || []).forEach((pkg) => packages.set(pkg.name, pkg));
        // Use conda packages as source of truth, as we might have more information
        // when getting conda packages.
        (condaPackages || []).forEach((pkg) => packages.set(pkg.name, pkg));
        return Array.from(packages.values()).sort((a, b) =>
            a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()),
        );
    } catch (ex) {
        traceError(`Failed to get package information for ${env.displayName})`, ex);
        return [];
    }
}
export async function getPipPackages(env: PythonEnvironment) {
    if (env.envType === EnvironmentType.Conda) {
        return;
    }

    const result = await exec(env.path, ['-m', 'pip', 'list', '--format', 'json'], { timeout: 60_000 });
    traceVerbose(`python -m pip list --format --json: ${result.stdout}`);
    const stdout = result.stdout.trim();
    return stdout ? (JSON.parse(result.stdout) as PipPackageInfo[]) : [];
}
export async function getCondaPackages(env: PythonEnvironment) {
    if (env.envType !== EnvironmentType.Conda || (!env.envName && !env.envPath)) {
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }
    const args = env.envName ? ['list', '-n', env.envName] : ['list', '-p', env.envPath!];
    const result = await exec(conda.command, args.concat(['--json']), { timeout: 60_000 });
    const stdout = result.stdout.trim();
    traceVerbose(`conda info --json: ${result.stdout}`);
    return stdout ? (JSON.parse(result.stdout) as CondaPackageInfo[]) : [];
}
export async function deleteEnv(env: PythonEnvironment, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>) {
    if (env.envType !== EnvironmentType.Conda || (!env.envName && !env.envPath)) {
        traceError(`Cannot delete as its not a conda environment or no name/path for ${getEnvLoggingInfo(env)}`);
        return;
    }
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }
    const args = env.envName ? ['-n', env.envName] : ['-p', env.envPath!];
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
    if (!env.envName || !env.path) {
        // Can't tell if an environment was deleted if we don't have the name or path.
        return;
    }
    // // Check if it was deleted successfully.
    if (await fs.pathExists(env.envPath || env.path)) {
        throw new Error(`Failed to delete conda environment ${getEnvDisplayInfo(env)}, folder still exists ${getDisplayPath(env.envPath || env.path)} `);
    }
}

export async function getCondaVersion() {
    const conda = await Conda.getConda();
    if (!conda) {
        return;
    }
    return conda.getInfo().catch((ex) => traceError('Failed to get conda info', ex));
}

export async function getPyEnvVersion() {
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
    } catch (ex) {
        traceError('Failed to get pyenv version', ex);
    }
}

function getLatestCondaPythonVersion(environments: PythonEnvironment[]) {
    let maxMajorVersion = 3;
    let maxMinorVersion = 9;
    environments
        .filter(env => env.envType === EnvironmentType.Conda)
        .forEach(env => {
            if (!env.version?.major || env.version?.major < maxMajorVersion) {
                // Noop,
            } else if (env.version?.major > maxMajorVersion) {
                maxMajorVersion = env.version?.major;
                maxMinorVersion = env.version?.minor;
            } else if (env.version?.minor > maxMinorVersion) {
                maxMinorVersion = env.version?.minor;
            }
        });
    return `${maxMajorVersion}.${maxMinorVersion}`;
}
export async function createEnv(environments: PythonEnvironment[], refreshUntilAvailable: RefreshUntilNewEnvIsAvailable) {
    const conda = await Conda.getConda();
    if (!conda) {
        traceError(`Conda not found`);
        return;
    }

    type StateType = { name: string, pythonVersion?: string };
    const initialState: StateType = { name: '' };
    const availableMaxPythonVersion = getLatestCondaPythonVersion(environments);
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
        await createEnvWithInfo(uiProgress, token, initialState.name.trim(), conda.command, refreshUntilAvailable, initialState.pythonVersion);
    });
}

async function createEnvWithInfo(progress: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
}>, token: CancellationToken, name: string, condaFile: string, refreshUntilAvailable: RefreshUntilNewEnvIsAvailable, pythonVersion = '3.9') {
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
        await refreshUntilAvailable({ name, type: EnvironmentType.Conda });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex: any) {
        traceError(`Failed to create environment`, ex);
        window.showErrorMessage(`Failed to create environment ${name}, ${ex.toString()}`);
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
