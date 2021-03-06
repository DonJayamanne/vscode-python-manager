/* eslint-disable max-classes-per-file */
import { inject, injectable } from 'inversify';
import { flatten } from 'lodash';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
    EventEmitter,
    ExtensionContext,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
    workspace,
    WorkspaceFolder,
} from 'vscode';
import { Architecture } from '../../client/common/utils/platform';
import { EXTENSION_ROOT_DIR } from '../../client/constants';
import { IInterpreterService } from '../../client/interpreter/contracts';
import { CondaInfo } from '../../client/pythonEnvironments/common/environmentManagers/conda';
import { EnvironmentType, PythonEnvironment } from '../../client/pythonEnvironments/info';
import { getCondaVersion, getPackages, getPyEnvVersion, PackageInfo } from '../condaHelper';
import { canEnvBeCreated, canEnvBeDeleted, getDisplayPath, getEnvironmentId, getEnvironmentTypeName } from '../helpers';
import { noop } from '../../client/common/utils/misc';
import { clearCacheIfNewVersionInstalled, EnvironmentsCacheMementoKey } from '../cache';
import { sleep } from '../../client/common/utils/async';

class Package {
    constructor(public readonly pkg: PackageInfo) { }
}
class EnvironmentTypeWrapper {
    public readonly environments = new Set<string>();

    constructor(public readonly type: EnvironmentType) { }
}
class EnvironmentWrapper {
    public get id() {
        return getEnvironmentId(this.env);
    }

    constructor(public env: PythonEnvironment) { }
}

class EnvironmentInfo {
    constructor(public readonly label: string, public value: string) { }
}
class EnvironmentInformationWrapper {
    public readonly info: EnvironmentInfo[] = [];

    constructor(public readonly env: PythonEnvironment) {
        const isEmptyCondaEnv = env.envType === EnvironmentType.Conda && !env.sysVersion;
        if (env.envName) {
            this.info.push(new EnvironmentInfo('Name', env.envName));
        }
        if (!env.envName && env.envPath && env.envType === EnvironmentType.Conda) {
            this.info.push(new EnvironmentInfo('Name', path.basename(env.envPath)));
        }
        if (env.version?.raw) {
            this.info.push(new EnvironmentInfo('Version', env.version.raw));
        }
        if (!isEmptyCondaEnv && env.architecture !== Architecture.Unknown) {
            this.info.push(
                new EnvironmentInfo('Architecture', env.architecture === Architecture.x64 ? '64-bit' : '32-bit'),
            );
        }
        if (!isEmptyCondaEnv && env.path) {
            this.info.push(new EnvironmentInfo('Executable', getDisplayPath(env.path)));
        }
        if (!isEmptyCondaEnv && env.sysPrefix) {
            this.info.push(new EnvironmentInfo('SysPrefix', getDisplayPath(env.sysPrefix)));
        }
        if (env.pipEnvWorkspaceFolder) {
            this.info.push(new EnvironmentInfo('Folder', getDisplayPath(env.pipEnvWorkspaceFolder)));
        }
        this.info.push(new EnvironmentInfo('Environment Type', getEnvironmentTypeName(env.envType)));
    }
}
class PackageWrapper {
    constructor(public readonly env: PythonEnvironment) { }
}
type Node =
    | EnvironmentType
    | EnvironmentWrapper
    | EnvironmentInformationWrapper
    | EnvironmentInfo
    | Package
    | PackageWrapper;

function getEnvLabel(env: PythonEnvironment) {
    return env.envName ||
        path.basename(env.envPath || '') ||
        path.basename(path.dirname(path.dirname(env.path)))

}
@injectable()
export class PythonEnvironmentTreeDataProvider implements TreeDataProvider<Node> {
    public static environments: PythonEnvironment[];

    public static instance: PythonEnvironmentTreeDataProvider;

    // private readonly workspaceFolders = new Map<string, WorkspaceFolderWrapper>();

    private readonly interpreterInfo = new Map<string, EnvironmentWrapper>();

    private condaInfo?: CondaInfo;

    private pyEnvVersion?: string;

    private readonly environmentTypes = new Map<EnvironmentType, EnvironmentTypeWrapper>();

    constructor(
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        private readonly context: ExtensionContext
    ) {
        PythonEnvironmentTreeDataProvider.instance = this;
        this.refreshInternal();
    }

