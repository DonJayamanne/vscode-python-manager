// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Socket } from 'net';
import { Request as RequestResult } from 'request';
import {
    CancellationToken,
    ConfigurationTarget,
    Disposable,
    DocumentSymbolProvider,
    Event,
    Extension,
    ExtensionContext,
    OutputChannel,
    Uri,
    WorkspaceEdit,
} from 'vscode';
import type { InterpreterUri, ModuleInstallFlags } from './installer/types';
import { EnvironmentVariables } from './variables/types';

export const IOutputChannel = Symbol('IOutputChannel');
export interface IOutputChannel extends OutputChannel {}
export const IDocumentSymbolProvider = Symbol('IDocumentSymbolProvider');
export interface IDocumentSymbolProvider extends DocumentSymbolProvider {}
export const IsWindows = Symbol('IS_WINDOWS');
export const IDisposableRegistry = Symbol('IDisposableRegistry');
export type IDisposableRegistry = Disposable[];
export const IMemento = Symbol('IGlobalMemento');
export const GLOBAL_MEMENTO = Symbol('IGlobalMemento');
export const WORKSPACE_MEMENTO = Symbol('IWorkspaceMemento');

export type Resource = Uri | undefined;
export interface IPersistentState<T> {
    readonly value: T;
    updateValue(value: T): Promise<void>;
}

export type ReadWrite<T> = {
    -readonly [P in keyof T]: T[P];
};

export const IPersistentStateFactory = Symbol('IPersistentStateFactory');

export interface IPersistentStateFactory {
    createGlobalPersistentState<T>(key: string, defaultValue?: T, expiryDurationMs?: number): IPersistentState<T>;
    createWorkspacePersistentState<T>(key: string, defaultValue?: T, expiryDurationMs?: number): IPersistentState<T>;
}

export type ExecutionInfo = {
    execPath?: string;
    moduleName?: string;
    args: string[];
    product?: Product;
};

export enum InstallerResponse {
    Installed,
    Disabled,
    Ignore,
}

export enum ProductInstallStatus {
    Installed,
    NotInstalled,
    NeedsUpgrade,
}

export enum ProductType {
    DataScience = 'DataScience',
}

export enum Product {
    pytest = 1,
    pylint = 3,
    flake8 = 4,
    pycodestyle = 5,
    pylama = 6,
    prospector = 7,
    pydocstyle = 8,
    yapf = 9,
    autopep8 = 10,
    mypy = 11,
    unittest = 12,
    isort = 15,
    black = 16,
    bandit = 17,
    jupyter = 18,
    ipykernel = 19,
    notebook = 20,
    kernelspec = 21,
    nbconvert = 22,
    pandas = 23,
    tensorboard = 24,
    torchProfilerInstallName = 25,
    torchProfilerImportName = 26,
    pip = 27,
    ensurepip = 28,
}

export const IInstaller = Symbol('IInstaller');

