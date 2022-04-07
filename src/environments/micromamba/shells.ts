import { getOSType, OSType } from '../../client/common/utils/platform';
import { exec } from '../../client/pythonEnvironments/common/externalDependencies';
import '../../client/common/extensions';
import { CONDA_EXE, MICROMAMBA_EXE, MICROMAMBA_ROOTPREFIX } from './constants';

/**
 * Initialize at your own risk, as with micromamaba, this should not be run if conda has already been installed.
 */
export async function initializeMicromambaShells() {
    // Tip: Run these in the terminal to see what files will be updated.
    if (getOSType() === OSType.Windows) {
        await Promise.all([
            exec(MICROMAMBA_EXE, ['shell', 'init', '-s', 'cmd.exe', '-p', MICROMAMBA_ROOTPREFIX.fileToCommandArgumentForPythonExt()]),
            exec(MICROMAMBA_EXE, ['shell', 'init', '-s', 'powershell', '-p', MICROMAMBA_ROOTPREFIX.fileToCommandArgumentForPythonExt()])
        ]);
    } else {
        const results = await Promise.all([
            exec(MICROMAMBA_EXE, ['shell', 'init', '-s', 'bash', '-p', MICROMAMBA_ROOTPREFIX.fileToCommandArgumentForPythonExt()]),
            exec(MICROMAMBA_EXE, ['shell', 'init', '-s', 'fish', '-p', MICROMAMBA_ROOTPREFIX.fileToCommandArgumentForPythonExt()]),
            exec(MICROMAMBA_EXE, ['shell', 'init', '-s', 'xonsh', '-p', MICROMAMBA_ROOTPREFIX.fileToCommandArgumentForPythonExt()]),
            exec(MICROMAMBA_EXE, ['shell', 'init', '-s', 'zsh', '-p', MICROMAMBA_ROOTPREFIX.fileToCommandArgumentForPythonExt()])
        ]);
        console.log(results);
    }
}
export async function initializeCondaShells() {
    // Tip: Run these in the terminal to see what files will be updated.
    const result = await exec(CONDA_EXE, ['init', '--all'], { shell: true });
    console.log(result);
}
