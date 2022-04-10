import * as fs from 'fs-extra';
import { CancellationToken, ExtensionContext, Progress } from 'vscode';
import * as tar from 'tar';
import * as request from 'request';
import { getOSType, OSType } from '../../client/common/utils/platform';
import { MICROMAMBA_DIR, MICROMAMBA_EXE } from './constants';

const bz2 = require('unbzip2-stream');
const progress = require('request-progress');

export function activate(_context: ExtensionContext) {
}
function getUrl() {
    switch (getOSType()) {
        case OSType.Windows:
            return 'https://micro.mamba.pm/api/micromamba/win-64/latest';
        case OSType.OSX:
            return process.arch === 'arm64' ? 'https://micro.mamba.pm/api/micromamba/osx-arm64/latest' : 'https://micro.mamba.pm/api/micromamba/osx-64/latest';

        case OSType.Linux:
        default:
            return 'https://micro.mamba.pm/api/micromamba/linux-64/latest';
    }
}
async function getDestinationDirectory() {
    await fs.ensureDir(MICROMAMBA_DIR);
    return MICROMAMBA_DIR;
}

const MB = 1024 * 1024;

type ProgressState = {
    percent: number,               // Overall percent (between 0 to 1)
    speed: number,              // The download speed in bytes/sec
    size: {
        total: number,        // The total payload size in bytes
        transferred: number   // The transferred payload size in bytes
    },
    time?: {
        elapsed: number,        // The total elapsed seconds since the start (3 decimals)
        remaining: number       // The remaining seconds to finish (3 decimals)
    }
}

export async function downloadMamba(uiProgress: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
}>, token: CancellationToken) {
    const [url, downloadDir] = await Promise.all([getUrl(), getDestinationDirectory()]);
    await new Promise<void>((resolve, reject) => {
        const result = request(url);
        token.onCancellationRequested(() => {
            result.abort();
        })
        // The options argument is optional so you can omit it
        progress(result, {
            // throttle: 2000,                    // Throttle the progress event to 2000ms, defaults to 1000ms
            // delay: 1000,                       // Only start to emit after 1000ms delay, defaults to 0ms
            // lengthHeader: 'x-transfer-length'  // Length header to use, defaults to content-length
        })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .on('progress', (state: ProgressState) => {
                const message = `Downloading Micromamba ${(state.percent * 100).toFixed(0)}% (${(state.size.transferred / MB).toFixed(2)} of ${(state.size.total / MB).toFixed(2)}MB).`;
                const suffix = state.time?.remaining ? ` \nRemaining ${(state.time.remaining).toFixed(0)}s` : '';
                uiProgress.report({ message: `${message}${suffix}` });
                console.log('progress', state);
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .on('error', (err: any) => reject(err))
            // File is bz2 compressed, hence needs to be uncompressed into tar.
            // We get this same files (tar.bz2) for all platforms.
            .pipe(bz2())
            .pipe(tar.extract({ cwd: downloadDir }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .on('error', (err: any) => reject(err))
            .on('end', () => resolve());
    });
    return downloadDir;
}

export async function isMicroMambaInstalled() {
    return fs.pathExists(MICROMAMBA_EXE);
}
