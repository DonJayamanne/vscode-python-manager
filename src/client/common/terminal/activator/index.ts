// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Terminal } from 'vscode';
import { ITerminalActivator, ITerminalHelper, TerminalActivationOptions } from '../types';
import { BaseTerminalActivator } from './base';

@injectable()
export class TerminalActivator implements ITerminalActivator {
    protected baseActivator!: ITerminalActivator;
    private pendingActivations = new WeakMap<Terminal, Promise<boolean>>();
    constructor(
        @inject(ITerminalHelper) readonly helper: ITerminalHelper,
    ) {
        this.initialize();
    }
    public async activateEnvironmentInTerminal(
        terminal: Terminal,
        options?: TerminalActivationOptions,
    ): Promise<boolean> {
        let promise = this.pendingActivations.get(terminal);
        if (promise) {
            return promise;
        }
        promise = this.activateEnvironmentInTerminalImpl(terminal, options);
        this.pendingActivations.set(terminal, promise);
        return promise;
    }
    private async activateEnvironmentInTerminalImpl(
        _terminal: Terminal,
        _options?: TerminalActivationOptions,
    ): Promise<boolean> {
        return false;
    }
    protected initialize() {
        this.baseActivator = new BaseTerminalActivator(this.helper);
    }
}
