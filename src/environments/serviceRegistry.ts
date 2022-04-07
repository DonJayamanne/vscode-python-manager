// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { commands, ExtensionContext, window } from 'vscode';
import { IServiceManager } from '../client/ioc/types';
import { activate } from './terminal';
import { activate as activateMamba } from './micromamba/downloader';
import { activate as activatePythonInstallation } from './installPython';
import { activate as activateEnvDeletion } from './envDeletion';
import { activate as activateEnvCreation } from './envCreation';
import { activate as activateSetActiveInterpreter } from './activeInterpreter';
import { PackagesViewProvider } from './view/packages';
import { PythonEnvironmentTreeDataProvider } from './view/treeDataProvider';
import { IInterpreterService } from '../client/interpreter/contracts';

export function registerTypes(serviceManager: IServiceManager, context: ExtensionContext): void {
    const treeDataProvider = new PythonEnvironmentTreeDataProvider(
        serviceManager.get<IInterpreterService>(IInterpreterService), context
    );
    // treeDataProvider.
    context.subscriptions.push(treeDataProvider);
    context.subscriptions.push(commands.registerCommand('python.envManager.refresh', () => treeDataProvider.refresh(true)));
    window.createTreeView('pythonEnvironments', { treeDataProvider });
    PackagesViewProvider.register(context);
    activate(context, serviceManager);
    activateMamba(context);
    activatePythonInstallation(context);
    activateEnvCreation(context);
    activateEnvDeletion(context);
    activateSetActiveInterpreter(context);
}
