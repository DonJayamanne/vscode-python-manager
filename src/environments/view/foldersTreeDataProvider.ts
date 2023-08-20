// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable max-classes-per-file */
import { EventEmitter, ExtensionContext, ProviderResult, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, WorkspaceFolder, commands, workspace } from 'vscode';
import { PythonExtension } from '@vscode/python-extension';
import { EnvironmentWrapper, PythonEnvironmentTreeNode } from './types';
import { PythonEnvironmentTreeDataProvider } from './envTreeDataProvider';
import { IDisposable } from '../../client/common/types';
import { disposeAll } from '../../client/common/utils/resourceLifecycle';
import { clearCacheIfNewVersionInstalled } from '../cache';
import { noop } from '../../client/common/utils/misc';

export type WorkspaceFoldersTreeNode =
    | WorkspaceFolderWrapper
    | ActiveWorkspaceEnvironment
    | WorkspaceFolderEnvironments
    | PythonEnvironmentTreeNode;

export class ActiveWorkspaceEnvironment {
    constructor(public readonly folder: WorkspaceFolder, private readonly api: PythonExtension) { }
    public asNode(api: PythonExtension = this.api) {
        const envPath = api.environments.getActiveEnvironmentPath(this.folder.uri)
        const env = envPath ? api.environments.known.find(e => e.id === envPath.id) : undefined;
        if (env) {
            return new EnvironmentWrapper(env, true, this.folder);
        }
    }
    public asTreeItem(api: PythonExtension, envTreeProvider: PythonEnvironmentTreeDataProvider) {
        const env = this.asNode(api);
        if (env) {
            return envTreeProvider.getTreeItem(env)
        }
        const tree = new TreeItem(`No Active Environment ${this.folder.name}`, TreeItemCollapsibleState.Collapsed);
        // tree.description = 'Environment no longer found, please try refreshing';
        tree.iconPath = new ThemeIcon('folder');
        return tree;
    }

}
export class WorkspaceFolderWrapper {
    constructor(public readonly folder: WorkspaceFolder) { }
    public asTreeItem(api: PythonExtension) {
        if (workspace.workspaceFolders?.length === 1) {
            const envPath = api.environments.getActiveEnvironmentPath(this.folder.uri)
            const env = envPath ? api.environments.known.find(e => e.id === envPath.id) : undefined;
            if (env) {
                return new EnvironmentWrapper(env).asTreeItem(api);
            }
        }
        const tree = new TreeItem(this.folder.name, TreeItemCollapsibleState.Collapsed);
        // tree.description = 'Environment no longer found, please try refreshing';
        tree.iconPath = new ThemeIcon('folder');
        return tree;
    }
}
export class WorkspaceFolderEnvironments {
    constructor(public readonly folder: WorkspaceFolder) { }

    public asTreeItem() {
        const tree = new TreeItem('Workspace Envs', TreeItemCollapsibleState.Collapsed);
        // tree.description = 'Environment no longer found, please try refreshing';
        tree.iconPath = new ThemeIcon('folder');
        return tree;
    }
}

