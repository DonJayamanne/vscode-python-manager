'use strict';

// eslint-disable-next-line camelcase
import { PythonExtension } from '@vscode/python-extension';
import * as path from 'path';
import {
    ConfigurationChangeEvent,
    ConfigurationTarget,
    Disposable,
    Event,
    EventEmitter,
    Uri,
    WorkspaceConfiguration,
} from 'vscode';
import './extensions';
import { IWorkspaceService } from './application/types';
import { WorkspaceService } from './application/workspace';
import { DEFAULT_INTERPRETER_SETTING, isTestExecution } from './constants';
import { IPythonSettings, ITerminalSettings, Resource } from './types';
import { debounceSync } from './utils/decorators';
import { SystemVariables } from './variables/systemVariables';

const untildify = require('untildify');

export class PythonSettings implements IPythonSettings {
    // eslint-disable-next-line class-methods-use-this
    public static onConfigChange(): Event<ConfigurationChangeEvent | undefined> {
        return PythonSettings.configChanged.event;
    }

    public get pythonPath(): string {
        try {
            return this.api.environments.getActiveEnvironmentPath(this.workspaceRoot).path;
        } catch {
            return 'python';
        }
    }

    public get defaultInterpreterPath(): string {
        return this._defaultInterpreterPath;
    }

    public set defaultInterpreterPath(value: string) {
        if (this._defaultInterpreterPath === value) {
            return;
        }
        // Add support for specifying just the directory where the python executable will be located.
        // E.g. virtual directory name.
        try {
            this._defaultInterpreterPath = this.api.environments.getActiveEnvironmentPath().path;
        } catch (ex) {
            this._defaultInterpreterPath = value;
        }
    }

    private static pythonSettings: Map<string, PythonSettings> = new Map<string, PythonSettings>();

    public envFile = '';

    public venvPath = '';

    public venvFolders: string[] = [];

    public activeStateToolPath = '';

    public condaPath = '';

    public pipenvPath = '';

    public poetryPath = '';

    public devOptions: string[] = [];

    public terminal!: ITerminalSettings;

    public disableInstallationChecks = false;

    public globalModuleInstallation = false;

    public autoUpdateLanguageServer = true;

    public languageServerIsDefault = true;

    protected readonly changed = new EventEmitter<ConfigurationChangeEvent | undefined>();

    private static readonly configChanged = new EventEmitter<ConfigurationChangeEvent | undefined>();

    private workspaceRoot: Resource;

    private disposables: Disposable[] = [];

    private _defaultInterpreterPath = '';

    private readonly workspace: IWorkspaceService;

    constructor(private readonly api: PythonExtension, workspaceFolder: Resource, workspace?: IWorkspaceService) {
        this.workspace = workspace || new WorkspaceService();
        this.workspaceRoot = workspaceFolder;
        this.initialize();
    }

    public static getInstance(
        api: PythonExtension,
        resource: Uri | undefined,
        workspace?: IWorkspaceService,
    ): PythonSettings {
        workspace = workspace || new WorkspaceService();
        const workspaceFolderUri = PythonSettings.getSettingsUriAndTarget(resource, workspace).uri;
        const workspaceFolderKey = workspaceFolderUri ? workspaceFolderUri.fsPath : '';

        if (!PythonSettings.pythonSettings.has(workspaceFolderKey)) {
            const settings = new PythonSettings(api, workspaceFolderUri, workspace);
            PythonSettings.pythonSettings.set(workspaceFolderKey, settings);
        }

        return PythonSettings.pythonSettings.get(workspaceFolderKey)!;
    }

    @debounceSync(1)
    // eslint-disable-next-line class-methods-use-this
    protected static debounceConfigChangeNotification(event?: ConfigurationChangeEvent): void {
        PythonSettings.configChanged.fire(event);
    }

    public static getSettingsUriAndTarget(
        resource: Uri | undefined,
        workspace?: IWorkspaceService,
    ): { uri: Uri | undefined; target: ConfigurationTarget } {
        workspace = workspace || new WorkspaceService();
        const workspaceFolder = resource ? workspace.getWorkspaceFolder(resource) : undefined;
        let workspaceFolderUri: Uri | undefined = workspaceFolder ? workspaceFolder.uri : undefined;

        if (!workspaceFolderUri && Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 0) {
            workspaceFolderUri = workspace.workspaceFolders[0].uri;
        }

        const target = workspaceFolderUri ? ConfigurationTarget.WorkspaceFolder : ConfigurationTarget.Global;
        return { uri: workspaceFolderUri, target };
    }

    public static dispose(): void {
        if (!isTestExecution()) {
            throw new Error('Dispose can only be called from unit tests');
        }

        PythonSettings.pythonSettings.forEach((item) => item && item.dispose());
        PythonSettings.pythonSettings.clear();
    }

    public static toSerializable(settings: IPythonSettings): IPythonSettings {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clone: any = {};
        const keys = Object.entries(settings);
        keys.forEach((e) => {
            const [k, v] = e;
            if (!k.includes('Manager') && !k.includes('Service') && !k.includes('onDid')) {
                clone[k] = v;
            }
        });

        return clone as IPythonSettings;
    }

