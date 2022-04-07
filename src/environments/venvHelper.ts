import * as fs from 'fs-extra';
import * as path from 'path';
import { commands, Progress, ProgressLocation, QuickInputButton, QuickPickItem, ThemeIcon, window, workspace } from 'vscode';
import { CancellationToken } from 'vscode-jsonrpc';
import { ApplicationShell } from '../client/common/application/applicationShell';
import { execObservable } from '../client/common/process/rawProcessApis';
import { InputStep, MultiStepInput } from '../client/common/utils/multiStepInput';
import { traceError, traceInfo, traceVerbose } from '../client/logging';
import { EnvironmentType, PythonEnvironment } from '../client/pythonEnvironments/info';
import { getDisplayPath, getEnvDisplayInfo, getEnvLoggingInfo } from './helpers';

export async function deleteEnv(env: PythonEnvironment) {
    if (env.envType !== EnvironmentType.Venv && env.envType !== EnvironmentType.VirtualEnv && env.envType !== EnvironmentType.VirtualEnvWrapper) {
        traceError(`Cannot delete as its not a virtual environment ${getEnvLoggingInfo(env)}`);
        return;
    }

    // Verify the executable ends with scripts/xyz.python or bin/xyz.python
    // If not, we could end up deleting the wrong directory.
    const baseDir = path.dirname(env.path);
    if (!baseDir.toLowerCase().endsWith('scripts') && !baseDir.toLowerCase().endsWith('bin')) {
        traceError(`Cannot delete as its not a virtual environment with script/bin directory ${getEnvLoggingInfo(env)}`);
        return;
    }
    const dirToDelete = env.envPath || path.dirname(path.dirname(env.path));
    traceVerbose(`Deleting virtual environment ${getEnvLoggingInfo(env)}`);
    await fs.remove(dirToDelete);
}

