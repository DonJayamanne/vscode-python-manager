// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PythonExtension } from '@vscode/python-extension';
import { commands, ExtensionContext, window } from 'vscode';
import { IServiceManager } from '../client/ioc/types';
import { activate } from './terminal';
import { activate as activateMamba } from './micromamba/downloader';
import { activate as activatePythonInstallation } from './installPython';
import { activate as activateEnvDeletion } from './envDeletion';
import { activate as activateEnvCreation } from './envCreation';
import { activate as activateSetActiveInterpreter } from './activeInterpreter';
import { PythonEnvironmentTreeDataProvider } from './view/treeDataProvider';

export function registerTypes(serviceManager: IServiceManager, context: ExtensionContext): void {
    PythonExtension.api().then((api) => {
        const treeDataProvider = new PythonEnvironmentTreeDataProvider(context, api, serviceManager);
        // treeDataProvider.
        context.subscriptions.push(treeDataProvider);
        context.subscriptions.push(
            commands.registerCommand('python.envManager.refresh', (forceRefresh = true) =>
                treeDataProvider.refresh(forceRefresh),
            ),
        );
        context.subscriptions.push(
            commands.registerCommand('python.envManager.refreshing', (forceRefresh = true) =>
                treeDataProvider.refresh(forceRefresh),
            ),
        );
        window.createTreeView('pythonEnvironments', { treeDataProvider });
    });
    activate(context, serviceManager);
    activateMamba(context);
    activatePythonInstallation(context);
    activateEnvCreation(context);
    activateEnvDeletion(context);
    activateSetActiveInterpreter(context);
}
