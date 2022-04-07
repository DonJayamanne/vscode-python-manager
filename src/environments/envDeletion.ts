import { CancellationToken, commands, ExtensionContext, Progress, ProgressLocation, window } from 'vscode';
import { traceError } from '../client/logging';
import { EnvironmentType, PythonEnvironment } from '../client/pythonEnvironments/info';
import { canEnvBeDeleted, getDisplayPath, getEnvDisplayInfo, getEnvLoggingInfo } from './helpers';
import { deleteEnv as deleteCondaEnv } from './condaHelper';
import { deleteEnv as deleteVenvEnv } from './venvHelper';


export function activate(context: ExtensionContext) {

    context.subscriptions.push(commands.registerCommand('python.envManager.delete', async ({ env }: { env: PythonEnvironment }) => {
        if (!canEnvBeDeleted(env.envType)) {
            traceError(`Environment '${getEnvLoggingInfo(env)}' cannot be deleted`);
            return;
        }

        const message = `Are you sure you want to delete the environment '${getEnvDisplayInfo(env)}'?`;
        const detail = `This will result in deleting the folder '${getDisplayPath(env.envPath || env.path)}'.`;
        if (await window.showInformationMessage(message, { modal: true, detail }, 'Yes') !== 'Yes') {
            return;
        }
        try {
            await window.withProgress({ location: ProgressLocation.Notification, title: `Deleting environment ${getEnvDisplayInfo(env)}` },
                async (progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>, _token: CancellationToken) => {
                    switch (env.envType) {
                        case EnvironmentType.Conda:
                            return deleteCondaEnv(env, progress);
                        default:
                            return deleteVenvEnv(env);
                    }
                });

            void commands.executeCommand('python.envManager.refresh');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (ex: any) {
            traceError(`Failed to delete environment ${getEnvLoggingInfo(env)}`, ex);
            window.showErrorMessage(`Failed to delete environment ${getEnvDisplayInfo(env)}, ${ex.toString()}`);
        }
    }));
}
