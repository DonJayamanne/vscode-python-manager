// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IDisposableRegistry } from '../../common/types';
import { IInterpreterQuickPick } from '../../interpreter/configuration/types';
import { registerCreateEnvironmentFeatures } from './createEnvApi';
import { registerCreateEnvironmentButtonFeatures } from './createEnvButtonContext';

export function registerAllCreateEnvironmentFeatures(
    disposables: IDisposableRegistry,
    interpreterQuickPick: IInterpreterQuickPick,
): void {
    registerCreateEnvironmentFeatures(disposables, interpreterQuickPick);
    registerCreateEnvironmentButtonFeatures(disposables);
}
