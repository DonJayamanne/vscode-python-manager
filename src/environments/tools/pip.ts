/* eslint-disable camelcase */

import { Environment, ResolvedEnvironment } from '@vscode/python-extension';
import { traceError, traceVerbose } from '../../client/logging';
import { exec } from '../../client/pythonEnvironments/common/externalDependencies';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { getEnvironmentType } from '../utils';

export interface PipPackageInfo {
    name: string;
    version: string;
}
export interface OutdatedPipPackageInfo extends PipPackageInfo {
    latest_version: string;
}
export async function getPipPackages(env: Environment) {
    if (getEnvironmentType(env) === EnvironmentType.Conda) {
        return;
    }

    const result = await exec(env.path, ['-m', 'pip', 'list', '--format', 'json'], { timeout: 60_000 });
    traceVerbose(`python -m pip list --format --json: ${result.stdout}`);
    const stdout = result.stdout.trim();
    const packages = stdout ? (JSON.parse(result.stdout) as PipPackageInfo[]) : [];
    return packages;
}
export async function getOutdatedPipPackages(env: Environment): Promise<Map<string, string> | undefined> {
    if (getEnvironmentType(env) === EnvironmentType.Conda) {
        return;
    }

    const result = await exec(env.path, ['-m', 'pip', 'list', '--outdated', '--format', 'json'], { timeout: 60_000 });
    traceVerbose(`python -m pip list --format --json: ${result.stdout}`);
    const stdout = result.stdout.trim();
    if (!stdout) {
        return;
    }
    const map = new Map<string, string>();
    (JSON.parse(result.stdout) as OutdatedPipPackageInfo[]).forEach((pkg) => map.set(pkg.name, pkg.latest_version));
    return map;
}
export async function updatePipPackage(env: Environment, pkg: PipPackageInfo) {
    if (getEnvironmentType(env) === EnvironmentType.Conda) {
        return [];
    }

    await exec(env.path, ['-m', 'pip', 'install', '-U', pkg.name], { timeout: 60_000 });
}
export async function updatePipPackages(env: Environment) {
    if (getEnvironmentType(env) === EnvironmentType.Conda) {
        return [];
    }

    const outdatedPackages = await getOutdatedPipPackages(env);
    const packages = outdatedPackages ? Array.from(outdatedPackages?.values()) : [];
    if (packages.length === 0) {
        traceError(`No outdated packages found for ${env.id}`);
    }
    await exec(env.path, ['-m', 'pip', 'install', '-U', ...packages], { timeout: 60_000 });
}
export async function uninstallPipPackage(env: Environment, pkg: PipPackageInfo) {
    if (getEnvironmentType(env) === EnvironmentType.Conda) {
        return [];
    }

    await exec(env.path, ['-m', 'pip', 'uninstall', '-y', pkg.name], { timeout: 60_000 });
}
export async function exportPipPackages(env: Environment | ResolvedEnvironment) {
    const result = await exec(env.path, ['-m', 'pip', 'freeze'], { timeout: 60_000 });
    return { contents: result?.stdout, language: 'pip-requirements', file: 'requirements.txt' };
}
