import { SemVer } from 'semver';
import { CodeLensProvider, ConfigurationTarget, Disposable, Event, TextDocument, Uri } from 'vscode';
import { FileChangeType } from '../common/platform/fileSystemWatcher';
import { Resource } from '../common/types';
import { PythonEnvSource } from '../pythonEnvironments/base/info';
import { PythonLocatorQuery } from '../pythonEnvironments/base/locator';
import { CondaEnvironmentInfo } from '../pythonEnvironments/common/environmentManagers/conda';
import { EnvironmentType, PythonEnvironment } from '../pythonEnvironments/info';

export type PythonEnvironmentsChangedEvent = {
    type?: FileChangeType;
    resource?: Uri;
    old?: PythonEnvironment;
    new?: PythonEnvironment | undefined;
};

export const IComponentAdapter = Symbol('IComponentAdapter');
export interface IComponentAdapter {
    readonly onRefreshStart: Event<void>;
    triggerRefresh(query?: PythonLocatorQuery): Promise<void>;
    readonly refreshPromise: Promise<void> | undefined;
    readonly onChanged: Event<PythonEnvironmentsChangedEvent>;
    // VirtualEnvPrompt
    onDidCreate(resource: Resource, callback: () => void): Disposable;
    // IInterpreterLocatorService
    hasInterpreters(filter?: (e: PythonEnvironment) => Promise<boolean>): Promise<boolean>;
    getInterpreters(resource?: Uri, source?: PythonEnvSource[]): PythonEnvironment[];

    // WorkspaceVirtualEnvInterpretersAutoSelectionRule
    getWorkspaceVirtualEnvInterpreters(
        resource: Uri,
        options?: { ignoreCache?: boolean },
    ): Promise<PythonEnvironment[]>;

    // IInterpreterService
    getInterpreterDetails(pythonPath: string): Promise<PythonEnvironment | undefined>;

    // IInterpreterHelper
    // Undefined is expected on this API, if the environment info retrieval fails.
    getInterpreterInformation(pythonPath: string): Promise<Partial<PythonEnvironment> | undefined>;

    isMacDefaultPythonPath(pythonPath: string): Promise<boolean>;

    // ICondaService
    isCondaEnvironment(interpreterPath: string): Promise<boolean>;
    // Undefined is expected on this API, if the environment is not conda env.
    getCondaEnvironment(interpreterPath: string): Promise<CondaEnvironmentInfo | undefined>;

    isWindowsStoreInterpreter(pythonPath: string): Promise<boolean>;
}

export const ICondaService = Symbol('ICondaService');
/**
 * Interface carries the properties which are not available via the discovery component interface.
 */
export interface ICondaService {
    getCondaFile(): Promise<string>;
    isCondaAvailable(): Promise<boolean>;
    getCondaVersion(): Promise<SemVer | undefined>;
    getCondaFileFromInterpreter(interpreterPath?: string, envName?: string): Promise<string | undefined>;
}

export const IInterpreterService = Symbol('IInterpreterService');
export interface IInterpreterService {
    readonly onRefreshStart: Event<void>;
    triggerRefresh(query?: PythonLocatorQuery): Promise<void>;
    readonly refreshPromise: Promise<void> | undefined;
    readonly onDidChangeInterpreters: Event<PythonEnvironmentsChangedEvent>;
    onDidChangeInterpreterConfiguration: Event<Uri | undefined>;
    onDidChangeInterpreter: Event<void>;
    onDidChangeInterpreterInformation: Event<PythonEnvironment>;
    hasInterpreters(filter?: (e: PythonEnvironment) => Promise<boolean>): Promise<boolean>;
    getInterpreters(resource?: Uri): PythonEnvironment[];
    getAllInterpreters(resource?: Uri): Promise<PythonEnvironment[]>;
    getActiveInterpreter(resource?: Uri): Promise<PythonEnvironment | undefined>;
    getInterpreterDetails(pythonPath: string, resoure?: Uri): Promise<undefined | PythonEnvironment>;
    refresh(resource: Resource): Promise<void>;
    initialize(): void;
}

export const IShebangCodeLensProvider = Symbol('IShebangCodeLensProvider');
export interface IShebangCodeLensProvider extends CodeLensProvider {
    detectShebang(document: TextDocument, resolveShebangAsInterpreter?: boolean): Promise<string | undefined>;
}

export const IInterpreterHelper = Symbol('IInterpreterHelper');
export interface IInterpreterHelper {
    getActiveWorkspaceUri(resource: Resource): WorkspacePythonPath | undefined;
    getInterpreterInformation(pythonPath: string): Promise<undefined | Partial<PythonEnvironment>>;
    isMacDefaultPythonPath(pythonPath: string): Promise<boolean>;
    getInterpreterTypeDisplayName(interpreterType: EnvironmentType): string | undefined;
    getBestInterpreter(interpreters?: PythonEnvironment[]): PythonEnvironment | undefined;
}

export const IInterpreterStatusbarVisibilityFilter = Symbol('IInterpreterStatusbarVisibilityFilter');
/**
 * Implement this interface to control the visibility of the interpreter statusbar.
 */
export interface IInterpreterStatusbarVisibilityFilter {
    readonly changed?: Event<void>;
    readonly hidden: boolean;
}

export type WorkspacePythonPath = {
    folderUri: Uri;
    configTarget: ConfigurationTarget.Workspace | ConfigurationTarget.WorkspaceFolder;
};
