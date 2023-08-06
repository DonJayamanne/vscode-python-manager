import { Environment, KnownEnvironmentTools, PythonExtension, ResolvedEnvironment } from '@vscode/python-extension';
import { EnvironmentType } from '../client/pythonEnvironments/info';
import { Resource } from '../client/common/types';

export async function getResolvedActiveInterpreter(resource: Resource) {
    const api = await PythonExtension.api();
    const activeEnv = api.environments.getActiveEnvironmentPath(resource);
    return activeEnv ? api.environments.resolveEnvironment(activeEnv) : undefined;
}
export async function getInterpreterDetailsFromExecPath(execPath: string) {
    const api = await PythonExtension.api();
    return api.environments.resolveEnvironment(execPath);
}

const KnownEnvironmentToolsToEnvironmentTypeMapping = new Map<KnownEnvironmentTools, EnvironmentType>([
    ['Conda', EnvironmentType.Conda],
    ['Pipenv', EnvironmentType.Pipenv],
    ['Poetry', EnvironmentType.Poetry],
    ['Pyenv', EnvironmentType.Pyenv],
    ['Unknown', EnvironmentType.Unknown],
    ['Venv', EnvironmentType.Venv],
    ['VirtualEnv', EnvironmentType.VirtualEnv],
    ['VirtualEnvWrapper', EnvironmentType.VirtualEnvWrapper],
]);
export function isCondaEnvironment(env: ResolvedEnvironment | Environment) {
    return getEnvironmentType(env) === EnvironmentType.Conda;
}

export function isNonPythonCondaEnvironment(env: ResolvedEnvironment | Environment) {
    return getEnvironmentType(env) === EnvironmentType.Conda && !env.executable.uri;
}

export function getEnvironmentType({ tools }: Environment | ResolvedEnvironment) {
    tools = tools.map((tool) => tool.toLowerCase());
    for (const tool of tools) {
        if (tool === EnvironmentType.Conda.toLowerCase()) {
            return EnvironmentType.Conda;
        }
        if (tool === EnvironmentType.Venv.toLowerCase()) {
            return EnvironmentType.Venv;
        }
        if (tool === EnvironmentType.VirtualEnv.toLowerCase()) {
            return EnvironmentType.VirtualEnv;
        }
        if (tool === EnvironmentType.VirtualEnvWrapper.toLowerCase()) {
            return EnvironmentType.VirtualEnvWrapper;
        }
        if (tool === EnvironmentType.Poetry.toLowerCase()) {
            return EnvironmentType.Poetry;
        }
        if (tool === EnvironmentType.Pipenv.toLowerCase()) {
            return EnvironmentType.Pipenv;
        }
        if (tool === EnvironmentType.Pyenv.toLowerCase()) {
            return EnvironmentType.Pyenv;
        }
        if (KnownEnvironmentToolsToEnvironmentTypeMapping.has((tool as unknown) as KnownEnvironmentTools)) {
            return KnownEnvironmentToolsToEnvironmentTypeMapping.get((tool as unknown) as KnownEnvironmentTools)!;
        }
    }
    return EnvironmentType.Unknown;
}
