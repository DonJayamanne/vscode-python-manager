import * as fs from 'fs-extra';
import { ConfigurationTarget, ProgressLocation, window, workspace } from 'vscode';
import { traceError, traceInfo } from '../../client/logging';
import { CONDA_EXE, MICROMAMBA_EXE } from './constants';
import { createBaseEnv } from './base';
import { initializeCondaShells, initializeMicromambaShells } from './shells';
import { downloadMamba } from './downloader';
import { RefreshUntilNewEnvIsAvailable } from '../environments';

export async function installMicromamba(refreshUntilAvailable: RefreshUntilNewEnvIsAvailable) {
    if (!await fs.pathExists(MICROMAMBA_EXE)) {
        await window.withProgress({ location: ProgressLocation.Notification, cancellable: true, title: 'Setting up Python' }, async (uiProgress, token) => {
            try {
                await downloadMamba(uiProgress, token);
                // await createMicroMambaScripts(targetDestination, file, BASE_MICROMAMBA_PYTHON_EXEC);
                uiProgress.report({ message: 'Configuring Micromamba Shells' });
                await initializeMicromambaShells();
                await createBaseEnv(uiProgress, token, refreshUntilAvailable);
                uiProgress.report({ message: 'Configuring Conda Shells' });
                await initializeCondaShells();
                uiProgress.report({ message: 'Updating user .vscode settings' });
                await updatePythonSettings();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (ex: any) {
                traceError(`Failed to create Python environment`)
                window.showErrorMessage(`Failed to setup Python, see logs for more information. \n ${ex.toString()}`)
            }
        });
    }
    traceInfo(`Mamba file loaded at ${MICROMAMBA_EXE}`);
}

async function updatePythonSettings() {
    const settings = workspace.getConfiguration('python', undefined);
    if (!settings.inspect<string>('condaPath')?.globalValue) {
        if (!settings.inspect<string>('condaPath')?.globalValue) {
            void settings.update('condaPath', CONDA_EXE, ConfigurationTarget.Global);
        }
    }
}
