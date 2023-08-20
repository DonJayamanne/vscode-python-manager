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
import { PythonEnvironmentsTreeDataProvider } from './view/environmentsTreeDataProvider';
import { WorkspaceFoldersTreeDataProvider } from './view/foldersTreeDataProvider';
import { registerCommands } from './view/commands';

export function registerTypes(serviceManager: IServiceManager, context: ExtensionContext): void {
    PythonExtension.api().then((api) => {
        const treeDataProvider = new PythonEnvironmentsTreeDataProvider(context, api, serviceManager);
        context.subscriptions.push(treeDataProvider);
        window.createTreeView('pythonEnvironments', { treeDataProvider });

        const workspaceFoldersTreeDataProvider = new WorkspaceFoldersTreeDataProvider(context, api);
        context.subscriptions.push(workspaceFoldersTreeDataProvider);
        window.createTreeView('workspaceEnvironments', { treeDataProvider: workspaceFoldersTreeDataProvider });
        context.subscriptions.push(
            commands.registerCommand('python.envManager.refresh', (forceRefresh = true) => {
                treeDataProvider.refresh(forceRefresh);
                workspaceFoldersTreeDataProvider.refresh(forceRefresh);
            }
            ),
        );
        context.subscriptions.push(
            commands.registerCommand('python.envManager.refreshing', (forceRefresh = true) => {
                treeDataProvider.refresh(forceRefresh);
                workspaceFoldersTreeDataProvider.refresh(forceRefresh);
            },
            ),
        );
    });
    activate(context, serviceManager);
    activateMamba(context);
    registerCommands(context);
    activatePythonInstallation(context);
    activateEnvCreation(context);
    activateEnvDeletion(context);
    activateSetActiveInterpreter(context);
}
