import { Environment } from '@vscode/python-extension';
import { CancellationError, ProgressLocation, QuickPickItem, window } from 'vscode';
import { traceError } from '../client/logging';
import {
    OutdatedPipPackageInfo,
    PipPackageInfo,
    exportPipPackages,
    getInstallPipPackageSpawnOptions,
    getOutdatedPipPackages,
    getPipPackages,
    getUninstallPipPackageSpawnOptions,
    searchPipPackage,
    updatePipPackage,
    updatePipPackages,
} from './tools/pip';
import {
    CondaPackageInfo,
    exportCondaPackages,
    getCondaPackageInstallSpawnOptions,
    getCondaPackages,
    getOutdatedCondaPackages,
    getUninstallCondaPackageSpawnOptions,
    searchCondaPackage,
    updateCondaPackage,
    updateCondaPackages,
} from './tools/conda';
import { getEnvironmentType, isCondaEnvironment } from './utils';
import { EnvironmentType } from '../client/pythonEnvironments/info';
import {
    exportPoetryPackages,
    getPoetryPackageInstallSpawnOptions,
    getUninstallPoetryPackageSpawnOptions,
    searchPoetryPackage,
    updatePoetryPackages,
} from './tools/poetry';
import { SpawnOptions } from '../client/common/process/types';
import { getEnvLoggingInfo, reportStdOutProgress } from './helpers';
import { searchPackageWithProvider } from './packageSearch';

export type PackageInfo = PipPackageInfo | CondaPackageInfo;
export type OutdatedPackageInfo = OutdatedPipPackageInfo;

export async function getPackages(env: Environment) {
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
        traceError(`Failed to get package information for ${env.id})`, ex);
        return [];
    }
}
export async function getOutdatedPackages(env: Environment) {
    try {
        const [pipPackages, condaPackages] = await Promise.all([
            getOutdatedPipPackages(env),
            getOutdatedCondaPackages(env),
        ]);
        return condaPackages || pipPackages || new Map<string, string>();
    } catch (ex) {
        traceError(`Failed to get latest package information for ${env.id})`, ex);
        return new Map<string, string>();
    }
}

export async function updatePackage(env: Environment, pkg: PackageInfo) {
    try {
        if (isCondaEnvironment(env)) {
            await updateCondaPackage(env, pkg);
        } else {
            await updatePipPackage(env, pkg);
        }
    } catch (ex) {
        traceError(`Failed to update package ${pkg.name} in ${env.id})`, ex);
        return [];
    }
}
export async function updatePackages(env: Environment) {
    try {
        if (isCondaEnvironment(env)) {
            await updateCondaPackages(env);
        } else if (getEnvironmentType(env) === EnvironmentType.Poetry) {
            await updatePoetryPackages(env);
        } else {
            await updatePipPackages(env);
        }
    } catch (ex) {
        traceError(`Failed to update packages in ${env.id})`, ex);
        return [];
    }
}
export async function uninstallPackage(env: Environment, pkg: PackageInfo) {
    await window.withProgress(
        { location: ProgressLocation.Notification, cancellable: true, title: `Uninstalling ${pkg.name}` },
        async (progress, token) => {
            let result: {
                command: string;
                args: string[];
                options?: SpawnOptions | undefined;
            };
            try {
                if (isCondaEnvironment(env)) {
                    result = await getUninstallCondaPackageSpawnOptions(env, pkg, token);
                } else if (getEnvironmentType(env) === EnvironmentType.Poetry) {
                    result = await getUninstallPoetryPackageSpawnOptions(env, pkg.name, token);
                } else {
                    result = await getUninstallPipPackageSpawnOptions(env, pkg, token);
                }
                const message = `Uninstalling package ${pkg.name} from ${getEnvLoggingInfo(env)} with command ${[
                    result.command,
                    ...result.args,
                ]}]}`;
                await reportStdOutProgress(
                    message,
                    [result.command, result.args, { timeout: 60_000, ...(result.options || {}) }],
                    progress,
                    token,
                );
            } catch (ex) {
                traceError(`Failed to uninstall package ${pkg.name} in ${env.id})`, ex);
                return [];
            }
        },
    );
}
export async function exportPackages(env: Environment) {
    try {
        if (isCondaEnvironment(env)) {
            return exportCondaPackages(env);
        }
        if (getEnvironmentType(env) === EnvironmentType.Poetry) {
            return exportPoetryPackages(env);
        }
        return exportPipPackages(env);
    } catch (ex) {
        traceError(`Failed to export environment ${env.id}`, ex);
    }
}

type ExtractItemType<T> = T extends (QuickPickItem & { item: infer R })[] ? (R | undefined) : undefined;
type SearchPackageResult =
    | {
        conda: ExtractItemType<Awaited<ReturnType<typeof searchCondaPackage>>>;
    }
    | {
        poetry: ExtractItemType<Awaited<ReturnType<typeof searchPoetryPackage>>>;
    }
    | {
        pip: ExtractItemType<Awaited<ReturnType<typeof searchPipPackage>>>;
    };

export async function searchPackage(env: Environment): Promise<SearchPackageResult> {
    try {
        if (isCondaEnvironment(env)) {
            const result = await searchPackageWithProvider(searchCondaPackage, env);
            if (!result) {
                throw new CancellationError();
            }
            return { conda: result };
        }
        if (getEnvironmentType(env) === EnvironmentType.Poetry) {
            const result = await searchPackageWithProvider(searchPoetryPackage, env);
            if (!result) {
                throw new CancellationError();
            }
            return { poetry: result };
        }
        const result = await searchPackageWithProvider(searchPipPackage, env);
        if (!result) {
            throw new CancellationError();
        }
        return { pip: result };
    } catch (ex) {
        traceError(`Failed to install a package in ${env.id})`, ex);
        throw ex;
    }
}
export async function installPackage(env: Environment, packageInfo: SearchPackageResult) {
    let packageName = '';
    if ('conda' in packageInfo && packageInfo.conda) {
        packageName = packageInfo.conda.name;
    } else if ('poetry' in packageInfo && packageInfo.poetry) {
        packageName = packageInfo.poetry;
    } else if ('pip' in packageInfo && packageInfo.pip) {
        packageName = packageInfo.pip.name;
    } else {
        throw new Error('Not supported');
    }

    await window.withProgress(
        { location: ProgressLocation.Notification, cancellable: true, title: `Installing ${packageName}` },
        async (progress, token) => {
            let result: {
                command: string;
                args: string[];
                options?: SpawnOptions | undefined;
            };
            try {
                if ('conda' in packageInfo && packageInfo.conda) {
                    result = await getCondaPackageInstallSpawnOptions(env, packageInfo.conda, token);
                } else if ('poetry' in packageInfo && packageInfo.poetry) {
                    result = await getPoetryPackageInstallSpawnOptions(env, packageInfo.poetry, token);
                } else if ('pip' in packageInfo && packageInfo.pip) {
                    result = await getInstallPipPackageSpawnOptions(env, packageInfo.pip, token);
                } else {
                    throw new Error('Not supported');
                }
                const message = `Installing package ${packageName} into ${getEnvLoggingInfo(env)} with command ${[
                    result.command,
                    ...result.args,
                ]}]}`;
                await reportStdOutProgress(
                    message,
                    [result.command, result.args, { timeout: 60_000, ...(result.options || {}) }],
                    progress,
                    token,
                );
            } catch (ex) {
                traceError(`Failed to install package ${packageName} into ${getEnvLoggingInfo(env)})`, ex);
            }
        },
    );
}
