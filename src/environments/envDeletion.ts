import { PythonExtension } from '@vscode/python-extension';
import { CancellationToken, commands, ExtensionContext, Progress, ProgressLocation, window } from 'vscode';
import { traceError } from '../client/logging';
import { EnvironmentType } from '../client/pythonEnvironments/info';
import { getDisplayPath, getEnvDisplayInfo, getEnvLoggingInfo } from './helpers';
import { deleteEnv as deleteCondaEnv } from './tools/conda';
import { deleteEnv as deleteVenvEnv } from './tools/venv';
import { getEnvironmentType } from './utils';

export function canEnvBeDeleted(envType: EnvironmentType) {
    switch (envType) {
        case EnvironmentType.Conda:
        case EnvironmentType.Venv:
        case EnvironmentType.VirtualEnv:
        case EnvironmentType.VirtualEnvWrapper:
            return true;
        case EnvironmentType.Pipenv:
        case EnvironmentType.Poetry:
        case EnvironmentType.Pyenv:
        case EnvironmentType.System:
        case EnvironmentType.Unknown:
            return false;
        default:
            return false;
    }
}

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('python.envManager.delete', async ({ id }: { id: string }) => {
            const api = await PythonExtension.api();
            const env = api.environments.known.find((e) => e.id === id);
            if (!env) {
                return;
            }
            if (!canEnvBeDeleted(getEnvironmentType(env))) {
                traceError(`Environment '${getEnvLoggingInfo(env)}' cannot be deleted`);
                return;
            }

            const message = `Are you sure you want to delete the environment '${getEnvDisplayInfo(env)}'?`;
            const detail = `This will result in deleting the folder '${getDisplayPath(env.path)}'.`;
            if ((await window.showInformationMessage(message, { modal: true, detail }, 'Yes')) !== 'Yes') {
                return;
            }
            try {
                await window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: `Deleting environment ${getEnvDisplayInfo(env)}`,
                    },
                    async (
                        progress: Progress<{ message?: string | undefined; increment?: number | undefined }>,
                        _token: CancellationToken,
                    ) => {
                        switch (getEnvironmentType(env)) {
                            case EnvironmentType.Conda:
                                return deleteCondaEnv(env, progress);
                            default:
                                return deleteVenvEnv(env);
                        }
                    },
                );

                void commands.executeCommand('python.envManager.refresh', true);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (ex) {
                traceError(`Failed to delete environment ${getEnvLoggingInfo(env)}`, ex);
                window.showErrorMessage(`Failed to delete environment ${getEnvDisplayInfo(env)}, ${ex}`);
            }
        }),
    );
}