function getSortedEnvsFromWhichWeCanCreateVenvEnv(environments: PythonEnvironment[]) {
    // Ensure we have atleast a global environment, a venv, virtualEnv, virtualEnvWrapper to create a venv.
    return environments.filter(env => {
        switch (env.envType) {
            case EnvironmentType.Global:
            case EnvironmentType.System:
            case EnvironmentType.Venv:
            case EnvironmentType.VirtualEnv:
            case EnvironmentType.VirtualEnvWrapper:
            case EnvironmentType.WindowsStore:
                return true;
            default:
                return false;
        }
    }).sort((a, b) => {
        const v1 = a.version;
        const v2 = b.version;
        if (v1 && v2) {
            if (v1.major === v2.major) {
                if (v1.minor === v2.minor) {
                    if (v1.patch === v2.patch) {
                        return 0;
                    }
                    return v1.patch > v2.patch ? -1 : 1;
                }
                return v1.minor > v2.minor ? -1 : 1;
            }
            return v1.major > v2.major ? -1 : 1;
        }
        if (v1 && !v2) {
            return 1;
        }
        if (!v1 && v2) {
            return -1;
        }
        return 0;
    });

}
export function canCreateVirtualEnv(environments: PythonEnvironment[]) {
    return getSortedEnvsFromWhichWeCanCreateVenvEnv(environments).length;
}
export async function createEnv(environments: PythonEnvironment[]) {
    const templateEnvs = getSortedEnvsFromWhichWeCanCreateVenvEnv(environments);
    if (templateEnvs.length === 0) {
        traceError(`Cannot create a venv without an existing Python environment`);
        return;
    }

    // Use the latest available global env.
    const latestGlobal = templateEnvs.filter(env => env.envType === EnvironmentType.Global);

    type StateType = { dir: string, name: string, templateEnvironment?: PythonEnvironment };
    const currentWorkspaceUri = workspace.workspaceFolders?.length ? workspace.workspaceFolders[0].uri : undefined;
    const templateEnvironment = latestGlobal.length ? latestGlobal[0] : templateEnvs[0];
    const initialState: StateType = { dir: '', name: '', templateEnvironment: undefined };

    const selectTemplateEnv = async (input: MultiStepInput<StateType>, state: StateType): Promise<InputStep<StateType> | void> => {
        type QuickPickItemWithEnvironment = QuickPickItem & { pythonEnvironment: PythonEnvironment };
        const quickPickItems = templateEnvs.map(env => <QuickPickItemWithEnvironment>{
            label: getEnvDisplayInfo(env),
            pythonEnvironment: env,
            picked: env === templateEnvironment,
            description: getDisplayPath(env.envPath || env.path)
        });

        const templateEnv = await input.showQuickPick({
            title: 'Select Python Environment to be used as a template for Virtual Environment',
            placeholder: 'Select Python Environment', acceptFilterBoxTextAsSelection: false, canGoBack: false, matchOnDescription: true, matchOnDetail: true,
            sortByLabel: false, step: 3, totalSteps: 3,
            items: quickPickItems
        }) as (QuickPickItemWithEnvironment | undefined);
        state.templateEnvironment = templateEnv?.pythonEnvironment;
    };

    const specifyDirectory = async (input: MultiStepInput<StateType>, state: StateType): Promise<InputStep<StateType> | void> => {
        const browseButton: QuickInputButton = {
            iconPath: new ThemeIcon('folder'), tooltip: 'Select a folder'
        }
        let selectDirectory = true;
        while (selectDirectory) {
            const enterDirectoryPrompt = () => input.showInputBox({
                title: 'Enter fully qualified path to where the venv would be created', value: currentWorkspaceUri?.fsPath || '', step: 2, totalSteps: 3, prompt: 'Directory',
                validate: async (value) => {
                    if (!value && !currentWorkspaceUri) {
                        return 'Please specify a directory or click the browse button';
                    }
                    if (!value) {
                        return 'Enter a name';
                    }
                    if (!(await fs.pathExists(value))) {
                        return 'Invalid directory';
                    }
                    const targetVenvDir = path.join(value, state.name);
                    if (await fs.pathExists(targetVenvDir)) {
                        return `Virtual folder '${getDisplayPath(targetVenvDir)}' already exists`;
                    }
                },
                buttons: [browseButton]
            });
            const directory = await enterDirectoryPrompt();
            if (directory === browseButton) {
                const dir = await window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: currentWorkspaceUri, openLabel: 'Select Folder', title: 'Select destination for Virtual Environment' });
                if (Array.isArray(dir) && dir.length) {
                    const targetVenvDir = path.join(dir[0].fsPath, state.name);
                    if (await fs.pathExists(targetVenvDir)) {
                        void window.showErrorMessage('A folder with the same name already exists', { modal: true, detail: targetVenvDir });
                    } else {
                        state.dir = dir[0].fsPath;
                        selectDirectory = false;
                        return selectTemplateEnv(input, state);
                    }
                }
                // Display the prompt again.
            } else if (typeof directory === 'string') {
                selectDirectory = false;
                const targetVenvDir = path.join(directory.trim(), state.name);
                if (!(await fs.pathExists(directory.trim()))) {
                    void window.showErrorMessage('Invalid target directory for a Virtual Environment', { modal: true, detail: directory });
                } else if (await fs.pathExists(targetVenvDir)) {
                    void window.showErrorMessage('A folder with the same name already exists', { modal: true, detail: targetVenvDir });
                } else {
                    state.dir = directory.trim();
                    selectDirectory = false;
                    return selectTemplateEnv(input, state);
                }
            } else {
                selectDirectory = false;
            }
        }
    };

    const specifyName = async (input: MultiStepInput<StateType>, state: StateType): Promise<InputStep<StateType> | void> => {
        const name = await input.showInputBox({
            title: 'Enter the name of the virtual environment', value: '.venv', step: 1, totalSteps: 3, prompt: 'Name',
            validate: async (value) => {
                if (!value) {
                    return 'Enter a name';
                }
            }
        });
        if (name) {
            state.name = name.trim();
            return specifyDirectory(input, state);
        }

    };

    const multistepInput = new MultiStepInput<StateType>(new ApplicationShell());
    await multistepInput.run(specifyName, initialState);

    // Verify we completed.
    if (!initialState.dir.trim() || !initialState.name.trim() || !initialState.templateEnvironment) {
        return;
    }
    if (!(await fs.pathExists(initialState.dir))) {
        return;
    }
    if (await fs.pathExists(path.join(initialState.dir, initialState.name))) {
        return;
    }
    try {
        await window.withProgress({ location: ProgressLocation.Notification, title: `Creating environment ${initialState.name}`, cancellable: true },
            async (progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>, token: CancellationToken) => {
                traceInfo(`Creating environment ${initialState.name}`);
                traceInfo([initialState.templateEnvironment!.path, '-m', 'venv', initialState.name].join(' '));
                const result = await execObservable(initialState.templateEnvironment!.path, ['-m', 'venv', initialState.name], {
                    timeout: 60_000,
                    cwd: initialState.dir,
                    token,
                });
                await new Promise<void>(resolve => {
                    result.out.subscribe({
                        next: output => {
                            traceInfo(output.out);
                            progress.report({ message: output.out });
                        },
                        complete: () => resolve()
                    });
                });
            });

        void commands.executeCommand('python.envManager.refresh');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex: any) {
        traceError(`Failed to create environment`, ex);
        window.showErrorMessage(`Failed to create environment ${initialState.name}, ${ex.toString()}`);
    }

}
