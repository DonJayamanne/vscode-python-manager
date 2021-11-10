// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { interfaces } from 'inversify';
import { ClassType } from '../ioc/types';
import { CodeExecutionManager } from './codeExecution/codeExecutionManager';
import { DjangoShellCodeExecutionProvider } from './codeExecution/djangoShellCodeExecution';
import { CodeExecutionHelper } from './codeExecution/helper';
import { ReplProvider } from './codeExecution/repl';
import { TerminalCodeExecutionProvider } from './codeExecution/terminalCodeExecution';
import { ICodeExecutionHelper, ICodeExecutionManager, ICodeExecutionService } from './types';

interface IServiceRegistry {
    addSingleton<T>(
        serviceIdentifier: interfaces.ServiceIdentifier<T>,
        constructor: ClassType<T>,
        name?: string | number | symbol,
    ): void;
}

export function registerTypes(serviceManager: IServiceRegistry): void {
    serviceManager.addSingleton<ICodeExecutionHelper>(ICodeExecutionHelper, CodeExecutionHelper);

    serviceManager.addSingleton<ICodeExecutionManager>(ICodeExecutionManager, CodeExecutionManager);

    serviceManager.addSingleton<ICodeExecutionService>(
        ICodeExecutionService,
        DjangoShellCodeExecutionProvider,
        'djangoShell',
    );
    serviceManager.addSingleton<ICodeExecutionService>(
        ICodeExecutionService,
        TerminalCodeExecutionProvider,
        'standard',
    );
    serviceManager.addSingleton<ICodeExecutionService>(ICodeExecutionService, ReplProvider, 'repl');
}
