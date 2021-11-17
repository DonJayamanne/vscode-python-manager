// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IWorkspaceService } from './application/types';
import { IInterpreterPathProxyService, IInterpreterPathService, Resource } from './types';
import { SystemVariables } from './variables/systemVariables';

@injectable()
export class InterpreterPathProxyService implements IInterpreterPathProxyService {
    constructor(
        @inject(IInterpreterPathService) private readonly interpreterPathService: IInterpreterPathService,
        @inject(IWorkspaceService) private readonly workspace: IWorkspaceService,
    ) {}

    public get(resource: Resource): string {
        const systemVariables = new SystemVariables(
            undefined,
            this.workspace.getWorkspaceFolder(resource)?.uri.fsPath,
            this.workspace,
        );
        const pythonSettings = this.workspace.getConfiguration('python', resource);
        return systemVariables.resolveAny(
            // DON:
            // eslint-disable-next-line no-constant-condition
            true
                ? // this.experiment.inExperimentSync(DeprecatePythonPath.experiment)
                  this.interpreterPathService.get(resource)
                : pythonSettings.get<string>('pythonPath'),
        )!;
    }
}
