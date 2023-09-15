'use strict';

// This line should always be right on top.

if ((Reflect as any).metadata === undefined) {
    require('reflect-metadata');
}

//===============================================
// We start tracking the extension's startup time at this point.  The
// locations at which we record various Intervals are marked below in
// the same way as this.

const durations = {} as IStartupDurations;
import { StopWatch } from './common/utils/stopWatch';
// Do not move this line of code (used to measure extension load times).
const stopWatch = new StopWatch();

// Initialize file logging here. This should not depend on too many things.
const logDispose: { dispose: () => void }[] = [];

//===============================================
// loading starts here
import './common/extensions';
import { ProgressLocation, ProgressOptions, window } from 'vscode';
import { IDisposableRegistry, IExtensionContext } from './common/types';
import { createDeferred } from './common/utils/async';
import { Common } from './common/utils/localize';
import { activateComponents, activateFeatures } from './extensionActivation';
import { initializeStandard, initializeComponents, initializeGlobals } from './extensionInit';
import { IServiceContainer } from './ioc/types';
import { IStartupDurations } from './types';
import { disposeAll } from './common/utils/resourceLifecycle';

durations.codeLoadingTime = stopWatch.elapsedTime;

//===============================================
// loading ends here

// These persist between activations:
let activatedServiceContainer: IServiceContainer | undefined;

/////////////////////////////
// public functions

export async function activate(context: IExtensionContext): Promise<void> {
    await activateUnsafe(context, stopWatch, durations);
}

export async function deactivate(): Promise<void> {
    // Make sure to shutdown anybody who needs it.
    if (activatedServiceContainer) {
        const disposables = activatedServiceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        await disposeAll(disposables);
        // Remove everything that is already disposed.
        while (disposables.pop());
    }
}

/////////////////////////////
// activation helpers

async function activateUnsafe(
    context: IExtensionContext,
    startupStopWatch: StopWatch,
    startupDurations: IStartupDurations,
): Promise<[Promise<void>, IServiceContainer]> {
    // Add anything that we got from initializing logs to dispose.
    context.subscriptions.push(...logDispose);
    const activationDeferred = createDeferred<void>();
    displayProgress(activationDeferred.promise);
    startupDurations.startActivateTime = startupStopWatch.elapsedTime;

    //===============================================
    // activation starts here

    // First we initialize.
    const ext = initializeGlobals(context);
    activatedServiceContainer = ext.legacyIOC.serviceContainer;
    // Note standard utils especially experiment and platform code are fundamental to the extension
    // and should be available before we activate anything else.Hence register them first.
    initializeStandard(ext);
    const components = await initializeComponents(ext);

    // Then we finish activating.
    const componentsActivated = await activateComponents(ext, components);
    activateFeatures(ext, components);

    const nonBlocking = componentsActivated.map((r) => r.fullyReady);
    const activationPromise = (async () => {
        await Promise.all(nonBlocking);
    })();

    //===============================================
    // activation ends here

    startupDurations.totalActivateTime = startupStopWatch.elapsedTime - startupDurations.startActivateTime;
    activationDeferred.resolve();
    return [activationPromise, ext.legacyIOC.serviceContainer];
}

function displayProgress(promise: Promise<any>) {
    const progressOptions: ProgressOptions = { location: ProgressLocation.Window, title: Common.loadingExtension };
    window.withProgress(progressOptions, () => promise);
}
