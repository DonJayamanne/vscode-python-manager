// eslint-disable-next-line max-classes-per-file
import { inject, injectable } from 'inversify';
import * as pathUtils from 'path';
import { Disposable, Event, EventEmitter, Uri } from 'vscode';
import '../common/extensions';
import { IConfigurationService, IDisposableRegistry, IInterpreterPathService } from '../common/types';
import { IServiceContainer } from '../ioc/types';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { IComponentAdapter, IInterpreterService, PythonEnvironmentsChangedEvent } from './contracts';
import { PythonLocatorQuery } from '../pythonEnvironments/base/locator';
import { traceError } from '../logging';
import { reportActiveInterpreterChanged } from '../proposedApi';
import { IPythonExecutionFactory } from '../common/process/types';

type StoredPythonEnvironment = PythonEnvironment & { store?: boolean };

@injectable()
export class InterpreterService implements Disposable, IInterpreterService {
    public async hasInterpreters(
        filter: (e: PythonEnvironment) => Promise<boolean> = async () => true,
    ): Promise<boolean> {
        return this.pyenvs.hasInterpreters(filter);
    }

    public triggerRefresh(query?: PythonLocatorQuery, options?: TriggerRefreshOptions): Promise<void> {
        return this.pyenvs.triggerRefresh(query, options);
    }

    public get refreshPromise(): Promise<void> | undefined {
        return this.pyenvs.getRefreshPromise();
    }

    public get onDidChangeInterpreter(): Event<Uri | undefined> {
        return this.didChangeInterpreterEmitter.event;
    }

    public onDidChangeInterpreters: Event<PythonEnvironmentsChangedEvent>;

    public get onDidChangeInterpreterInformation(): Event<PythonEnvironment> {
        return this.didChangeInterpreterInformation.event;
    }

    public get onDidChangeInterpreterConfiguration(): Event<Uri | undefined> {
        return this.didChangeInterpreterConfigurationEmitter.event;
    }

    public _pythonPathSetting: string | undefined = '';

    private readonly didChangeInterpreterConfigurationEmitter = new EventEmitter<Uri | undefined>();

    private readonly configService: IConfigurationService;

    private readonly interpreterPathService: IInterpreterPathService;

    private readonly didChangeInterpreterEmitter = new EventEmitter<Uri | undefined>();

    private readonly didChangeInterpreterInformation = new EventEmitter<PythonEnvironment>();

    constructor(
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
    ) {
        this.configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        this.interpreterPathService = this.serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        this.onDidChangeInterpreters = pyenvs.onChanged;
    }

    // eslint-disable-next-line class-methods-use-this
    public async refresh(_resource?: Uri): Promise<void> {
        // noop.
    }

    public initialize(): void {
        const disposables = this.serviceContainer.get<Disposable[]>(IDisposableRegistry);
        disposables.push(
            this.onDidChangeInterpreters((e): void => {
                const interpreter = e.old ?? e.new;
                if (interpreter) {
                    this.didChangeInterpreterInformation.fire(interpreter);
                }
            }),
        );
        disposables.push(this.interpreterPathService.onDidChange((i) => this._onConfigChanged(i.uri)));
    }

    public getInterpreters(resource?: Uri): PythonEnvironment[] {
        return this.pyenvs.getInterpreters(resource);
    }

    public async getAllInterpreters(resource?: Uri): Promise<PythonEnvironment[]> {
        // For backwards compatibility with old Jupyter APIs, ensure a
        // fresh refresh is always triggered when using the API. As it is
        // no longer auto-triggered by the extension.
        this.triggerRefresh(undefined, { ifNotTriggerredAlready: true }).ignoreErrors();
        await this.refreshPromise;
        return this.getInterpreters(resource);
    }

    public dispose(): void {
        this.didChangeInterpreterEmitter.dispose();
        this.didChangeInterpreterInformation.dispose();
    }

    public async getActiveInterpreter(resource?: Uri): Promise<PythonEnvironment | undefined> {
        let path = this.configService.getSettings(resource).pythonPath;
        if (pathUtils.basename(path) === path) {
            // Value can be `python`, `python3`, `python3.9` etc.
            // During shutdown we might not be able to get items out of the service container.
            const pythonExecutionFactory = this.serviceContainer.tryGet<IPythonExecutionFactory>(
                IPythonExecutionFactory,
            );
            const pythonExecutionService = pythonExecutionFactory
                ? await pythonExecutionFactory.create({ resource })
                : undefined;
            const fullyQualifiedPath = pythonExecutionService
                ? await pythonExecutionService.getExecutablePath().catch((ex) => {
                    traceError(ex);
                })
                : undefined;
            // Python path is invalid or python isn't installed.
            if (!fullyQualifiedPath) {
                return undefined;
            }
        }
        return this.getInterpreterDetails(path);
    }

    public async getInterpreterDetails(pythonPath: string): Promise<StoredPythonEnvironment | undefined> {
        return this.pyenvs.getInterpreterDetails(pythonPath);
    }

    public async _onConfigChanged(resource?: Uri): Promise<void> {
        // Check if we actually changed our python path.
        // Config service also updates itself on interpreter config change,
        // so yielding control here to make sure it goes first and updates
        // itself before we can query it.
        await sleep(1);
        const pySettings = this.configService.getSettings(resource);
        this.didChangeInterpreterConfigurationEmitter.fire(resource);
        if (this._pythonPathSetting === '' || this._pythonPathSetting !== pySettings.pythonPath) {
            this._pythonPathSetting = pySettings.pythonPath;
            this.didChangeInterpreterEmitter.fire(resource);
            const workspaceFolder = this.serviceContainer
                .get<IWorkspaceService>(IWorkspaceService)
                .getWorkspaceFolder(resource);
            reportActiveInterpreterChanged({
                path: pySettings.pythonPath,
                resource: workspaceFolder,
            });
        }
    }
}
