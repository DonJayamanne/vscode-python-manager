// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IExtensionActivationService } from '../activation/types';
import { IServiceManager } from '../ioc/types';
import { EnvironmentActivationService } from './activation/service';
import { TerminalEnvVarCollectionService } from './activation/terminalEnvVarCollectionService';
import { IEnvironmentActivationService } from './activation/types';
import { EnvironmentTypeComparer } from './configuration/environmentTypeComparer';
import { SetInterpreterCommand } from './configuration/interpreterSelector/commands/setInterpreter';
import { InterpreterSelector } from './configuration/interpreterSelector/interpreterSelector';
import { IInterpreterComparer, IInterpreterQuickPick, IInterpreterSelector } from './configuration/types';
import { IInterpreterHelper, IInterpreterService } from './contracts';
import { InterpreterHelper } from './helpers';
import { InterpreterService } from './interpreterService';

/**
 * Register all the new types inside this method.
 * This method is created for testing purposes. Registers all interpreter types except `IInterpreterAutoSelectionProxyService`, `IEnvironmentActivationService`.
 * See use case in `src\test\serviceRegistry.ts` for details
 * @param serviceManager
 */

function registerInterpreterTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingleton<IInterpreterService>(IInterpreterService, InterpreterService);

    serviceManager.addSingleton<IInterpreterSelector>(IInterpreterSelector, InterpreterSelector);
    serviceManager.addSingleton<IInterpreterQuickPick>(IInterpreterQuickPick, SetInterpreterCommand);
    serviceManager.addSingleton<IInterpreterHelper>(IInterpreterHelper, InterpreterHelper);

    serviceManager.addSingleton<IInterpreterComparer>(IInterpreterComparer, EnvironmentTypeComparer);
}

export function registerTypes(serviceManager: IServiceManager): void {
    registerInterpreterTypes(serviceManager);
    serviceManager.addSingleton<IEnvironmentActivationService>(
        EnvironmentActivationService,
        EnvironmentActivationService,
    );
    serviceManager.addSingleton<IEnvironmentActivationService>(
        IEnvironmentActivationService,
        EnvironmentActivationService,
    );
    serviceManager.addSingleton<IExtensionActivationService>(
        IExtensionActivationService,
        TerminalEnvVarCollectionService,
    );
}