    public dispose(): void {
        this.disposables.forEach((disposable) => disposable && disposable.dispose());
        this.disposables = [];
    }

    protected update(pythonSettings: WorkspaceConfiguration): void {
        const workspaceRoot = this.workspaceRoot?.fsPath;
        const systemVariables: SystemVariables = new SystemVariables(undefined, workspaceRoot, this.workspace);

        const defaultInterpreterPath = systemVariables.resolveAny(pythonSettings.get<string>('defaultInterpreterPath'));
        this.defaultInterpreterPath = defaultInterpreterPath || DEFAULT_INTERPRETER_SETTING;

        this.venvPath = systemVariables.resolveAny(pythonSettings.get<string>('venvPath'))!;
        this.venvFolders = systemVariables.resolveAny(pythonSettings.get<string[]>('venvFolders'))!;
        const activeStateToolPath = systemVariables.resolveAny(pythonSettings.get<string>('activeStateToolPath'))!;
        this.activeStateToolPath =
            activeStateToolPath && activeStateToolPath.length > 0
                ? getAbsolutePath(activeStateToolPath, workspaceRoot)
                : activeStateToolPath;
        const condaPath = systemVariables.resolveAny(pythonSettings.get<string>('condaPath'))!;
        this.condaPath = condaPath && condaPath.length > 0 ? getAbsolutePath(condaPath, workspaceRoot) : condaPath;
        const pipenvPath = systemVariables.resolveAny(pythonSettings.get<string>('pipenvPath'))!;
        this.pipenvPath = pipenvPath && pipenvPath.length > 0 ? getAbsolutePath(pipenvPath, workspaceRoot) : pipenvPath;
        const poetryPath = systemVariables.resolveAny(pythonSettings.get<string>('poetryPath'))!;
        this.poetryPath = poetryPath && poetryPath.length > 0 ? getAbsolutePath(poetryPath, workspaceRoot) : poetryPath;

        this.autoUpdateLanguageServer = systemVariables.resolveAny(
            pythonSettings.get<boolean>('autoUpdateLanguageServer', true),
        )!;

        const envFileSetting = pythonSettings.get<string>('envFile');
        this.envFile = systemVariables.resolveAny(envFileSetting)!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.devOptions = systemVariables.resolveAny(pythonSettings.get<any[]>('devOptions'))!;
        this.devOptions = Array.isArray(this.devOptions) ? this.devOptions : [];

        this.disableInstallationChecks = pythonSettings.get<boolean>('disableInstallationCheck') === true;
        this.globalModuleInstallation = pythonSettings.get<boolean>('globalModuleInstallation') === true;
        const terminalSettings = systemVariables.resolveAny(pythonSettings.get<ITerminalSettings>('terminal'))!;
        if (this.terminal) {
            Object.assign<ITerminalSettings, ITerminalSettings>(this.terminal, terminalSettings);
        } else {
            this.terminal = terminalSettings;
            if (isTestExecution() && !this.terminal) {
                this.terminal = {} as ITerminalSettings;
            }
        }
    }

    protected onWorkspaceFoldersChanged(): void {
        // If an activated workspace folder was removed, delete its key
        const workspaceKeys = this.workspace.workspaceFolders!.map((workspaceFolder) => workspaceFolder.uri.fsPath);
        const activatedWkspcKeys = Array.from(PythonSettings.pythonSettings.keys());
        const activatedWkspcFoldersRemoved = activatedWkspcKeys.filter((item) => workspaceKeys.indexOf(item) < 0);
        if (activatedWkspcFoldersRemoved.length > 0) {
            for (const folder of activatedWkspcFoldersRemoved) {
                PythonSettings.pythonSettings.delete(folder);
            }
        }
    }

    public register(): void {
        PythonSettings.pythonSettings = new Map();
        this.initialize();
    }

    private onDidChanged(event?: ConfigurationChangeEvent) {
        const currentConfig = this.workspace.getConfiguration('python', this.workspaceRoot);
        this.update(currentConfig);

        // If workspace config changes, then we could have a cascading effect of on change events.
        // Let's defer the change notification.
        this.debounceChangeNotification(event);
    }

    public initialize(): void {
        this.disposables.push(this.workspace.onDidChangeWorkspaceFolders(this.onWorkspaceFoldersChanged, this));
        this.disposables.push(
            this.workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
                if (event.affectsConfiguration('python')) {
                    this.onDidChanged(event);
                }
            }),
        );

        const initialConfig = this.workspace.getConfiguration('python', this.workspaceRoot);
        if (initialConfig) {
            this.update(initialConfig);
        }
    }

    @debounceSync(1)
    protected debounceChangeNotification(event?: ConfigurationChangeEvent): void {
        this.changed.fire(event);
    }
}

function getAbsolutePath(pathToCheck: string, rootDir: string | undefined): string {
    if (!rootDir) {
        rootDir = __dirname;
    }

    pathToCheck = untildify(pathToCheck) as string;
    if (isTestExecution() && !pathToCheck) {
        return rootDir;
    }
    if (pathToCheck.indexOf(path.sep) === -1) {
        return pathToCheck;
    }
    return path.isAbsolute(pathToCheck) ? pathToCheck : path.resolve(rootDir, pathToCheck);
}
