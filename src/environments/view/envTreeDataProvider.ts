/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */

import { injectable } from 'inversify';
import { PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import {
    Disposable,
    EventEmitter,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from 'vscode';
import { CondaInfo } from '../../client/pythonEnvironments/common/environmentManagers/conda';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { createDeferred } from '../../client/common/utils/async';
import { getOutdatedPackages, getPackages } from '../packages';
import { canEnvBeCreated } from '../envCreation';
import { traceError } from '../../client/logging';
import { PythonEnvironmentTreeNode, EnvironmentWrapper, Package, PackageWrapper, EnvironmentInformationWrapper, EnvironmentInfo, getEnvironmentInfo } from './types';
import { disposeAll } from '../../client/common/utils/resourceLifecycle';
import { isNonPythonCondaEnvironment } from '../utils';

@injectable()
export class PythonEnvironmentTreeDataProvider implements TreeDataProvider<PythonEnvironmentTreeNode> {
    public static environments: ResolvedEnvironment[];
    private condaInfo?: CondaInfo;
    private pyEnvVersion?: string;
    private readonly disposables: Disposable[] = [];
    private readonly outdatedPackages = new Map<string, Map<string, string>>();
    private readonly _changeTreeData = new EventEmitter<PythonEnvironmentTreeNode | void | undefined | null>();
    public readonly onDidChangeTreeData = this._changeTreeData.event;
    constructor(private readonly api: PythonExtension,) { }

    public dispose() {
        this._changeTreeData.dispose();
        disposeAll(this.disposables);
    }

    async getTreeItem(element: PythonEnvironmentTreeNode): Promise<TreeItem> {
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
            if (isNonPythonCondaEnvironment(element.env)) {
                tree.contextValue = `${tree.contextValue.trim()}:isNonPythonCondaEnvironment`
            }

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

    public async getChildren(element?: PythonEnvironmentTreeNode): Promise<PythonEnvironmentTreeNode[]> {
        if (!element) {
            return [];
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
            if (isNonPythonCondaEnvironment(element.env)) {
                return [new EnvironmentInformationWrapper(element.env)];
            }
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
        debugger;
        return []
    }

}
