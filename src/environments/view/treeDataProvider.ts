/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */

import { injectable } from 'inversify';
import { Environment, PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import * as path from 'path';
import {
    Disposable,
    EventEmitter,
    ExtensionContext,
    MarkdownString,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
    commands,
    window,
} from 'vscode';
import { EXTENSION_ROOT_DIR } from '../../client/constants';
import { CondaInfo } from '../../client/pythonEnvironments/common/environmentManagers/conda';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { getCondaVersion } from '../tools/conda';
import { getDisplayPath } from '../helpers';
import { noop } from '../../client/common/utils/misc';
import { clearCacheIfNewVersionInstalled } from '../cache';
import { createDeferred, sleep } from '../../client/common/utils/async';
import { getEnvironmentType, isCondaEnvironment } from '../utils';
import { IServiceContainer } from '../../client/ioc/types';
import { PackageInfo, getOutdatedPackages, getPackages, updatePackages, uninstallPackage, updatePackage } from '../packages';
import { getPyEnvVersion } from '../tools/pyenv';
import { canEnvBeDeleted } from '../envDeletion';
import { canEnvBeCreated } from '../envCreation';
import { traceError } from '../../client/logging';

type PackageStatus = 'DetectingLatestVersion' | 'UpdatingToLatest' | 'UnInstalling' | 'Updating' | undefined;
class Package {
    public latestVersion?: string;
    public status?: PackageStatus = 'DetectingLatestVersion';

    constructor(
        public readonly parent: PackageWrapper,
        public readonly env: Environment,
        public readonly pkg: PackageInfo,
    ) {
        parent.packages.push(this);
    }

    public asTreeItem() {
        const tree = new TreeItem(this.pkg.name);
        tree.contextValue = 'package:';
        tree.description = this.pkg.version;
        let tooltip = '';
        if ('channel' in this.pkg) {
            tooltip = [this.pkg.channel || '', this.pkg.base_url || ''].filter((item) => item.trim().length).join(': ');
        }
        if (this.latestVersion) {
            tree.contextValue = 'package:outdated';
            tree.tooltip = new MarkdownString(`$(warning): Latest Version: ${this.latestVersion}\n${tooltip}`, true);
            tree.iconPath = this.status ? new ThemeIcon('loading~spin') : new ThemeIcon('warning');
        } else {
            tree.tooltip = tooltip;
            tree.iconPath = this.status ? new ThemeIcon('loading~spin') : new ThemeIcon('library');
        }
        return tree;
    }
}
class EnvironmentTypeWrapper {
    constructor(public readonly type: EnvironmentType) { }
}
class EnvironmentWrapper {
    public get id() {
        return this.env.id;
    }
    constructor(public readonly env: Environment) { }

    public asTreeItem(api: PythonExtension) {
        const env = api.environments.known.find((e) => e.id === this.env.id);
        if (!env) {
            const tree = new TreeItem('Not found', TreeItemCollapsibleState.Collapsed);
            tree.description = 'Environment no longer found, please try refreshing';
            tree.iconPath = new ThemeIcon('error');
            return tree;
        }
        const version = env.version ? `${env.version.major}.${env.version.minor}.${env.version.micro} ` : '';
        const label = getEnvLabel(env);
        const tree = new TreeItem(label + (version ? ` (${version})` : ''), TreeItemCollapsibleState.Collapsed);
        const isEmptyCondaEnv = getEnvironmentType(env) === EnvironmentType.Conda && !env.executable.uri;
        const executable = getDisplayPath(env.environment?.folderUri?.fsPath || env.path);
        tree.tooltip = [version, executable].filter((item) => !!item).join('\n');
        tree.tooltip = new MarkdownString(
            getEnvironmentInfo({ env })
                .map((item) => `**${item.label}**: ${item.value}  `)
                .join('\n'),
        );
        // If its a conda, env we can have conda envs without python, in such cases the version is empty.
        tree.description = executable;
        // tree.contextValue = `env`;
        const deleteContext = canEnvBeDeleted(getEnvironmentType(env)) ? 'canBeDeleted' : 'cannotBeDeleted';
        tree.contextValue = `env:${deleteContext}:${getEnvironmentType(env)} `;
        tree.iconPath = isEmptyCondaEnv
            ? new ThemeIcon('warning')
            : Uri.file(path.join(EXTENSION_ROOT_DIR, 'resources/logo.svg'));
        return tree;
    }
}

class EnvironmentInfo {
    constructor(public readonly label: string, public value: string) { }
}
class EnvironmentInformationWrapper {
    constructor(public readonly env: Environment) { }
}
class PackageWrapper {
    public readonly packages: Package[] = [];
    constructor(public env: Environment) { }
}
type Node =
    | EnvironmentType
    | EnvironmentWrapper
    | EnvironmentInformationWrapper
    | EnvironmentInfo
    | Package
    | PackageWrapper;

function getEnvLabel(env: ResolvedEnvironment | Environment) {
    if (env.environment?.name) {
        return env.environment.name;
    }
    if (env.environment?.folderUri) {
        return path.basename(env.environment.folderUri.fsPath);
    }
    if (env.executable.uri) {
        return path.basename(path.dirname(path.dirname(env.executable.uri.fsPath)));
    }
    return path.basename(env.path);
}
@injectable()
export class PythonEnvironmentTreeDataProvider implements TreeDataProvider<Node> {
    public static environments: ResolvedEnvironment[];

    public static instance: PythonEnvironmentTreeDataProvider;

    // private readonly workspaceFolders = new Map<string, WorkspaceFolderWrapper>();

    private readonly interpreterInfo = new Map<string, EnvironmentWrapper>();

    private condaInfo?: CondaInfo;

    private pyEnvVersion?: string;

    private readonly disposables: Disposable[] = [];

    private readonly environmentTypes = new Map<EnvironmentType, EnvironmentTypeWrapper>();

    constructor(
        private readonly context: ExtensionContext,
        private readonly api: PythonExtension,
        private readonly iocContainer: IServiceContainer,
    ) {
        PythonEnvironmentTreeDataProvider.instance = this;
        this.refresh(false);
        commands.registerCommand('python.envManager.updatePackage', async (pkg: Package) => {
            const yes = await window.showWarningMessage(
                `Are you sure you want to update the package '${pkg.pkg.name} to the latest version ${pkg.latestVersion}?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (yes === 'No') {
                return;
            }

            pkg.status = 'DetectingLatestVersion';
            this._changeTreeData.fire(pkg);
            await updatePackage(pkg.env, pkg.pkg).catch(ex => traceError(`Failed to update package ${pkg.pkg.name} in ${pkg.env.id}`, ex));
            pkg.status = undefined;

            // Other packages may have been updated, so refresh all packages.
            this._changeTreeData.fire(pkg.parent);
        });
        commands.registerCommand('python.envManager.uninstallPackage', async (pkg: Package) => {
            const yes = await window.showWarningMessage(
                `Are you sure you want to uninstall the package '${pkg.pkg.name}'?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (yes === 'No') {
                return;
            }

            pkg.status = 'UnInstalling';
            this._changeTreeData.fire(pkg);
            await uninstallPackage(pkg.env, pkg.pkg);
            pkg.status = undefined;

            // Other packages may have been uninstalled, so refresh all packages.
            this._changeTreeData.fire(pkg.parent);
        });
        commands.registerCommand('python.envManager.updateAllPackages', async (pkg: PackageWrapper) => {
            const yes = await window.showWarningMessage(
                `Are you sure you want to update all the packages?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (yes === 'No') {
                return;
            }

            pkg.packages.forEach((e) => {
                e.status = 'UpdatingToLatest';
                this._changeTreeData.fire(e);
            });

            await updatePackages(pkg.env);

            // Other packages may have been uninstalled, so refresh all packages.
            this._changeTreeData.fire(pkg);
        });
        commands.registerCommand('python.envManager.refreshPackages', async (pkg: PackageWrapper) =>
            this._changeTreeData.fire(pkg),
        );
        api.environments.onDidChangeEnvironments(this.rebuildEnvironmentTypesIfRequired, this, this.disposables);
        api.environments.onDidChangeEnvironments(
            (e) => {
                if (e.type === 'add' || e.type === 'remove') {
                    const envType = getEnvironmentType(e.env);
                    if (this.environmentTypes.has(envType)) {
                        this._changeTreeData.fire(envType);
                    } else {
                        this._changeTreeData.fire();
                    }
                } else if (e.type === 'update' && this.interpreterInfo.get(e.env.id)) {
                    this._changeTreeData.fire(this.interpreterInfo.get(e.env.id)!);
                }
            },
            this,
            this.disposables,
        );
        this.rebuildEnvironmentTypesIfRequired();
        // api.environments.
    }

    private readonly outdatedPackages = new Map<string, Map<string, string>>();

    private readonly _changeTreeData = new EventEmitter<Node | void | undefined | null>();

    public readonly onDidChangeTreeData = this._changeTreeData.event;

    public dispose() {
        this._changeTreeData.dispose();
    }

    private rebuildEnvironmentTypesIfRequired() {
        const envs = new Set(this.api.environments.known.map((item) => getEnvironmentType(item)));
        if (envs.size !== this.environmentTypes.size) {
            Array.from(envs)
                .filter((type) => !this.environmentTypes.has(type))
                .forEach((type) => this.environmentTypes.set(type, new EnvironmentTypeWrapper(type)));
            this._changeTreeData.fire();
        }
    }

    public changeTreeData(item: Node) {
        this._changeTreeData.fire(item);
    }

    async getTreeItem(element: Node): Promise<TreeItem> {
        if (element instanceof EnvironmentWrapper) {
            return element.asTreeItem(this.api);
        }
        if (element instanceof EnvironmentInformationWrapper) {
            const tree = new TreeItem('Info', TreeItemCollapsibleState.Collapsed);
            tree.contextValue = 'envInfo';
            tree.iconPath = new ThemeIcon('info');
            return tree;
        }
        if (element instanceof Package) {
            return element.asTreeItem();
        }
        if (element instanceof PackageWrapper) {
            const tree = new TreeItem('Packages', TreeItemCollapsibleState.Collapsed);
            tree.contextValue = 'packageContainer';
            tree.iconPath = new ThemeIcon('package');
            return tree;
        }
        if (element instanceof EnvironmentInfo) {
            const tree = new TreeItem(element.label);
            tree.description = element.value;
            tree.contextValue = 'info';
            tree.tooltip = element.value;
            return tree;
        }
        const tree = new TreeItem(element, TreeItemCollapsibleState.Collapsed);
        const createContext = canEnvBeCreated(element) ? 'canCreate' : 'cannotCreate';
        tree.contextValue = `envType:${createContext}:${element} `;
        if (element === EnvironmentType.Conda && this.condaInfo) {
            tree.description = this.condaInfo.conda_version;
        } else if (element === EnvironmentType.Pyenv && this.pyEnvVersion) {
            tree.description = this.pyEnvVersion;
        }
        tree.iconPath = new ThemeIcon('folder-library');
        return tree;
    }

    public async getChildren(element?: Node): Promise<Node[]> {
        if (!element) {
            return Array.from(this.environmentTypes.keys()).sort();
        }
        if (element instanceof Package) {
            return [];
        }
        if (element instanceof EnvironmentInformationWrapper) {
            return getEnvironmentInfo({ api: this.api, id: element.env.id });
        }
        if (element instanceof EnvironmentInfo) {
            return [];
        }
        if (element instanceof EnvironmentWrapper) {
            return [new EnvironmentInformationWrapper(element.env), new PackageWrapper(element.env)];
        }
        if (element instanceof PackageWrapper) {
            const env = this.api.environments.known.find((e) => e.id === element.env.id);
            if (!env) {
                return [];
            }

            const packagesByEnv = new Map<string, Map<string, Package>>();
            const completedPackages = createDeferred<Map<string, Package>>();
            getOutdatedPackages(env)
                .then((outdatedPackages) =>
                    completedPackages.promise.then((installedPackages) => {
                        this.outdatedPackages.set(env.id, outdatedPackages);
                        for (const [pkgId, installedPackage] of installedPackages) {
                            installedPackage.latestVersion = outdatedPackages.get(pkgId);
                            installedPackage.status = undefined;
                            this._changeTreeData.fire(installedPackage);
                        }
                    }),
                )
                .catch((ex) => traceError(`Failed to get outdated packages for ${env.id}`, ex));

            return getPackages(env).then((pkgs) => {
                const packages = pkgs.map((pkg) => {
                    const item = new Package(element, env, pkg);
                    const packagesMap = packagesByEnv.get(env.id) || new Map<string, Package>();
                    packagesByEnv.set(env.id, packagesMap);
                    packagesMap.set(pkg.name, item);
                    return item;
                });
                completedPackages.resolve(packagesByEnv.get(env.id) || new Map<string, Package>());
                return packages;
            });
        }
        return this.api.environments.known
            .filter((env) => getEnvironmentType(env) === element)
            .sort((a, b) => getEnvLabel(a).localeCompare(getEnvLabel(b)))
            .map((env) => {
                if (!this.interpreterInfo.has(env.id)) {
                    this.interpreterInfo.set(env.id, new EnvironmentWrapper(env));
                }
                return this.interpreterInfo.get(env.id)!;
            });
    }

    private refreshing = false;

    public async refresh(clearCache = false) {
        if (this.refreshing) {
            return;
        }
        this.refreshing = true;
        commands.executeCommand('setContext', 'isRefreshingPythonEnvironments', true);
        try {
            this.refreshToolVersions();
            const refreshPromise = this.api.environments.refreshEnvironments({ forceRefresh: clearCache });
            await clearCacheIfNewVersionInstalled(this.context, clearCache).then(noop, noop);
            await refreshPromise.catch(noop);
            // Conda can get discovered as a result of discovering Python Envs, hence we need to wait for discovering Python envs.
            this.refreshToolVersions();
        } finally {
            this.refreshing = false;
            commands.executeCommand('setContext', 'isRefreshingPythonEnvironments', false).then(noop, noop);
        }
    }

    private refreshToolVersions() {
        getCondaVersion()
            .then((info) => {
                if (info) {
                    this.condaInfo = info;
                    if (this.environmentTypes.has(EnvironmentType.Conda)) {
                        this._changeTreeData.fire(EnvironmentType.Conda);
                    }
                }
            })
            .catch(noop);
        getPyEnvVersion(this.iocContainer)
            .then((version) => {
                if (version) {
                    this.pyEnvVersion = version;
                    if (this.environmentTypes.has(EnvironmentType.Pyenv)) {
                        this._changeTreeData.fire(EnvironmentType.Pyenv);
                    }
                }
            })
            .catch(noop);
    }
}

export async function refreshUntilNewEnvIsAvailable(expectedEnvInfo: {
    name?: string;
    path?: string;
    type: EnvironmentType;
}) {
    const initialEnvCount = PythonEnvironmentTreeDataProvider.environments.length;

    const isEnvAvailable = () => {
        if (!expectedEnvInfo.path && !expectedEnvInfo.name) {
            return true;
        }
        if (PythonEnvironmentTreeDataProvider.environments.length > initialEnvCount) {
            return true;
        }
        return PythonEnvironmentTreeDataProvider.environments.some((env) => {
            if (expectedEnvInfo.type !== getEnvironmentType(env)) {
                return;
            }
            if (expectedEnvInfo.name && env.environment?.name && env.environment.name.includes(expectedEnvInfo.name)) {
                return true;
            }
            if (expectedEnvInfo.path && env.path.includes(expectedEnvInfo.path)) {
                return true;
            }
            return false;
        });
    };

    // Discovering new conda envs can be a little slow.
    for (let index = 0; index < 5; index += 1) {
        await PythonEnvironmentTreeDataProvider.instance.refresh();
        if (isEnvAvailable()) {
            return;
        }
        sleep(2_000);
    }
}

function getEnvironmentInfo(options: { api: PythonExtension; id: string } | { env: Environment }) {
    const info: EnvironmentInfo[] = [];
    let env: Environment | undefined;
    if ('api' in options) {
        env = options.api.environments.known.find((e) => e.id === options.id);
        if (!env) {
            return [];
        }
    } else {
        env = options.env;
    }
    const isEmptyCondaEnv = isCondaEnvironment(env) && !env.executable.uri;
    if (env.environment?.name) {
        info.push(new EnvironmentInfo('Name', env.environment?.name));
    }
    if (!env.environment?.name && env.environment?.folderUri && isCondaEnvironment(env)) {
        info.push(new EnvironmentInfo('Name', path.basename(env.environment.folderUri.fsPath)));
    }
    if (env.version?.sysVersion) {
        info.push(new EnvironmentInfo('Version', env.version.sysVersion));
    }
    if (!isEmptyCondaEnv && env.executable.bitness && env.executable.bitness !== 'Unknown') {
        info.push(new EnvironmentInfo('Architecture', env.executable.bitness));
    }
    if (!isEmptyCondaEnv && env.path) {
        info.push(new EnvironmentInfo('Executable', getDisplayPath(env.path)));
    }
    if (!isEmptyCondaEnv && env.executable.sysPrefix) {
        info.push(new EnvironmentInfo('SysPrefix', getDisplayPath(env.executable.sysPrefix)));
    }
    if (env.environment?.workspaceFolder) {
        info.push(new EnvironmentInfo('Folder', getDisplayPath(env.environment.workspaceFolder.uri.fsPath)));
    }
    info.push(new EnvironmentInfo('Environment Type', getEnvironmentType(env)));

    return info;
}
