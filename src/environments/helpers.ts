import { workspace } from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import { EnvironmentType, PythonEnvironment } from '../client/pythonEnvironments/info';
import { TemporaryFile } from '../client/common/platform/types';

const untildify = require('untildify');

export const home = untildify('~');

export function getEnvironmentId(env: PythonEnvironment) {
    if (env.envType === EnvironmentType.Conda) {
        // Uniqueness is with the env path.
        // Possible we have conda environments without Python installed in it.
        return `${env.envPath}:${env.path}`
    }
    return `${env.envName}:${env.path}`;
}

export function getDisplayPath(value?: string) {
    if (!value) {
        return '';
    }
    value = workspace.asRelativePath(value, false);
    return value.startsWith(home) ? `~${path.sep}${path.relative(home, value)}` : value;
}

export function getEnvironmentTypeName(type: EnvironmentType) {
    return type.toString();
}

export function createTempFile(extension = '.txt') {
    return new Promise<TemporaryFile>((resolve, reject) => {
        tmp.file({ postfix: extension }, (err, filename, _fd, cleanUp) => {
            if (err) {
                return reject(err);
            }
            resolve({
                filePath: filename,
                dispose: cleanUp,
            });
        });
    });
}

export function canEnvBeDeleted(envType: EnvironmentType) {
    switch (envType) {
        case EnvironmentType.Conda:
        case EnvironmentType.Venv:
        case EnvironmentType.VirtualEnv:
        case EnvironmentType.VirtualEnvWrapper:
            return true;
        case EnvironmentType.Pipenv:
        case EnvironmentType.Poetry:
        case EnvironmentType.Pyenv:
        case EnvironmentType.System:
        case EnvironmentType.Unknown:
            return false;
        default:
            return false;
    }
}

export function canEnvBeCreated(envType: EnvironmentType) {
    switch (envType) {
        case EnvironmentType.Conda:
        case EnvironmentType.Venv:
            return true;
        case EnvironmentType.VirtualEnv:
        case EnvironmentType.VirtualEnvWrapper:
        case EnvironmentType.Pipenv:
        case EnvironmentType.Poetry:
        case EnvironmentType.Pyenv:
        case EnvironmentType.System:
        case EnvironmentType.Unknown:
            return false;
        default:
            return false;
    }
}

export function getEnvLoggingInfo(env: PythonEnvironment) {
    return `${env.envType}:(${env.displayName || env.envName},${getDisplayPath(env.envPath || env.path)})`;
}
export function getEnvDisplayInfo(env: PythonEnvironment) {
    return env.displayName || env.envName || getDisplayPath(env.envPath) || getDisplayPath(env.path);
}
