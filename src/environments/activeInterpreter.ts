import { PythonExtension } from '@vscode/python-extension';
import { commands, ExtensionContext, window, workspace } from 'vscode';

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('python.envManager.setAsActiveInterpreter', async ({ id }: { id: string }) => {
            if (!Array.isArray(workspace.workspaceFolders) || workspace.workspaceFolders.length === 0) {
                return;
            }

            const api = await PythonExtension.api();
            const env = api.environments.known.find((e) => e.id === id);
            if (!env) {
                return;
            }
            const folder =
                workspace.workspaceFolders.length === 1
                    ? workspace.workspaceFolders[0]
                    : await window.showWorkspaceFolderPick({
                          placeHolder: 'Select folder to change active Python Environment',
                      });
            if (!folder) {
                return;
            }
            api.environments.updateActiveEnvironmentPath(env, folder.uri);
        }),
    );
}
