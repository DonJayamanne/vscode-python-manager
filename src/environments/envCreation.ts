import { commands, ExtensionContext } from 'vscode';
import { traceError } from '../client/logging';
import { EnvironmentType } from '../client/pythonEnvironments/info';
import { canEnvBeCreated } from './helpers';
import { createEnv as createVenvEnv } from './venvHelper';
import { createEnv as createCondaEnv } from './condaHelper';
import { PythonEnvironmentTreeDataProvider, refreshUntilNewEnvIsAvailable } from './view/treeDataProvider';


export function activate(context: ExtensionContext) {

    context.subscriptions.push(commands.registerCommand('python.envManager.create', async (type: EnvironmentType) => {
        if (!canEnvBeCreated(type)) {
            traceError(`Environment '${type}' cannot be created`);
            return;
        }

        switch (type) {
            case EnvironmentType.Conda:
                return createCondaEnv(PythonEnvironmentTreeDataProvider.environments, refreshUntilNewEnvIsAvailable);
            case EnvironmentType.Venv:
                return createVenvEnv(PythonEnvironmentTreeDataProvider.environments);
            default:
                break;
        }
    }));
}
