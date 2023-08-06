// eslint-disable-next-line max-classes-per-file
import { PythonExtension } from '@vscode/python-extension';
import { inject, injectable } from 'inversify';
import { Disposable, Event, EventEmitter, Uri } from 'vscode';
import '../common/extensions';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { IComponentAdapter, IInterpreterService } from './contracts';

type StoredPythonEnvironment = PythonEnvironment & { store?: boolean };

@injectable()
export class InterpreterService implements Disposable, IInterpreterService {
    public get onDidChangeInterpreter(): Event<Uri | undefined> {
        return this.didChangeInterpreterEmitter.event;
    }

    private readonly didChangeInterpreterEmitter = new EventEmitter<Uri | undefined>();

    constructor(
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
    ) {
        PythonExtension.api().then(api => api.environments.onDidChangeActiveEnvironmentPath(e => {
            this.didChangeInterpreterEmitter.fire(e.resource?.uri)
        }))
    }

    public dispose(): void {
        this.didChangeInterpreterEmitter.dispose();
    }

    public async getActiveInterpreter(resource?: Uri): Promise<PythonEnvironment | undefined> {
        const api = await PythonExtension.api();
        const pythonPath = await api.environments.getActiveEnvironmentPath(resource);
        return pythonPath ? this.getInterpreterDetails(pythonPath.path) : undefined;
    }

    public async getInterpreterDetails(pythonPath: string): Promise<StoredPythonEnvironment | undefined> {
        return this.pyenvs.getInterpreterDetails(pythonPath);
    }
}
