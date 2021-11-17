// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import type { IDisposable, Resource } from '../common/types';

export const IExtensionActivationManager = Symbol('IExtensionActivationManager');
/**
 * Responsible for activation of extension.
 *
 * @export
 * @interface IExtensionActivationManager
 * @extends {IDisposable}
 */
export interface IExtensionActivationManager extends IDisposable {
    /**
     * Method invoked when extension activates (invoked once).
     *
     * @returns {Promise<void>}
     * @memberof IExtensionActivationManager
     */
    activate(): Promise<void>;
    /**
     * Method invoked when a workspace is loaded.
     * This is where we place initialization scripts for each workspace.
     * (e.g. if we need to run code for each workspace, then this is where that happens).
     *
     * @param {Resource} resource
     * @returns {Promise<void>}
     * @memberof IExtensionActivationManager
     */
    activateWorkspace(resource: Resource): Promise<void>;
}

export const IExtensionActivationService = Symbol('IExtensionActivationService');
/**
 * Classes implementing this interface will have their `activate` methods
 * invoked for every workspace folder (in multi-root workspace folders) during the activation of the extension.
 * This is a great hook for extension activation code, i.e. you don't need to modify
 * the `extension.ts` file to invoke some code when extension gets activated.
 * @export
 * @interface IExtensionActivationService
 */
export interface IExtensionActivationService {
    supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean };
    activate(resource: Resource): Promise<void>;
}
export const IExtensionSingleActivationService = Symbol('IExtensionSingleActivationService');
/**
 * Classes implementing this interface will have their `activate` methods
 * invoked during the activation of the extension.
 * This is a great hook for extension activation code, i.e. you don't need to modify
 * the `extension.ts` file to invoke some code when extension gets activated.
 * @export
 * @interface IExtensionSingleActivationService
 */
export interface IExtensionSingleActivationService {
    supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean };
    activate(): Promise<void>;
}
