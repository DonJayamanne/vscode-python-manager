// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { registerTypes as activationRegisterTypes } from './activation/serviceRegistry';
import { IExtensionActivationManager, IExtensionActivationService } from './activation/types';

import { IApplicationEnvironment } from './common/application/types';
import { UseProposedApi } from './common/constants';
import { IConfigurationService } from './common/types';
import { registerTypes as registerEnvironmentTypes } from '../environments/serviceRegistry';

// components
import * as pythonEnvironments from './pythonEnvironments';

import { ActivationResult, ExtensionState } from './components';
import { Components } from './extensionInit';
import { IInterpreterQuickPick } from './interpreter/configuration/types';
import { registerAllCreateEnvironmentFeatures } from './pythonEnvironments/creation/registrations';
import { Dummy } from '../environments/sillyDI';

export async function activateComponents(
    // `ext` is passed to any extra activation funcs.
    ext: ExtensionState,
    components: Components,
): Promise<ActivationResult[]> {
    // Note that each activation returns a promise that resolves
    // when that activation completes.  However, it might have started
    // some non-critical background operations that do not block
    // extension activation but do block use of the extension "API".
    // Each component activation can't just resolve an "inner" promise
    // for those non-critical operations because `await` (and
    // `Promise.all()`, etc.) will flatten nested promises.  Thus
    // activation resolves `ActivationResult`, which can safely wrap
    // the "inner" promise.

    // TODO: As of now activateLegacy() registers various classes which might
    // be required while activating components. Once registration from
    // activateLegacy() are moved before we activate other components, we can
    // activate them in parallel with the other components.
    // https://github.com/microsoft/vscode-python/issues/15380
    // These will go away eventually once everything is refactored into components.
    const legacyActivationResult = await activateLegacy(ext);
    const promises: Promise<ActivationResult>[] = [
        // More component activations will go here
        pythonEnvironments.activate(components.pythonEnvs, ext),
    ];
    return Promise.all([legacyActivationResult, ...promises]);
}

export function activateFeatures(ext: ExtensionState, _components: Components): void {
    const interpreterQuickPick: IInterpreterQuickPick = ext.legacyIOC.serviceContainer.get<IInterpreterQuickPick>(
        IInterpreterQuickPick,
    );
    registerAllCreateEnvironmentFeatures(ext.disposables, interpreterQuickPick);
}

/// //////////////////////////
// old activation code

// TODO: Gradually move simple initialization
// and DI registration currently in this function over
// to initializeComponents().  Likewise with complex
// init and activation: move them to activateComponents().
// See https://github.com/microsoft/vscode-python/issues/10454.

async function activateLegacy(ext: ExtensionState): Promise<ActivationResult> {
    const { context, legacyIOC } = ext;
    const { serviceManager, serviceContainer } = legacyIOC;

    // register "services"

    const applicationEnv = serviceManager.get<IApplicationEnvironment>(IApplicationEnvironment);
    const { enableProposedApi } = applicationEnv.packageJson;
    serviceManager.addSingletonInstance<boolean>(UseProposedApi, enableProposedApi);
    // Feature specific registrations.
    activationRegisterTypes(serviceManager);

    serviceManager.addSingleton<IExtensionActivationService>(IExtensionActivationService, Dummy);

    // "activate" everything else
    const manager = serviceContainer.get<IExtensionActivationManager>(IExtensionActivationManager);
    context.subscriptions.push(manager);

    // Settings are dependent on Experiment service, so we need to initialize it after experiments are activated.
    serviceContainer.get<IConfigurationService>(IConfigurationService).getSettings();

    const activationPromise = manager.activate();

    registerEnvironmentTypes(serviceManager, context);
    return { fullyReady: activationPromise };
}
