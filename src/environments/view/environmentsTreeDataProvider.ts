/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */

import { injectable } from 'inversify';
import { PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import {
    Disposable,
    EventEmitter,
    ExtensionContext,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    commands,
} from 'vscode';
import { CondaInfo } from '../../client/pythonEnvironments/common/environmentManagers/conda';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { getCondaVersion } from '../tools/conda';
import { noop } from '../../client/common/utils/misc';
import { clearCacheIfNewVersionInstalled } from '../cache';
import { sleep } from '../../client/common/utils/async';
import { getEnvironmentType, isNonPythonCondaEnvironment } from '../utils';
import { IServiceContainer } from '../../client/ioc/types';
import { getPyEnvVersion } from '../tools/pyenv';
import { canEnvBeCreated } from '../envCreation';
import { PythonEnvironmentTreeNode, EnvironmentWrapper, EnvironmentTypeWrapper, getEnvLabel } from './types';
import { PythonEnvironmentTreeDataProvider } from './envTreeDataProvider';
import { canCreateVenv } from '../../client/pythonEnvironments/creation/provider/venvCreationProvider';
import { canEnvBeDeleted } from '../envDeletion';
import { getPoetryVersion } from '../tools/poetry';

@injectable()
export class PythonEnvironmentsTreeDataProvider implements TreeDataProvider<PythonEnvironmentTreeNode> {
    public static environments: ResolvedEnvironment[];
    public static instance: PythonEnvironmentsTreeDataProvider;
    private readonly interpreterInfo = new Map<string, EnvironmentWrapper>();
    private condaInfo?: CondaInfo;
    private pyEnvVersion?: string;
    private poetryVersion?: string;
    private readonly disposables: Disposable[] = [];
    private readonly environmentTypes = new Map<EnvironmentType, EnvironmentTypeWrapper>();
    private readonly envTreeDataProvider: PythonEnvironmentTreeDataProvider;
    private readonly _changeTreeData = new EventEmitter<PythonEnvironmentTreeNode | void | undefined | null>();
    public readonly onDidChangeTreeData = this._changeTreeData.event;
    private refreshing = false;
    constructor(
        private readonly context: ExtensionContext,
        private readonly api: PythonExtension,
        private readonly iocContainer: IServiceContainer,
    ) {
        this.envTreeDataProvider = new PythonEnvironmentTreeDataProvider(api);
        this.envTreeDataProvider.onDidChangeTreeData((e) => this._changeTreeData.fire(e), this, this.disposables);
        PythonEnvironmentsTreeDataProvider.instance = this;
        this.refresh(false);
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
                    const envType = getEnvironmentType(e.env);
                    if (!this.environmentTypes.has(envType)) {
                        this._changeTreeData.fire();
                    }
                }
            },
            this,
            this.disposables,
        );
        this.rebuildEnvironmentTypesIfRequired();
        // api.environments.
    }
    public triggerChanges(node: PythonEnvironmentTreeNode) {
        this._changeTreeData.fire(node);
    }

    public dispose() {
        this._changeTreeData.dispose();
        this.envTreeDataProvider.dispose();
    }

    private rebuildEnvironmentTypesIfRequired() {
        const envs = new Set(this.api.environments.known.map((item) => getEnvironmentType(item)));
        if (envs.size !== this.environmentTypes.size) {
            if (
                !envs.has(EnvironmentType.Venv) &&
                !this.environmentTypes.has(EnvironmentType.Venv) &&
                canCreateVenv(this.api.environments.known)
            ) {
                envs.add(EnvironmentType.Venv);
            }
            Array.from(envs)
                .filter((type) => !this.environmentTypes.has(type))
                .forEach((type) => this.environmentTypes.set(type, new EnvironmentTypeWrapper(type)));
            this._changeTreeData.fire();
        }
    }
    public changeTreeData(item: PythonEnvironmentTreeNode) {
        this._changeTreeData.fire(item);
    }
    async getTreeItem(element: PythonEnvironmentTreeNode): Promise<TreeItem> {
        if (typeof element === 'string') {
            const tree = new TreeItem(element === EnvironmentType.Unknown ? 'Global' : element, TreeItemCollapsibleState.Collapsed);
            const createContext = canEnvBeCreated(element) ? 'canCreate' : 'cannotCreate';
            tree.contextValue = `envType:${createContext}:${element} `;
            if (element === EnvironmentType.Conda && this.condaInfo) {
                tree.description = this.condaInfo.conda_version;
            } else if (element === EnvironmentType.Pyenv && this.pyEnvVersion) {
                tree.description = this.pyEnvVersion;
            } else if (element === EnvironmentType.Poetry && this.poetryVersion) {
                tree.description = this.poetryVersion;
            }
            tree.iconPath = new ThemeIcon('folder-library');
            return tree;
        }
        return this.envTreeDataProvider.getTreeItem(element);
    }

    public async getChildren(element?: PythonEnvironmentTreeNode): Promise<PythonEnvironmentTreeNode[]> {
        if (!element) {
            return Array.from(this.environmentTypes.keys()).sort();
        }
        if (typeof element !== 'string') {
            return this.envTreeDataProvider.getChildren(element);
        }
        return this.api.environments.known
            .filter((env) => getEnvironmentType(env) === element)
            .sort((a, b) => getEnvLabel(a).localeCompare(getEnvLabel(b)))
            .map((env) => {
                if (!this.interpreterInfo.has(env.id)) {
                    this.interpreterInfo.set(env.id, new EnvironmentWrapper(env, canEnvBeDeleted));
                }
                return this.interpreterInfo.get(env.id)!;
            })
            .sort((a, b) => {
                if (isNonPythonCondaEnvironment(a.env) && !isNonPythonCondaEnvironment(b.env)) {
                    return 1;
                }
                if (!isNonPythonCondaEnvironment(a.env) && isNonPythonCondaEnvironment(b.env)) {
                    return -1;
                }
                return (a.asTreeItem(this.api).label || '')
                    .toString()
                    .localeCompare((b.asTreeItem(this.api).label || '').toString());
            });
    }
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
            this._changeTreeData.fire();
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
        getPoetryVersion()
            .then((version) => {
                if (version) {
                    this.poetryVersion = version;
                    if (this.environmentTypes.has(EnvironmentType.Poetry)) {
                        this._changeTreeData.fire(EnvironmentType.Poetry);
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
    const initialEnvCount = PythonEnvironmentsTreeDataProvider.environments.length;

    const isEnvAvailable = () => {
        if (!expectedEnvInfo.path && !expectedEnvInfo.name) {
            return true;
        }
        if (PythonEnvironmentsTreeDataProvider.environments.length > initialEnvCount) {
            return true;
        }
        return PythonEnvironmentsTreeDataProvider.environments.some((env) => {
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
        await PythonEnvironmentsTreeDataProvider.instance.refresh();
        if (isEnvAvailable()) {
            return;
        }
        sleep(2_000);
    }
}
