import { Environment } from '@vscode/python-extension';
import { traceError } from '../client/logging';
import { OutdatedPipPackageInfo, PipPackageInfo, getOutdatedPipPackages, getPipPackages, uninstallPipPackage, updatePipPackage, updatePipPackages } from './tools/pip';
import { CondaPackageInfo, getCondaPackages, getOutdatedCondaPackages, uninstallCondaPackage, updateCondaPackage, updateCondaPackages } from './tools/conda';
import { isCondaEnvironment } from './utils';

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
        const [pipPackages, condaPackages] = await Promise.all([getOutdatedPipPackages(env), getOutdatedCondaPackages(env)]);
        return condaPackages || pipPackages || new Map<string, string>()
    } catch (ex) {
        traceError(`Failed to get latest package information for ${env.id})`, ex);
        return new Map<string, string>();
    }
}

export async function updatePackage(env: Environment, pkg: PackageInfo) {
    try {
        if (isCondaEnvironment(env)) {
            await updateCondaPackage(env, pkg)
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
        } else {
            await updatePipPackages(env);
        }
    } catch (ex) {
        traceError(`Failed to update packages in ${env.id})`, ex);
        return [];
    }
}
export async function uninstallPackage(env: Environment, pkg: PackageInfo) {
    try {
        if (isCondaEnvironment(env)) {
            await uninstallCondaPackage(env, pkg);
        } else {
            await uninstallPipPackage(env, pkg);
        }
    } catch (ex) {
        traceError(`Failed to uninstall package ${pkg.name} in ${env.id})`, ex);
        return [];
    }
}
