// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as util from 'util';
import { OutputChannel } from 'vscode';
import { Arguments, ILogging } from './types';

export class OutputChannelLogger implements ILogging {
    constructor(private readonly channel: OutputChannel) { }

    public traceLog(...data: Arguments): void {
        this.channel.appendLine(util.format(...data));
    }

    public traceError(...data: Arguments): void {
        this.channel.appendLine(`Error: ${util.format(...data)}`);
    }

    public traceWarn(...data: Arguments): void {
        this.channel.appendLine(`Warn: ${util.format(...data)}`);
    }

    public traceInfo(...data: Arguments): void {
        this.channel.appendLine(`Info: ${util.format(...data)}`);
    }

    public traceVerbose(...data: Arguments): void {
        this.channel.appendLine(`Debug: ${util.format(...data)}`);
    }
}
