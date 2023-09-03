import { commands, ExtensionContext } from 'vscode';
import { traceError } from '../client/logging';
import { EnvironmentType } from '../client/pythonEnvironments/info';
import { _createEnvironmentProviders } from '../client/pythonEnvironments/creation/createEnvApi';
import { handleCreateEnvironmentCommand } from '../client/pythonEnvironments/creation/createEnvironment';

export function canEnvBeCreated(envType: EnvironmentType) {
    switch (envType) {
        case EnvironmentType.Conda:
        case EnvironmentType.Venv:
        case EnvironmentType.Pyenv:
            return true;
        case EnvironmentType.VirtualEnv:
        case EnvironmentType.VirtualEnvWrapper:
        case EnvironmentType.Pipenv:
        case EnvironmentType.Poetry:
        case EnvironmentType.System:
        case EnvironmentType.Unknown:
            return false;
        default:
            return false;
    }
}

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('python.envManager.create', async (type?: EnvironmentType) => {
            if (!type) {
                // Called from the Add button on top of the Workspace Environments view.
                // We're trying to create an environment for a workspace folder of any type.
                // Let python handle this.
                await commands.executeCommand('python.createEnvironment');
                return commands.executeCommand('python.envManager.refresh');
            }
            if (!canEnvBeCreated(type)) {
                traceError(`Environment '${type}' cannot be created`);
                return;
            }

            const provider = _createEnvironmentProviders.getAll().find((e) => e.tools.includes(type));
            if (!provider) {
                return;
            }
            try {
                await handleCreateEnvironmentCommand([provider], {});
            } catch (err) {
                console.error('Failed to create the environment', err);
            }
        }),
    );
}
