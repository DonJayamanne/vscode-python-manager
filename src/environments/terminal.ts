// export class TerminalManager {
//     constructor() {}

import { commands, ExtensionContext, window, workspace } from 'vscode';
import { ITerminalHelper } from '../client/common/terminal/types';
import { sleep } from '../client/common/utils/async';
import { IServiceContainer } from '../client/ioc/types';

export function activate(_context: ExtensionContext, iocContainrer: IServiceContainer) {
    commands.registerCommand('python.envManager.openInTerminal', async (e) => {
        console.log(e);
        const helper = iocContainrer.get<ITerminalHelper>(ITerminalHelper);
        // const activatedEnvVars = iocContainrer.get<IEnvironmentActivationService>(IEnvironmentActivationService);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // const env = { ...process.env } as any;
        const cwd = await pickFolder();
        // const condaEnvVars =
        //     (await e.env.envType) === EnvironmentType.Conda
        //         ? activatedEnvVars.getActivatedEnvironmentVariables(e.resource, e.env)
        //         : undefined;
        // if (e.env.envType === EnvironmentType.Conda && condaEnvVars) {
        //     const name = e.env.envName ? `Python ${e.env.envName}` : e.env.displayName;
        //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
        //     const terminal = window.createTerminal({ hideFromUser: true, name, env: condaEnvVars as any, cwd });
        //     terminal.show(false);
        // } else {
        // const pathName = getSearchPathEnvVarNames()[0];
        // env[pathName] = `${path.dirname(e.env.path)}${path.delimiter}${env[pathName]}`;
        const name = e.env.envName ? `Python ${e.env.envName}` : e.env.displayName;
        const terminal = window.createTerminal({ hideFromUser: true, name, cwd });
        terminal.show(false);
        const shell = helper.identifyTerminalShell(terminal);
        let activationCommands = await helper.getEnvironmentActivationCommands(shell, cwd, e.env);
        activationCommands = activationCommands || [];
        for (const command of activationCommands || []) {
            terminal.sendText(command);
            // No point sleeping if we have just one command.
            if (activationCommands.length > 1) {
                await sleep(1_000);
            }
        }
        // }
    });
}

async function pickFolder() {
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
        return;
    }
    if (workspace.workspaceFolders.length === 1) {
        // eslint-disable-next-line consistent-return
        return workspace.workspaceFolders[0].uri;
    }

    return window.showWorkspaceFolderPick({ placeHolder: 'Select cwd for terminal' }).then((folder) => folder?.uri);
}
