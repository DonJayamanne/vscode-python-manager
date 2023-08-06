import * as fs from 'fs-extra';
import { CancellationToken, Progress, window } from 'vscode';
import { execObservable } from '../../client/common/process/rawProcessApis';
import { traceError, traceInfo } from '../../client/logging';
import { EnvironmentType } from '../../client/pythonEnvironments/info';
import { updateEnvironmentsTxt } from '../tools/conda';
import { RefreshUntilNewEnvIsAvailable } from '../environments';
import { BASE_MICROMAMBA_PYTHON_EXE, MICROMAMBA_EXE, MICROMAMBA_ROOTPREFIX } from './constants';

export async function createBaseEnv(
    progress: Progress<{
        message?: string | undefined;
        increment?: number | undefined;
    }>,
    token: CancellationToken,
    refreshUntilAvailable: RefreshUntilNewEnvIsAvailable,
    pythonVersion = '3.9',
) {
    try {
        progress.report({ message: `Creating Python ${pythonVersion} environment` });
        traceInfo(`Creating environment with Python ${pythonVersion}`);
        const args = [
            'install',
            `python=${pythonVersion || '3.9'}`,
            'conda',
            '-c',
            'conda-forge',
            '-y',
            '-p',
            MICROMAMBA_ROOTPREFIX,
        ];
        traceInfo([MICROMAMBA_EXE].concat(args).join(' '));
        const result = await execObservable(MICROMAMBA_EXE, args, {
            timeout: 120_000,
            token,
            shell: true,
            env: {
                ...process.env,
                TARGET_PREFIX: MICROMAMBA_ROOTPREFIX,
                ROOT_PREFIX: MICROMAMBA_ROOTPREFIX,
                MAMBA_ROOT_PREFIX: MICROMAMBA_ROOTPREFIX,
                MAMBA_EXE: MICROMAMBA_EXE,
            },
        });
        result.proc?.on('error', (ex) => console.error(`Conda create exited with an error`, ex));
        await new Promise<void>((resolve, reject) => {
            result.out.subscribe({
                next: (output) => {
                    if (output.out.trim().length) {
                        progress.report({ message: output.out });
                    }
                    traceInfo(output.out);
                },
                complete: () => resolve(),
                error: (ex) => reject(ex),
            });
        });

        if (!(await fs.pathExists(BASE_MICROMAMBA_PYTHON_EXE))) {
            throw new Error(
                `Please try running the following command in the terminal "${[MICROMAMBA_EXE].concat(args).join(' ')}"`,
            );
        }
        await updateEnvironmentsTxt(MICROMAMBA_ROOTPREFIX).catch((ex) =>
            traceError('Failed to update environments.txt', ex),
        );
        progress.report({ message: 'Waiting for environment to be detected' });
        await refreshUntilAvailable({ path: BASE_MICROMAMBA_PYTHON_EXE, type: EnvironmentType.Conda });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex) {
        traceError(`Failed to create environment`, ex);
        window.showErrorMessage(`Failed to create environment ${MICROMAMBA_ROOTPREFIX}, ${ex}`);
    }
}
