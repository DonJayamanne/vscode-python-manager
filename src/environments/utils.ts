import { PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import { EnvironmentType } from '../client/pythonEnvironments/info';
import { Resource } from '../client/common/types';

export async function getResolvedActiveInterpreter(resource: Resource) {
    const api = await PythonExtension.api()
    const activeEnv = api.environments.getActiveEnvironmentPath(resource);
    return activeEnv ? api.environments.resolveEnvironment(activeEnv) : undefined;

}
export async function getInterpreterDetailsFromExecPath(execPath: string) {
    const api = await PythonExtension.api()
    return api.environments.resolveEnvironment(execPath);


}
export function isCondaEnvironment(env: ResolvedEnvironment) {
    return getEnvironmentType(env).toLowerCase() === EnvironmentType.Conda.toLowerCase();
}
export function isUnknownEnvironment(env: ResolvedEnvironment): boolean {
    if (getEnvironmentType(env).length === 0 || getEnvironmentType(env).toLowerCase() === EnvironmentType.Unknown.toLowerCase()) {
        if (env.tools.length === 0) {
            return true;
        }
    }
    return false;
}
export function isVirtualEnvironment(env: ResolvedEnvironment): boolean {
    if (getEnvironmentType(env).length === 0 || getEnvironmentType(env).toLowerCase() === EnvironmentType.Unknown.toLowerCase()) {
        if (env.tools.length === 0) {
            return true;
        }
    }
    return false;
}

function getEnvironmentType(env: ResolvedEnvironment) {
    return env.environment?.type || '';
}