export interface IInstaller {
    promptToInstall(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse>;
    install(
        product: Product,
        resource?: InterpreterUri,
        cancel?: CancellationToken,
        flags?: ModuleInstallFlags,
    ): Promise<InstallerResponse>;
    isInstalled(product: Product, resource?: InterpreterUri): Promise<boolean>;
    isProductVersionCompatible(
        product: Product,
        semVerRequirement: string,
        resource?: InterpreterUri,
    ): Promise<ProductInstallStatus>;
    translateProductToModuleName(product: Product): string;
}

// TODO: Drop IPathUtils in favor of IFileSystemPathUtils.
// See https://github.com/microsoft/vscode-python/issues/8542.
export const IPathUtils = Symbol('IPathUtils');
export interface IPathUtils {
    readonly delimiter: string;
    readonly home: string;
    /**
     * The platform-specific file separator. '\\' or '/'.
     * @type {string}
     * @memberof IPathUtils
     */
    readonly separator: string;
    getPathVariableName(): 'Path' | 'PATH';
    basename(pathValue: string, ext?: string): string;
    getDisplayName(pathValue: string, cwd?: string): string;
}

export const IRandom = Symbol('IRandom');
export interface IRandom {
    getRandomInt(min?: number, max?: number): number;
}

export const ICurrentProcess = Symbol('ICurrentProcess');
export interface ICurrentProcess {
    readonly env: EnvironmentVariables;
    readonly argv: string[];
    readonly stdout: NodeJS.WriteStream;
    readonly stdin: NodeJS.ReadStream;
    readonly execPath: string;
    // eslint-disable-next-line @typescript-eslint/ban-types
    on(event: string | symbol, listener: Function): this;
}

export interface IPythonSettings {
    readonly pythonPath: string;
    readonly venvPath: string;
    readonly venvFolders: string[];
    readonly condaPath: string;
    readonly pipenvPath: string;
    readonly poetryPath: string;
    readonly terminal: ITerminalSettings;
    readonly disableInstallationChecks: boolean;
    readonly globalModuleInstallation: boolean;
    readonly onDidChange: Event<void>;
    readonly defaultInterpreterPath: string;
    initialize(): void;
}

export interface ITerminalSettings {
    readonly executeInFileDir: boolean;
    readonly launchArgs: string[];
    readonly activateEnvironment: boolean;
    readonly activateEnvInCurrentTerminal: boolean;
}

export const IConfigurationService = Symbol('IConfigurationService');
export interface IConfigurationService {
    getSettings(resource?: Uri): IPythonSettings;
    isTestExecution(): boolean;
    updateSetting(setting: string, value?: unknown, resource?: Uri, configTarget?: ConfigurationTarget): Promise<void>;
    updateSectionSetting(
        section: string,
        setting: string,
        value?: unknown,
        resource?: Uri,
        configTarget?: ConfigurationTarget,
    ): Promise<void>;
}

/**
 * Carries various tool execution path settings. For eg. pipenvPath, condaPath, pytestPath etc. These can be
 * potentially used in discovery, autoselection, activation, installers, execution etc. And so should be a
 * common interface to all the components.
 */
export const IToolExecutionPath = Symbol('IToolExecutionPath');
export interface IToolExecutionPath {
    readonly executable: string;
}
export enum ToolExecutionPath {
    pipenv = 'pipenv',
    // Gradually populate this list with tools as they come up.
}

export const ISocketServer = Symbol('ISocketServer');
export interface ISocketServer extends Disposable {
    readonly client: Promise<Socket>;
    Start(options?: { port?: number; host?: string }): Promise<number>;
}

export type DownloadOptions = {
    /**
     * Prefix for progress messages displayed.
     *
     * @type {('Downloading ... ' | string)}
     */
    progressMessagePrefix: 'Downloading ... ' | string;
    /**
     * Output panel into which progress information is written.
     *
     * @type {IOutputChannel}
     */
    outputChannel?: IOutputChannel;
    /**
     * Extension of file that'll be created when downloading the file.
     *
     * @type {('tmp' | string)}
     */
    extension: 'tmp' | string;
};

export const IFileDownloader = Symbol('IFileDownloader');
/**
 * File downloader, that'll display progress in the status bar.
 *
 * @export
 * @interface IFileDownloader
 */
export interface IFileDownloader {
    /**
     * Download file and display progress in statusbar.
     * Optionnally display progress in the provided output channel.
     *
     * @param {string} uri
     * @param {DownloadOptions} options
     * @returns {Promise<string>}
     * @memberof IFileDownloader
     */
    downloadFile(uri: string, options: DownloadOptions): Promise<string>;
}

export const IHttpClient = Symbol('IHttpClient');
export interface IHttpClient {
    downloadFile(uri: string): Promise<RequestResult>;
    /**
     * Downloads file from uri as string and parses them into JSON objects
     * @param uri The uri to download the JSON from
     * @param strict Set `false` to allow trailing comma and comments in the JSON, defaults to `true`
     */
    getJSON<T>(uri: string, strict?: boolean): Promise<T>;
    /**
     * Returns the url is valid (i.e. return status code of 200).
     */
    exists(uri: string): Promise<boolean>;
}

export const IExtensionContext = Symbol('ExtensionContext');
export interface IExtensionContext extends ExtensionContext {}

export const IExtensions = Symbol('IExtensions');
export interface IExtensions {
    /**
     * All extensions currently known to the system.
     */

    readonly all: readonly Extension<unknown>[];

    /**
     * An event which fires when `extensions.all` changes. This can happen when extensions are
     * installed, uninstalled, enabled or disabled.
     */
    readonly onDidChange: Event<void>;

    /**
     * Get an extension by its full identifier in the form of: `publisher.name`.
     *
     * @param extensionId An extension identifier.
     * @return An extension or `undefined`.
     */

    getExtension(extensionId: string): Extension<unknown> | undefined;

    /**
     * Get an extension its full identifier in the form of: `publisher.name`.
     *
     * @param extensionId An extension identifier.
     * @return An extension or `undefined`.
     */
    getExtension<T>(extensionId: string): Extension<T> | undefined;
}

export const IBrowserService = Symbol('IBrowserService');
export interface IBrowserService {
    launch(url: string): void;
}

export const IEditorUtils = Symbol('IEditorUtils');
export interface IEditorUtils {
    getWorkspaceEditsFromPatch(originalContents: string, patch: string, uri: Uri): WorkspaceEdit;
}

export interface IDisposable {
    dispose(): void | undefined;
}
export interface IAsyncDisposable {
    dispose(): Promise<void>;
}

/**
 * Stores hash formats
 */
export interface IHashFormat {
    number: number; // If hash format is a number
    string: string; // If hash format is a string
}

export const IAsyncDisposableRegistry = Symbol('IAsyncDisposableRegistry');
export interface IAsyncDisposableRegistry extends IAsyncDisposable {
    push(disposable: IDisposable | IAsyncDisposable): void;
}
export type InterpreterConfigurationScope = { uri: Resource; configTarget: ConfigurationTarget };
export type InspectInterpreterSettingType = {
    globalValue?: string;
    workspaceValue?: string;
    workspaceFolderValue?: string;
};

/**
 * Interface used to access current Interpreter Path
 */
export const IInterpreterPathService = Symbol('IInterpreterPathService');
export interface IInterpreterPathService {
    onDidChange: Event<InterpreterConfigurationScope>;
    get(resource: Resource): string;
    inspect(resource: Resource): InspectInterpreterSettingType;
    update(resource: Resource, configTarget: ConfigurationTarget, value: string | undefined): Promise<void>;
    copyOldInterpreterStorageValuesToNew(resource: Uri | undefined): Promise<void>;
}

/**
 * Interface used to access current Interpreter Path
 */
export const IInterpreterPathProxyService = Symbol('IInterpreterPathProxyService');
export interface IInterpreterPathProxyService {
    get(resource: Resource): string;
}
