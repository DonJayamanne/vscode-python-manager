import { workspace } from 'vscode';
import * as path from 'path';
import { EnvironmentType, PythonEnvironment } from '../client/pythonEnvironments/info';

const untildify = require('untildify');

const home = untildify('~');

export function getEnvironmentId(env: PythonEnvironment) {
    return `${env.envName}:${env.path}`;
}

export function getDisplayPath(value?: string) {
    if (!value) {
        return '';
    }
    value = workspace.asRelativePath(value, false);
    return value.startsWith(home) ? `~${path.sep}${path.relative(home, value)}` : value;
}

export function getEnvironmentTypeName(type: EnvironmentType){
    return type.toString();
}
