import { commands, ExtensionContext, extensions, window, workspace } from 'vscode';
import { PythonEnvironment } from '../client/pythonEnvironments/info';
import { Resource } from '../client/common/types';


export function activate(context: ExtensionContext) {

    context.subscriptions.push(commands.registerCommand('python.envManager.setAsActiveInterpreter', async ({ env }: { env: PythonEnvironment }) => {
        if (!Array.isArray(workspace.workspaceFolders) || workspace.workspaceFolders.length === 0) {
            return;
        }

        const pythonExt = getPythonExtension();
        if (!pythonExt?.isActive) {
            await pythonExt?.activate();
        }
        const folder = workspace.workspaceFolders.length === 1 ? workspace.workspaceFolders[0] : await window.showWorkspaceFolderPick({ placeHolder: 'Select folder to change active Python Environment' });
        if (!folder) {
            return;
        }
        void pythonExt?.exports.environment.setActiveEnvironment(env.path, folder.uri);
    }));
}

function getPythonExtension() {
    return extensions.getExtension<{
        environment: { setActiveEnvironment(interpreterPath: string, resource?: Resource): Promise<void> }
    }>('ms-python.python');
}
export function canChangeActiveInterpreter() {
    return getPythonExtension() && Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 0;
}
