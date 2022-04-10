import { commands, ExtensionContext, ExtensionMode } from 'vscode';
import { PythonEnvironment } from '../client/pythonEnvironments/info';

const LastExtensionVersionKey = 'LAST_EXTENSION_VERSION';
export const EnvironmentsCacheMementoKey = 'PYTHON:PACKAGE_MANAGER:ENVS_CACHE';

let cacheClearedOnce = false;
export async function clearCacheIfNewVersionInstalled(context: ExtensionContext, clearEnvCache = false) {
    const shouldRefresh = context.extensionMode === ExtensionMode.Development;
    if (!shouldRefresh && (cacheClearedOnce || context.globalState.get(LastExtensionVersionKey, '') === context.extension?.packageJSON?.version)) {
        return;
    }
    cacheClearedOnce = true;
    let venvEnvs: PythonEnvironment[] = []
    if (!clearEnvCache) {
        venvEnvs = context.globalState.get<PythonEnvironment[]>(EnvironmentsCacheMementoKey, []);
    }

    await Promise.all([
        commands.executeCommand('python.envManager.clearPersistentStorage'),
        context.globalState.keys().filter(key => key !== LastExtensionVersionKey).map(key => context.globalState.update(key, undefined)),
        context.workspaceState.keys().map(key => context.workspaceState.update(key, undefined))
    ]);
    await context.globalState.update(LastExtensionVersionKey, context.extension.packageJSON.version);
    if (!clearEnvCache && Array.isArray(venvEnvs)) {
        await context.globalState.update(EnvironmentsCacheMementoKey, venvEnvs);
    }
}
