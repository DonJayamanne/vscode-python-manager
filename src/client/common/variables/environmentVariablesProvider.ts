// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, optional } from 'inversify';
import { ConfigurationChangeEvent, Disposable, Event, EventEmitter, FileSystemWatcher, Uri } from 'vscode';
import { traceError, traceVerbose } from '../../logging';
import { sendFileCreationTelemetry } from '../../telemetry/envFileTelemetry';
import { IWorkspaceService } from '../application/types';
import { PythonSettings } from '../configSettings';
import { IPlatformService } from '../platform/types';
import { ICurrentProcess, IDisposableRegistry } from '../types';
import { InMemoryCache } from '../utils/cacheUtils';
import { SystemVariables } from './systemVariables';
import { EnvironmentVariables, IEnvironmentVariablesProvider, IEnvironmentVariablesService } from './types';

const CACHE_DURATION = 60 * 60 * 1000;
@injectable()
export class EnvironmentVariablesProvider implements IEnvironmentVariablesProvider, Disposable {
    public trackedWorkspaceFolders = new Set<string>();

    private fileWatchers = new Map<string, FileSystemWatcher>();

    private disposables: Disposable[] = [];

    private changeEventEmitter: EventEmitter<Uri | undefined>;

    private readonly envVarCaches = new Map<string, InMemoryCache<EnvironmentVariables>>();

    constructor(
        @inject(IEnvironmentVariablesService) private envVarsService: IEnvironmentVariablesService,
        @inject(IDisposableRegistry) disposableRegistry: Disposable[],
        @inject(IPlatformService) private platformService: IPlatformService,
        @inject(IWorkspaceService) private workspaceService: IWorkspaceService,
        @inject(ICurrentProcess) private process: ICurrentProcess,
        @optional() private cacheDuration: number = CACHE_DURATION,
    ) {
        disposableRegistry.push(this);
        this.changeEventEmitter = new EventEmitter();
        const disposable = this.workspaceService.onDidChangeConfiguration(this.configurationChanged, this);
        this.disposables.push(disposable);
    }

    public get onDidEnvironmentVariablesChange(): Event<Uri | undefined> {
        return this.changeEventEmitter.event;
    }

    public dispose(): void {
        this.changeEventEmitter.dispose();
        this.fileWatchers.forEach((watcher) => {
            if (watcher) {
                watcher.dispose();
            }
        });
    }

    public async getEnvironmentVariables(resource?: Uri): Promise<EnvironmentVariables> {
        const cacheKey = this.getWorkspaceFolderUri(resource)?.fsPath ?? '';
        let cache = this.envVarCaches.get(cacheKey);

        if (cache) {
            const cachedData = cache.data;
            if (cachedData) {
                traceVerbose(
                    `Cached data exists getEnvironmentVariables, ${resource ? resource.fsPath : '<No Resource>'}`,
                );
                return { ...cachedData };
            }
        } else {
            cache = new InMemoryCache(this.cacheDuration);
            this.envVarCaches.set(cacheKey, cache);
        }

        const vars = await this._getEnvironmentVariables(resource);
        cache.data = { ...vars };
        return vars;
    }

    public async _getEnvironmentVariables(resource?: Uri): Promise<EnvironmentVariables> {
        let mergedVars = await this.getCustomEnvironmentVariables(resource);
        if (!mergedVars) {
            mergedVars = {};
        }
        this.envVarsService.mergeVariables(this.process.env, mergedVars!);
        const pathVariable = this.platformService.pathVariableName;
        const pathValue = this.process.env[pathVariable];
        if (pathValue) {
            this.envVarsService.appendPath(mergedVars!, pathValue);
        }
        if (this.process.env.PYTHONPATH) {
            this.envVarsService.appendPythonPath(mergedVars!, this.process.env.PYTHONPATH);
        }
        return mergedVars;
    }

    public async getCustomEnvironmentVariables(resource?: Uri): Promise<EnvironmentVariables | undefined> {
        const systemVariables: SystemVariables = new SystemVariables(
            undefined,
            PythonSettings.getSettingsUriAndTarget(resource, this.workspaceService).uri?.fsPath,
            this.workspaceService,
        );
        const envFileSetting = this.workspaceService.getConfiguration('python', resource).get<string>('envFile');
        const envFile = systemVariables.resolveAny(envFileSetting)!;
        const workspaceFolderUri = this.getWorkspaceFolderUri(resource);
        this.trackedWorkspaceFolders.add(workspaceFolderUri ? workspaceFolderUri.fsPath : '');
        this.createFileWatcher(envFile, workspaceFolderUri);
        return this.envVarsService.parseFile(envFile, this.process.env);
    }

    public configurationChanged(e: ConfigurationChangeEvent): void {
        this.trackedWorkspaceFolders.forEach((item) => {
            const uri = item && item.length > 0 ? Uri.file(item) : undefined;
            if (e.affectsConfiguration('python.envFile', uri)) {
                this.onEnvironmentFileChanged(uri);
            }
        });
    }

    public createFileWatcher(envFile: string, workspaceFolderUri?: Uri): void {
        if (this.fileWatchers.has(envFile)) {
            return;
        }
        try {
            const envFileWatcher = this.workspaceService.createFileSystemWatcher(envFile);
            this.fileWatchers.set(envFile, envFileWatcher);
            if (envFileWatcher) {
                this.disposables.push(envFileWatcher.onDidChange(() => this.onEnvironmentFileChanged(workspaceFolderUri)));
                this.disposables.push(envFileWatcher.onDidCreate(() => this.onEnvironmentFileCreated(workspaceFolderUri)));
                this.disposables.push(envFileWatcher.onDidDelete(() => this.onEnvironmentFileChanged(workspaceFolderUri)));
            }
        } catch (ex) {
            traceError(`Failed to create a file system watcher for ${envFile} in ${workspaceFolderUri?.fsPath}`, ex);
        }
    }

    private getWorkspaceFolderUri(resource?: Uri): Uri | undefined {
        if (!resource) {
            return undefined;
        }
        const workspaceFolder = this.workspaceService.getWorkspaceFolder(resource!);
        return workspaceFolder ? workspaceFolder.uri : undefined;
    }

    private onEnvironmentFileCreated(workspaceFolderUri?: Uri) {
        this.onEnvironmentFileChanged(workspaceFolderUri);
        sendFileCreationTelemetry();
    }

    private onEnvironmentFileChanged(workspaceFolderUri?: Uri) {
        // An environment file changing can affect multiple workspaces; clear everything and reparse later.
        this.envVarCaches.clear();
        this.changeEventEmitter.fire(workspaceFolderUri);
    }
}
