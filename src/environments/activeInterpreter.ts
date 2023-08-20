import { PythonExtension } from '@vscode/python-extension';
import { commands, ExtensionContext, window, workspace, WorkspaceFolder } from 'vscode';
import { EnvironmentWrapper } from './view/types';
import { noop } from '../client/common/utils/misc';

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand(
            'python.envManager.setAsActiveInterpreter',
            async (item: EnvironmentWrapper | { id: string }) => {
                const api = await PythonExtension.api();
                const env = 'env' in item ? item.env : api.environments.known.find((e) => e.id === item.id);
                if (!env) {
                    return;
                }
                // eslint-disable-next-line no-nested-ternary
                let folder: WorkspaceFolder | undefined;
                if ('owningFolder' in item && item.owningFolder) {
                    folder = item.owningFolder;
                } else if (Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 0) {
                    folder =
                        workspace.workspaceFolders.length === 1
                            ? workspace.workspaceFolders[0]
                            : await window.showWorkspaceFolderPick({
                                  placeHolder: 'Select folder to change active Python Environment',
                              });
                }
                if (folder) {
                    api.environments.updateActiveEnvironmentPath(env, folder.uri).catch(noop);
                } else {
                    commands.executeCommand('python.setInterpreter').then(noop, noop);
                }
            },
        ),
    );
}
