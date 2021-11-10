// export class TerminalManager {
//     constructor() {}

import { commands, ExtensionContext, Terminal, window, workspace } from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import * as fs from 'fs-extra';
import { ITerminalHelper, TerminalShellType } from '../client/common/terminal/types';
import { sleep } from '../client/common/utils/async';
import { IServiceContainer } from '../client/ioc/types';
import { _SCRIPTS_DIR } from '../client/common/process/internal/scripts/constants';
import { TemporaryFile } from '../client/common/platform/types';
import { StopWatch } from '../client/common/utils/stopWatch';
import { PythonEnvironment } from '../client/pythonEnvironments/info';
import { getSearchPathEnvVarNames } from '../client/common/utils/exec';
import { getHashString } from '../client/common/platform/fileSystem';
import { getOSType, OSType } from '../client/common/utils/platform';
import * as isWsl from 'is-wsl';

export function activate(context: ExtensionContext, iocContainrer: IServiceContainer) {
    commands.registerCommand('python.envManager.openInTerminal', async (e: { env: PythonEnvironment }) => {
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
        const shell = helper.identifyTerminalShell(terminal);
        const activationCommands = await helper.getEnvironmentActivationCommands(shell, cwd, e.env);
        if (Array.isArray(activationCommands) && activationCommands.length > 0) {
            terminal.show(false);
            for (const command of activationCommands || []) {
                terminal.sendText(command);
                // No point sleeping if we have just one command.
                if (activationCommands.length > 1) {
                    await sleep(1_000);
                }
            }
            return;
        }
        if (isWsl) {
            // Using strict will not work, we'll need to update the Path variable with the terminal.
            return;
        }
        try {
            const [envVars, symlinkDir] = await Promise.all([
                getActivatedEnvVariables(helper, shell, terminal, e.env.path),
                createSymlink(shell, e.env.path, context),
            ]);
            terminal.dispose();
            if (getOSType() === OSType.Windows) {
                if (typeof envVars['Path'] === 'string') {
                    envVars['Path'] = `${symlinkDir}${path.delimiter}${envVars['Path']}`;
                }
                if (typeof envVars['PATH'] === 'string') {
                    envVars['PATH'] = `${symlinkDir}${path.delimiter}${envVars['PATH']}`;
                }
            } else {
                const pathVariable = getSearchPathEnvVarNames()[0];
                envVars[pathVariable] = `${symlinkDir}${path.delimiter}${envVars[pathVariable]}`;
            }
            const terminalCustomEnvVars = window.createTerminal({
                hideFromUser: false,
                name,
                cwd,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                env: envVars as any,
                strictEnv: true,
            });
            terminalCustomEnvVars.show(false);
        } catch (ex) {
            console.error(`Failed to create terminal for ${e.env.envType}:${e.env.path}`, ex);
        }
    });
}

async function createSymlink(shell: TerminalShellType, pythonPath: string, context: ExtensionContext) {
    const hash = getHashString(pythonPath);
    const script = createShellScript(shell, pythonPath);
    const symlinkDir = path.join(context.globalStorageUri.fsPath, 'symlinks', `python_${hash}`);
    const symlinkFile = path.join(symlinkDir, `python${script.extension}`);
    if (await fs.pathExists(symlinkFile)) {
        return symlinkDir;
    }
    await fs.ensureDir(symlinkDir);
    await fs.writeFile(symlinkFile, script.contents);
    return symlinkDir;
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

const envVariables = new Map<string, Promise<NodeJS.ProcessEnv>>();
export async function getActivatedEnvVariables(
    helper: ITerminalHelper,
    shell: TerminalShellType,
    terminal: Terminal,
    pythonPath: string,
): Promise<NodeJS.ProcessEnv> {
    if (envVariables.has(pythonPath)) {
        return envVariables.get(pythonPath)!;
    }
    const promise = (async () => {
        const tmpFile = await new Promise<TemporaryFile>((resolve, reject) => {
            tmp.file({ postfix: '.txt' }, (err, filename, _fd, cleanUp) => {
                if (err) {
                    return reject(err);
                }
                resolve({
                    filePath: filename,
                    dispose: cleanUp,
                });
            });
        });
        tmpFile.dispose();

        const args = helper.buildCommandForTerminal(shell, pythonPath, [
            path.join(_SCRIPTS_DIR, 'printEnvVariablesToFile.py'),
            tmpFile.filePath,
        ]);
        terminal.sendText(args);
        // Wait for the file to get created.
        const stopWatch = new StopWatch();
        while (stopWatch.elapsedTime < 5_000) {
            if (await fs.pathExists(tmpFile.filePath)) {
                break;
            }
            await sleep(100);
        }
        if (await fs.pathExists(tmpFile.filePath)) {
            try {
                return JSON.parse(await fs.readFile(tmpFile.filePath, 'utf8'));
            } catch (ex) {
                console.error(`Failed to parse activated env vars for ${pythonPath}, with command ${args}`, ex);
                throw new Error(`Failed to parse activated env vars for ${pythonPath}, with command ${args}`);
            }
        } else {
            throw new Error(`Failed to generate env vars for ${pythonPath}, with command ${args}`);
        }
    })();
    envVariables.set(pythonPath, promise);
    // So that we re-generate this everytime.
    // User can have custom env variables as well, caching will only break their stuff.
    promise.finally(() => envVariables.delete(pythonPath));
    return promise;
}

function createShellScript(shellType: TerminalShellType, realPath: string): { contents: string; extension: string } {
    switch (shellType) {
        case TerminalShellType.commandPrompt:
        case TerminalShellType.powershell:
        case TerminalShellType.powershellCore:
            // Powershell can run batch files.
            return {
                contents: `
@ECHO off
"${realPath}"  %*
`, extension: '.cmd'
            }

        default:
            // To my knowledge all shell apart from windows (cmd and ps) can run shell scripts.
            return {
                contents: `#!/bin/sh
"${realPath}"   "$@"
ret=$?
exit $ret
`, extension: ''
            };
    }
}
