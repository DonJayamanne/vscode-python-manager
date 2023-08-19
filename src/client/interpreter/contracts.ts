import { SemVer } from 'semver';
import { ConfigurationTarget, Disposable, Event, Uri } from 'vscode';
import { FileChangeType } from '../common/platform/fileSystemWatcher';
import { Resource } from '../common/types';
import { PythonEnvSource } from '../pythonEnvironments/base/info';
import {
    ProgressNotificationEvent,
    PythonLocatorQuery,
    TriggerRefreshOptions,
} from '../pythonEnvironments/base/locator';
import { CondaEnvironmentInfo, CondaInfo } from '../pythonEnvironments/common/environmentManagers/conda';
import { EnvironmentType, PythonEnvironment } from '../pythonEnvironments/info';

export type PythonEnvironmentsChangedEvent = {
    type?: FileChangeType;
    resource?: Uri;
    old?: PythonEnvironment;
    new?: PythonEnvironment | undefined;
};

export const IComponentAdapter = Symbol('IComponentAdapter');
export interface IComponentAdapter {
    readonly onProgress: Event<ProgressNotificationEvent>;
    triggerRefresh(query?: PythonLocatorQuery, options?: TriggerRefreshOptions): Promise<void>;
    getRefreshPromise(): Promise<void> | undefined;
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

    isMicrosoftStoreInterpreter(pythonPath: string): Promise<boolean>;
}

export const ICondaService = Symbol('ICondaService');
/**
 * Interface carries the properties which are not available via the discovery component interface.
 */
export interface ICondaService {
    getCondaFile(forShellExecution?: boolean): Promise<string>;
    getCondaInfo(): Promise<CondaInfo | undefined>;
    isCondaAvailable(): Promise<boolean>;
    getCondaVersion(): Promise<SemVer | undefined>;
    getInterpreterPathForEnvironment(condaEnv: CondaEnvironmentInfo): Promise<string | undefined>;
    getCondaFileFromInterpreter(interpreterPath?: string, envName?: string): Promise<string | undefined>;
    getActivationScriptFromInterpreter(
        interpreterPath?: string,
        envName?: string,
    ): Promise<{ path: string | undefined; type: 'local' | 'global' } | undefined>;
}

export const IInterpreterService = Symbol('IInterpreterService');
export interface IInterpreterService {
    /**
     * @deprecated
     */
    getInterpreters(resource?: Uri): PythonEnvironment[];
    onDidChangeInterpreter: Event<Uri | undefined>;
    getActiveInterpreter(resource?: Uri): Promise<PythonEnvironment | undefined>;
    getInterpreterDetails(pythonPath: string, resoure?: Uri): Promise<undefined | PythonEnvironment>;
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

export const IActivatedEnvironmentLaunch = Symbol('IActivatedEnvironmentLaunch');
export interface IActivatedEnvironmentLaunch {
    selectIfLaunchedViaActivatedEnv(doNotBlockOnSelection?: boolean): Promise<string | undefined>;
}
