import { Environment, ResolvedEnvironment } from '@vscode/python-extension';
import { workspace } from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import { TemporaryFile } from '../client/common/platform/types';
import { getEnvironmentType } from './utils';

const untildify = require('untildify');

export const home = untildify('~');

export function getDisplayPath(value?: string) {
    if (!value) {
        return '';
    }
    value = workspace.asRelativePath(value, (workspace.workspaceFolders || []).length > 1);
    return value.startsWith(home) ? `~${path.sep}${path.relative(home, value)}` : value;
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

export function getEnvLoggingInfo(env: Environment | ResolvedEnvironment) {
    return `${getEnvironmentType(env)}:(${env.environment?.name || env.path},${getDisplayPath(env.path)})`;
}
export function getEnvDisplayInfo(env: Environment | ResolvedEnvironment) {
    return env.environment?.name || env.environment?.folderUri
        ? getDisplayPath(env.environment.folderUri.fsPath)
        : getDisplayPath(env.path);
}
