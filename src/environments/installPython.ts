import * as fs from 'fs-extra';
import { commands, env, ExtensionContext, Uri, window } from 'vscode';
import { noop } from '../client/common/utils/misc';
import { getCondaVersion } from './condaHelper';
import { getDisplayPath } from './helpers';
import { MICROMAMBA_DIR, MICROMAMBA_EXE } from './micromamba/constants';
import { installMicromamba } from './micromamba/install';
import { refreshUntilNewEnvIsAvailable } from './view/treeDataProvider';

export function activate(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand('python.envManager.installPython', async () => {
        if (await fs.pathExists(MICROMAMBA_EXE)) {
            const message = [`Python is already setup via Micromamba. Please use Micromamba found here ${getDisplayPath(MICROMAMBA_EXE)}.`,
            `If it does not worker, then initialize your shell using the command '${getDisplayPath(MICROMAMBA_EXE)} shell init -s bash|zsh|cmd.exe|powershell|fish|xonsh -p ~/micromamba'.`];

            void window.showInformationMessage(message.join(' \n'));
            return;
        }

        const moreInfo = 'More info';
        const detail = `Micromamba will downloaded into ${getDisplayPath(MICROMAMBA_DIR)} \n& Shell scripts will be updated to put Micromamba into the current path.`
        const selection = await window.showInformationMessage('Do you want to download and setup Python via Micromamba?', { modal: true, detail }, 'Yes', moreInfo);
        switch (selection) {
            case moreInfo:
                void env.openExternal(Uri.parse('https://mamba.readthedocs.io/en/latest/user_guide/micromamba.html'));
                break;
            case 'Yes':
                await installMicromamba(refreshUntilNewEnvIsAvailable);
                await createInstallContext();
                break;
            default:
                break;
        }
    }));

    void createInstallContext();
}

async function createInstallContext() {
    const [condaVersion, installed] = await Promise.all([getCondaVersion().catch(noop), fs.pathExists(MICROMAMBA_EXE)]);
    void commands.executeCommand('setContext', 'python.envManager.pythonIsNotInstalled', !installed && !condaVersion);
}
