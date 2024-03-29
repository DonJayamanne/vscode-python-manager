// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { IExtensionSingleActivationService } from '../activation/types';
import {
    IConfigurationService,
    ICurrentProcess,
    IEditorUtils,
    IPathUtils,
    IPersistentStateFactory,
    IRandom,
    IToolExecutionPath,
    IsWindows,
    ToolExecutionPath,
} from './types';
import { IServiceManager } from '../ioc/types';
import { ActiveResourceService } from './application/activeResource';
import { ApplicationEnvironment } from './application/applicationEnvironment';
import { ApplicationShell } from './application/applicationShell';
import { CommandManager } from './application/commandManager';
import { DocumentManager } from './application/documentManager';
import { TerminalManager } from './application/terminalManager';
import {
    IActiveResourceService,
    IApplicationEnvironment,
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
    ITerminalManager,
    IWorkspaceService,
} from './application/types';
import { WorkspaceService } from './application/workspace';
import { ConfigurationService } from './configuration/service';
import { PipEnvExecutionPath } from './configuration/executionSettings/pipEnvExecution';
import { EditorUtils } from './editor';
import { PersistentStateFactory } from './persistentState';
import { PathUtils } from './platform/pathUtils';
import { CurrentProcess } from './process/currentProcess';
import { ProcessLogger } from './process/logger';
import { IProcessLogger } from './process/types';
import { TerminalActivator } from './terminal/activator';
import { Bash } from './terminal/environmentActivationProviders/bash';
import { Nushell } from './terminal/environmentActivationProviders/nushell';
import { CommandPromptAndPowerShell } from './terminal/environmentActivationProviders/commandPrompt';
import { CondaActivationCommandProvider } from './terminal/environmentActivationProviders/condaActivationProvider';
import { PipEnvActivationCommandProvider } from './terminal/environmentActivationProviders/pipEnvActivationProvider';
import { PyEnvActivationCommandProvider } from './terminal/environmentActivationProviders/pyenvActivationProvider';
import { TerminalServiceFactory } from './terminal/factory';
import { TerminalHelper } from './terminal/helper';
import { SettingsShellDetector } from './terminal/shellDetectors/settingsShellDetector';
import { TerminalNameShellDetector } from './terminal/shellDetectors/terminalNameShellDetector';
import { UserEnvironmentShellDetector } from './terminal/shellDetectors/userEnvironmentShellDetector';
import { VSCEnvironmentShellDetector } from './terminal/shellDetectors/vscEnvironmentShellDetector';
import {
    IShellDetector,
    ITerminalActivationCommandProvider,
    ITerminalActivator,
    ITerminalHelper,
    ITerminalServiceFactory,
    TerminalActivationProviders,
} from './terminal/types';

import { IMultiStepInputFactory, MultiStepInputFactory } from './utils/multiStepInput';
import { Random } from './utils/random';
import { isWindows } from './platform/platformService';

export function registerTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingletonInstance<boolean>(IsWindows, isWindows());

    serviceManager.addSingleton<IActiveResourceService>(IActiveResourceService, ActiveResourceService);
    serviceManager.addSingleton<IRandom>(IRandom, Random);
    serviceManager.addSingleton<IPersistentStateFactory>(IPersistentStateFactory, PersistentStateFactory);
    serviceManager.addBinding(IPersistentStateFactory, IExtensionSingleActivationService);
    serviceManager.addSingleton<ITerminalServiceFactory>(ITerminalServiceFactory, TerminalServiceFactory);
    serviceManager.addSingleton<IPathUtils>(IPathUtils, PathUtils);
    serviceManager.addSingleton<IApplicationShell>(IApplicationShell, ApplicationShell);
    serviceManager.addSingleton<ICurrentProcess>(ICurrentProcess, CurrentProcess);
    serviceManager.addSingleton<ICommandManager>(ICommandManager, CommandManager);
    serviceManager.addSingleton<IConfigurationService>(IConfigurationService, ConfigurationService);
    serviceManager.addSingleton<IWorkspaceService>(IWorkspaceService, WorkspaceService);
    serviceManager.addSingleton<IProcessLogger>(IProcessLogger, ProcessLogger);
    serviceManager.addSingleton<IDocumentManager>(IDocumentManager, DocumentManager);
    serviceManager.addSingleton<ITerminalManager>(ITerminalManager, TerminalManager);
    serviceManager.addSingleton<IApplicationEnvironment>(IApplicationEnvironment, ApplicationEnvironment);
    serviceManager.addSingleton<IEditorUtils>(IEditorUtils, EditorUtils);
    serviceManager.addSingleton<ITerminalActivator>(ITerminalActivator, TerminalActivator);

    serviceManager.addSingleton<ITerminalHelper>(ITerminalHelper, TerminalHelper);
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        Bash,
        TerminalActivationProviders.bashCShellFish,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        CommandPromptAndPowerShell,
        TerminalActivationProviders.commandPromptAndPowerShell,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        Nushell,
        TerminalActivationProviders.nushell,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        PyEnvActivationCommandProvider,
        TerminalActivationProviders.pyenv,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        CondaActivationCommandProvider,
        TerminalActivationProviders.conda,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        PipEnvActivationCommandProvider,
        TerminalActivationProviders.pipenv,
    );
    serviceManager.addSingleton<IToolExecutionPath>(IToolExecutionPath, PipEnvExecutionPath, ToolExecutionPath.pipenv);

    serviceManager.addSingleton<IMultiStepInputFactory>(IMultiStepInputFactory, MultiStepInputFactory);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, TerminalNameShellDetector);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, SettingsShellDetector);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, UserEnvironmentShellDetector);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, VSCEnvironmentShellDetector);
}