export class WorkspaceFoldersTreeDataProvider implements TreeDataProvider<WorkspaceFoldersTreeNode> {
    private readonly _changeTreeData = new EventEmitter<WorkspaceFoldersTreeNode | void | undefined | null>();
    public readonly onDidChangeTreeData = this._changeTreeData.event;
    private readonly envTreeDataProvider: PythonEnvironmentTreeDataProvider;
    private readonly disposables: IDisposable[] = [];
    private readonly activeWorkspaceEnvs = new Map<string, ActiveWorkspaceEnvironment>();
    public static instance: WorkspaceFoldersTreeDataProvider;
    private refreshing = false;
    constructor(private readonly context: ExtensionContext, private readonly api: PythonExtension) {
        WorkspaceFoldersTreeDataProvider.instance = this;
        this.envTreeDataProvider = new PythonEnvironmentTreeDataProvider(api);
        this.envTreeDataProvider.onDidChangeTreeData((e) => this._changeTreeData.fire(e), this, this.disposables);
        api.environments.onDidChangeActiveEnvironmentPath(e => {
            if (!Array.isArray(workspace.workspaceFolders) || workspace.workspaceFolders.length <= 1) {
                this._changeTreeData.fire();
            } else {
                const node = e.resource && this.activeWorkspaceEnvs.get(e.resource.uri.toString());
                if (node) {
                    this._changeTreeData.fire(node);
                }
            }
        })
    }
    public triggerChanges(node: WorkspaceFoldersTreeNode) {
        this._changeTreeData.fire(node);
    }
    public async refresh(clearCache = false) {
        if (this.refreshing) {
            return;
        }
        this.refreshing = true;
        commands.executeCommand('setContext', 'isRefreshingPythonEnvironments', true);
        try {
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
    refreshToolVersions() {
        throw new Error('Method not implemented.');
    }
    public dispose() {
        disposeAll(this.disposables);
    }
    async getTreeItem(element: WorkspaceFoldersTreeNode): Promise<TreeItem> {
        if (element instanceof WorkspaceFolderWrapper || element instanceof WorkspaceFolderEnvironments || element instanceof ActiveWorkspaceEnvironment) {
            return element.asTreeItem(this.api, this.envTreeDataProvider);
        }
        return this.envTreeDataProvider.getTreeItem(element);
    }
    private getWorkspaceActiveEnv(folder: WorkspaceFolder) {
        const item = this.activeWorkspaceEnvs.get(folder.uri.toString()) || new ActiveWorkspaceEnvironment(folder, this.api);
        this.activeWorkspaceEnvs.set(folder.uri.toString(), item);
        return item;
    }
    getChildren(element?: WorkspaceFoldersTreeNode | undefined): ProviderResult<WorkspaceFoldersTreeNode[]> {
        if (!element) {
            if (!Array.isArray(workspace.workspaceFolders) || !workspace.workspaceFolders.length) {
                return [];
            }
            if (Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 1) {
                return workspace.workspaceFolders.map(e => new WorkspaceFolderWrapper(e));
            }
            const folderUri: WorkspaceFolder = workspace.workspaceFolders[0];
            const workspaceEnvs = this.api.environments.known.filter(e => e.environment?.folderUri?.fsPath?.toLowerCase()?.startsWith(folderUri.uri.fsPath.toLowerCase()))

            const items: WorkspaceFoldersTreeNode[] = [this.getWorkspaceActiveEnv(folderUri)];
            if (workspaceEnvs.length) {
                items.push(new WorkspaceFolderEnvironments(folderUri));
            }
            return items;
        }
        if (element instanceof WorkspaceFolderEnvironments) {
            return this.api.environments.known.filter(e => {
                if (!e.environment?.folderUri) {
                    return false;
                }
                return e.environment.folderUri.fsPath.toLowerCase().startsWith(element.folder.uri.fsPath.toLowerCase());
            }).map(e => new EnvironmentWrapper(e, undefined, element.folder));
        }
        if (element instanceof ActiveWorkspaceEnvironment) {
            const env = element.asNode(this.api);
            return env ? this.envTreeDataProvider.getChildren(env) : [];
        }
        if (element instanceof WorkspaceFolderWrapper) {
            const items: WorkspaceFoldersTreeNode[] = [this.getWorkspaceActiveEnv(element.folder)];
            const workspaceEnvs = this.api.environments.known.filter(e => e.environment?.folderUri?.fsPath?.toLowerCase()?.startsWith(element.folder.uri.fsPath.toLowerCase()))
            if (workspaceEnvs.length) {
                items.push(new WorkspaceFolderEnvironments(element.folder));
            }
            return items;

            // const items = this.api.environments.known.filter(e => {
            //     if (!e.environment?.folderUri) {
            //         return false;
            //     }
            //     return e.environment.folderUri.fsPath.toLowerCase().startsWith(element.folder.uri.fsPath.toLowerCase());
            // }).map(e => new EnvironmentWrapper(e)).sort((a, b) => {
            //     if (isNonPythonCondaEnvironment(a.env) && !isNonPythonCondaEnvironment(b.env)) {
            //         return 1;
            //     }
            //     if (!isNonPythonCondaEnvironment(a.env) && isNonPythonCondaEnvironment(b.env)) {
            //         return -1;
            //     }
            //     return (a.asTreeItem(this.api).label || '').toString().localeCompare((b.asTreeItem(this.api).label || '').toString())
            // });
            // return items;
        }
        return this.envTreeDataProvider.getChildren(element)
    }
    // getParent?(element: WorkspaceFoldersTreeNode): ProviderResult<WorkspaceFoldersTreeNode> {
    //     throw new Error('Method not implemented.');
    // }
    // resolveTreeItem?(item: TreeItem, element: WorkspaceFoldersTreeNode, token: CancellationToken): ProviderResult<TreeItem> {
    //     throw new Error('Method not implemented.');
    // }
}
