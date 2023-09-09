/* eslint-disable camelcase */

import { Environment, ResolvedEnvironment } from '@vscode/python-extension';
import { CancellationToken, QuickPickItem } from 'vscode';
import { traceError, traceVerbose } from '../../client/logging';
import { exec } from '../../client/pythonEnvironments/common/externalDependencies';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { getEnvironmentType } from '../utils';
import { SpawnOptions } from '../../client/common/process/types';

export interface PipPackageInfo {
    name: string;
    version: string;
    description?: string;
    updated?: string;
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
export async function getUninstallPipPackageSpawnOptions(
    env: Environment,
    pkg: PipPackageInfo,
    _token: CancellationToken,
): Promise<{ command: string; args: string[]; options?: SpawnOptions }> {
    return { command: env.path, args: ['-m', 'pip', 'uninstall', '-y', pkg.name] };
}
export async function getInstallPipPackageSpawnOptions(
    env: Environment,
    pkg: PipPackageInfo,
    _token: CancellationToken,
): Promise<{ command: string; args: string[]; options?: SpawnOptions }> {
    return { command: env.path, args: ['-m', 'pip', 'install', pkg.name, '-q'] };
}
export async function exportPipPackages(env: Environment | ResolvedEnvironment) {
    const result = await exec(env.path, ['-m', 'pip', 'freeze'], { timeout: 60_000 });
    return { contents: result?.stdout, language: 'pip-requirements', file: 'requirements.txt' };
}

export async function searchPipPackage(value: string, _env: Environment, token: CancellationToken): Promise<(QuickPickItem & { item: PipPackageInfo })[]> {
    const [page1Results, page2Results, page3Results] = await Promise.all([
        searchPackageByPage(value, 1, token),
        searchPackageByPage(value, 2, token),
        searchPackageByPage(value, 3, token),
    ]);
    const items = [...page1Results, ...page2Results, ...page3Results];
    return items.map(p => {
        const description = p.version ? `${p.version} ${p.updated ? `(${p.updated})` : ''}` : '';
        return { label: p.name, description, detail: p.description, item: p, alwaysShow: true };
    })
}

async function searchPackageByPage(value: string, page: number, token: CancellationToken): Promise<PipPackageInfo[]> {
    const pageQuery = page === 1 ? '' : `&page=${page}`;
    const response = await fetch(`https://pypi.org/search/?q=${encodeURIComponent(value)}${pageQuery}`);
    if (token.isCancellationRequested) {
        return [];
    }
    if (response.status !== 200) {
        return [];
    }
    const html = await response.text();
    const results = html.substring(html.indexOf(' <ul class="unstyled" aria-label="Search results">'));

    const packages: PipPackageInfo[] = [];
    results
        .substring(0, results.indexOf('</ul>'))
        .split('<li>')
        .forEach((item) => {
            let name = '';
            if (item.indexOf('<span class="package-snippet__name">')) {
                name = item.substring(
                    item.indexOf('<span class="package-snippet__name">') +
                    '<span class="package-snippet__name">'.length,
                );
                name = name.substring(0, name.indexOf('</span>')).trim();
            }
            let version = '';
            if (item.indexOf('<span class="package-snippet__version">')) {
                version = item.substring(
                    item.indexOf('<span class="package-snippet__version">') +
                    '<span class="package-snippet__version">'.length,
                );
                version = version.substring(0, version.indexOf('</span>')).trim();
            }
            let desc = '';
            if (item.indexOf('<p class="package-snippet__description">')) {
                desc = item.substring(
                    item.indexOf('<p class="package-snippet__description">') +
                    '<p class="package-snippet__description">'.length,
                );
                desc = desc.substring(0, desc.indexOf('</p>')).trim();
            }
            let updated = '';
            if (item.indexOf('<span class="package-snippet__created">')) {
                updated = item.substring(
                    item.indexOf('<span class="package-snippet__created">') +
                    '<span class="package-snippet__created">'.length,
                );
                updated = updated.substring(0, updated.indexOf('</time>'));
                updated = updated.substring(updated.indexOf('>') + 1).trim();
            }

            if (name && version) {
                packages.push({ name, version, description: desc, updated });
            }
        });
    return packages;
}