    private readonly _changeTreeData = new EventEmitter<Node | void | undefined | null>();

    public readonly onDidChangeTreeData = this._changeTreeData.event;

    public dispose() {
        this._changeTreeData.dispose();
    }

    // eslint-disable-next-line class-methods-use-this
    async getTreeItem(element: Node): Promise<TreeItem> {
        if (element instanceof EnvironmentWrapper) {
            const version = element.env.version?.raw || '';
            const label = getEnvLabel(element.env);
            const tree = new TreeItem(label + (version ? ` (${version})` : ''), TreeItemCollapsibleState.Collapsed);
            const isEmptyCondaEnv = element.env.envType === EnvironmentType.Conda && !element.env.sysVersion;
            const executable = getDisplayPath(isEmptyCondaEnv ? element.env.envPath || element.env.path : element.env.path);
            tree.tooltip = [version, executable].filter((item) => !!item).join('\n');
            // If its a conda, env we can have conda envs without python, in such cases the version is empty.
            tree.description = executable;
            // tree.contextValue = `env`;
            const deleteContext = canEnvBeDeleted(element.env.envType) ? 'canBeDeleted' : 'cannotBeDeleted';
            tree.contextValue = `env:${deleteContext}:${element.env.envType}`;
            tree.iconPath = Uri.file(path.join(EXTENSION_ROOT_DIR, 'resources/logo.svg'));
            return tree;
        }
        if (element instanceof EnvironmentInformationWrapper) {
            const tree = new TreeItem('Info', TreeItemCollapsibleState.Collapsed);
            tree.contextValue = 'envInfo';
            tree.iconPath = new ThemeIcon('info');
            return tree;
        }
        if (element instanceof Package) {
            const tree = new TreeItem(element.pkg.name);
            tree.contextValue = 'package';
            tree.description = element.pkg.version;
            if ('channel' in element.pkg) {
                tree.tooltip = [element.pkg.channel || '', element.pkg.base_url || '']
                    .filter((item) => item.trim().length)
                    .join(': ');
            }
            tree.iconPath = new ThemeIcon('library');
            return tree;
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
            return tree;
        }
        const tree = new TreeItem(getEnvironmentTypeName(element), TreeItemCollapsibleState.Collapsed);
        const createContext = canEnvBeCreated(element) ? 'canCreate' : 'cannotCreate';
        tree.contextValue = `envType:${createContext}:${element}`;
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
            return element.info;
        }
        if (element instanceof EnvironmentInfo) {
            return [];
        }
        if (element instanceof EnvironmentWrapper) {
            return [new EnvironmentInformationWrapper(element.env), new PackageWrapper(element.env)];
        }
        if (element instanceof PackageWrapper) {
            return getPackages(element.env).then((pkgs) => pkgs.map((pkg) => new Package(pkg)));
        }
        const envType = this.environmentTypes.get(element);
        return envType
            ? Array.from(envType.environments)
                .map((key) => this.interpreterInfo.get(key)!)
                .sort((a, b) => getEnvLabel(a.env).localeCompare(getEnvLabel(b.env)))
            : [];
    }

    public async refresh(clearCache = false) {
        await this.interpreterService.triggerRefresh({ clearCache });
        await this.refreshInternal(clearCache);
    }

    private async refreshInternal(clearCache = false) {
        void this.refreshToolVersions();
        const environments = await this.refreshEnvironments();
        this.buildEnvironments(environments);
        await clearCacheIfNewVersionInstalled(this.context, clearCache);
        await this.refreshToolVersions();
    }

    private async refreshToolVersions() {
        await getCondaVersion().then((info) => {
            if (info) {
                this.condaInfo = info;
                if (this.environmentTypes.has(EnvironmentType.Conda)) {
                    this._changeTreeData.fire(EnvironmentType.Conda);
                }
            }
        }).catch(noop);
        await getPyEnvVersion().then((version) => {
            if (version) {
                this.pyEnvVersion = version;
                if (this.environmentTypes.has(EnvironmentType.Pyenv)) {
                    this._changeTreeData.fire(EnvironmentType.Pyenv);
                }
            }
        }).catch(noop);
    }

    private buildEnvironments(environments: PythonEnvironment[]) {
        PythonEnvironmentTreeDataProvider.environments = environments;
        const updatedEnvironments = new Set<string>();
        let updated = false;
        const latestEnvTypes = new Set<EnvironmentType>();
        const latestEnvironments = new Set<string>();
        environments.forEach((environment) => {
            const key = getEnvironmentId(environment);
            latestEnvTypes.add(environment.envType);
            latestEnvironments.add(key);

            const existing = this.interpreterInfo.get(key);
            if (existing) {
                if (JSON.stringify(existing.env) !== JSON.stringify(environment)) {
                    existing.env = environment;
                    updatedEnvironments.add(key);
                }
            } else {
                updated = true;
                updatedEnvironments.add(key);
                this.interpreterInfo.set(key, new EnvironmentWrapper(environment));
            }
            const type = environment.envType;
            let typeWrapper = this.environmentTypes.get(type);
            if (!typeWrapper) {
                updated = true;
                typeWrapper = new EnvironmentTypeWrapper(type);
                typeWrapper.environments.add(key);
                this.environmentTypes.set(type, typeWrapper);
            } else if (!typeWrapper.environments.has(key)) {
                updated = true;
                typeWrapper.environments.add(key);
            }
        });
        if (latestEnvTypes.size !== this.environmentTypes.size) {
            Array.from(this.environmentTypes.keys())
                .filter((envType) => !latestEnvTypes.has(envType))
                .forEach((envType) => {
                    this.environmentTypes.delete(envType);
                    updated = true;
                });
        }
        // Ensure we remove old environments that are no longer valid.
        this.environmentTypes.forEach((envType) => {
            Array.from(envType.environments)
                .filter((envId) => !latestEnvironments.has(envId))
                .forEach((envId) => {
                    envType.environments.delete(envId);
                    updated = true;
                });
        });

        if (updated) {
            this._changeTreeData.fire();
        }
    }

    private async refreshEnvironments() {
        const cachedEnvironments: PythonEnvironment[] = [];
        const cachedEnvsPromise = Promise.all(
            this.context.globalState.get<PythonEnvironment[]>(EnvironmentsCacheMementoKey, []).map(async (environment) => {
                if (await fs.pathExists(environment.path)) {
                    cachedEnvironments.push(environment);
                }
            }),
        );
        const interpreters = await Promise.all([
            ...(workspace.workspaceFolders || ([] as WorkspaceFolder[])).map(async (folder) =>
                this.interpreterService.getAllInterpreters(folder.uri),
            ),

            this.interpreterService.getAllInterpreters(undefined),
        ]);
        await cachedEnvsPromise.catch(noop);
        // Remove duplicates.
        const uniqueInterpreters = new Map<string, PythonEnvironment>();

        // Include virtual environments from other workspace folders.
        cachedEnvironments.forEach((environment) => uniqueInterpreters.set(getEnvironmentId(environment), environment));
        flatten(interpreters).forEach((environment) =>
            uniqueInterpreters.set(getEnvironmentId(environment), environment),
        );

        const environments = Array.from(uniqueInterpreters.values());
        // This way we can view virtual environments (or any other environment) across other folders.
        await this.context.globalState.update(EnvironmentsCacheMementoKey, environments);
        return environments;
    }
}


export async function refreshUntilNewEnvIsAvailable(expectedEnvInfo: { name?: string; path?: string; type: EnvironmentType }) {
    const initialEnvCount = PythonEnvironmentTreeDataProvider.environments.length;

    const isEnvAvailable = () => {
        if (!expectedEnvInfo.path && !expectedEnvInfo.name) {
            return true;
        }
        if (PythonEnvironmentTreeDataProvider.environments.length > initialEnvCount) {
            return true;
        }
        return PythonEnvironmentTreeDataProvider.environments.some(env => {
            if (expectedEnvInfo.type !== env.envType) {
                return
            }
            if (expectedEnvInfo.name && env.envName && env.envName.includes(expectedEnvInfo.name)) {
                return true;
            }
            if (expectedEnvInfo.path && (env.envPath || env.path).includes(expectedEnvInfo.path)) {
                return true;
            }
            return false;
        })
    }

    // Discovering new conda envs can be a little slow.
    for (let index = 0; index < 5; index += 1) {
        await PythonEnvironmentTreeDataProvider.instance.refresh();
        if (isEnvAvailable()) {
            return;
        }
        sleep(2_000);
    }
}
