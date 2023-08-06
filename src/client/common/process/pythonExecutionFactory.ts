// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { inject, injectable } from 'inversify';

import { IEnvironmentActivationService } from '../../interpreter/activation/types';
import { IActivatedEnvironmentLaunch, IComponentAdapter } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IFileSystem } from '../platform/types';
import { IConfigurationService, IDisposableRegistry } from '../types';
import { ProcessService } from './proc';
import { createCondaEnv, createPythonEnv, createMicrosoftStoreEnv } from './pythonEnvironment';
import { createPythonProcessService } from './pythonProcess';
import {
    ExecutionFactoryCreateWithEnvironmentOptions,
    ExecutionFactoryCreationOptions,
    IProcessLogger,
    IProcessService,
    IProcessServiceFactory,
    IPythonEnvironment,
    IPythonExecutionFactory,
    IPythonExecutionService,
} from './types';

@injectable()
export class PythonExecutionFactory implements IPythonExecutionFactory {
    private readonly disposables: IDisposableRegistry;

    private readonly logger: IProcessLogger;

    private readonly fileSystem: IFileSystem;

    constructor(
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
        @inject(IEnvironmentActivationService) private readonly activationHelper: IEnvironmentActivationService,
        @inject(IProcessServiceFactory) private readonly processServiceFactory: IProcessServiceFactory,
        @inject(IConfigurationService) private readonly configService: IConfigurationService,
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
    ) {
        // Acquire other objects here so that if we are called during dispose they are available.
        this.disposables = this.serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        this.logger = this.serviceContainer.get<IProcessLogger>(IProcessLogger);
        this.fileSystem = this.serviceContainer.get<IFileSystem>(IFileSystem);
    }

    public async create(options: ExecutionFactoryCreationOptions): Promise<IPythonExecutionService> {
        let { pythonPath } = options;
        if (!pythonPath || pythonPath === 'python') {
            const activatedEnvLaunch = this.serviceContainer.get<IActivatedEnvironmentLaunch>(
                IActivatedEnvironmentLaunch,
            );
            await activatedEnvLaunch.selectIfLaunchedViaActivatedEnv();
            pythonPath = this.configService.getSettings(options.resource).pythonPath;
        }
        const processService: IProcessService = await this.processServiceFactory.create(options.resource);

        const condaExecutionService = await this.createCondaExecutionService(pythonPath, processService);
        if (condaExecutionService) {
            return condaExecutionService;
        }

        const windowsStoreInterpreterCheck = this.pyenvs.isMicrosoftStoreInterpreter.bind(this.pyenvs);

        const env = (await windowsStoreInterpreterCheck(pythonPath))
            ? createMicrosoftStoreEnv(pythonPath, processService)
            : createPythonEnv(pythonPath, processService, this.fileSystem);

        return createPythonService(processService, env);
    }

    public async createActivatedEnvironment(
        options: ExecutionFactoryCreateWithEnvironmentOptions,
    ): Promise<IPythonExecutionService> {
        const envVars = await this.activationHelper.getActivatedEnvironmentVariables(
            options.resource,
            options.interpreter,
            options.allowEnvironmentFetchExceptions,
        );
        const hasEnvVars = envVars && Object.keys(envVars).length > 0;
        sendTelemetryEvent(EventName.PYTHON_INTERPRETER_ACTIVATION_ENVIRONMENT_VARIABLES, undefined, { hasEnvVars });
        if (!hasEnvVars) {
            return this.create({
                resource: options.resource,
                pythonPath: options.interpreter ? options.interpreter.path : undefined,
            });
        }
        const pythonPath = options.interpreter
            ? options.interpreter.path
            : this.configService.getSettings(options.resource).pythonPath;
        const processService: IProcessService = new ProcessService({ ...envVars });
        processService.on('exec', this.logger.logProcess.bind(this.logger));
        this.disposables.push(processService);

        const condaExecutionService = await this.createCondaExecutionService(pythonPath, processService);
        if (condaExecutionService) {
            return condaExecutionService;
        }
        const env = createPythonEnv(pythonPath, processService, this.fileSystem);
        return createPythonService(processService, env);
    }

    public async createCondaExecutionService(
        pythonPath: string,
        processService: IProcessService,
    ): Promise<IPythonExecutionService | undefined> {
        const condaLocatorService = this.serviceContainer.get<IComponentAdapter>(IComponentAdapter);
        const [condaEnvironment] = await Promise.all([condaLocatorService.getCondaEnvironment(pythonPath)]);
        if (!condaEnvironment) {
            return undefined;
        }
        const env = await createCondaEnv(condaEnvironment, processService, this.fileSystem);
        if (!env) {
            return undefined;
        }
        return createPythonService(processService, env);
    }
}

function createPythonService(procService: IProcessService, env: IPythonEnvironment): IPythonExecutionService {
    const procs = createPythonProcessService(procService, env);
    return {
        getInterpreterInformation: () => env.getInterpreterInformation(),
        getExecutablePath: () => env.getExecutablePath(),
        isModuleInstalled: (m) => env.isModuleInstalled(m),
        getModuleVersion: (m) => env.getModuleVersion(m),
        getExecutionInfo: (a) => env.getExecutionInfo(a),
        execObservable: (a, o) => procs.execObservable(a, o),
        execModuleObservable: (m, a, o) => procs.execModuleObservable(m, a, o),
        exec: (a, o) => procs.exec(a, o),
        execModule: (m, a, o) => procs.execModule(m, a, o),
        execForLinter: (m, a, o) => procs.execForLinter(m, a, o),
    };
}
