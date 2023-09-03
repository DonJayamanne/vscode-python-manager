/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */

import { Environment, PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import * as path from 'path';
import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri, WorkspaceFolder } from 'vscode';
import { EXTENSION_ROOT_DIR } from '../../client/constants';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { getDisplayPath } from '../helpers';
import { getEnvironmentType, isCondaEnvironment, isNonPythonCondaEnvironment } from '../utils';
import { PackageInfo } from '../packages';

export type PackageStatus = 'DetectingLatestVersion' | 'UpdatingToLatest' | 'UnInstalling' | 'Updating' | undefined;
export class Package {
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
export class EnvironmentTypeWrapper {
    constructor(public readonly type: EnvironmentType) {}
}
export class EnvironmentWrapper {
    public get id() {
        return this.env.id;
    }
    constructor(
        public readonly env: Environment,
        private readonly canEnvBeDeleted: (envType: EnvironmentType) => boolean,
        private readonly isActiveEnvironment?: boolean,
        public readonly owningFolder?: WorkspaceFolder,
    ) {}

    public asTreeItem(
        api: PythonExtension,
        defaultState: TreeItemCollapsibleState = TreeItemCollapsibleState.Collapsed,
    ) {
        const env = api.environments.known.find((e) => e.id === this.env.id);
        if (!env) {
            const tree = new TreeItem('Not found', defaultState);
            tree.description = 'Environment no longer found, please try refreshing';
            tree.iconPath = new ThemeIcon('error');
            return tree;
        }
        const version = env.version ? `${env.version.major}.${env.version.minor}.${env.version.micro} ` : '';
        const label = getEnvLabel(env);
        // const activePrefix = this.isActiveEnvironment ? 'Active: ' : '';
        const activePrefix = '';
        const tree = new TreeItem(activePrefix + label + (version ? ` (${version})` : ''), defaultState);
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
        const deleteContext = this.canEnvBeDeleted(getEnvironmentType(env)) ? 'canBeDeleted' : 'cannotBeDeleted';

        tree.contextValue = `env:${deleteContext}:${getEnvironmentType(env)} `;
        if (this.isActiveEnvironment) {
            tree.contextValue = `${tree.contextValue.trim()}:isActiveEnvironment`;
        }
        if (env.executable.sysPrefix) {
            tree.contextValue = `${tree.contextValue.trim()}:hasSysPrefix`;
        }
        if (isNonPythonCondaEnvironment(this.env)) {
            tree.contextValue = `${tree.contextValue.trim()}:isNonPythonCondaEnvironment`;
        }
        const defaultIcon =
            this.isActiveEnvironment === true
                ? new ThemeIcon('star')
                : Uri.file(path.join(EXTENSION_ROOT_DIR, 'resources/logo.svg'));
        // const defaultIcon = Uri.file(path.join(EXTENSION_ROOT_DIR, 'resources/logo.svg'));
        tree.iconPath = isEmptyCondaEnv ? new ThemeIcon('warning') : defaultIcon;
        return tree;
    }
}

export class EnvironmentInfo {
    constructor(public readonly label: string, public value: string) {}
}
export class EnvironmentInformationWrapper {
    constructor(public readonly env: Environment) {}
}
export class PackageWrapper {
    public readonly packages: Package[] = [];
    constructor(public env: Environment) {}
}
export type PythonEnvironmentTreeNode =
    | EnvironmentType
    | EnvironmentWrapper
    | EnvironmentInformationWrapper
    | EnvironmentInfo
    | Package
    | PackageWrapper;

export function getEnvLabel(env: ResolvedEnvironment | Environment) {
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
export function getEnvironmentInfo(options: { api: PythonExtension; id: string } | { env: Environment }) {
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
