// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PythonExtension } from '@vscode/python-extension';
import { inject, injectable } from 'inversify';
import { Event, Uri, ConfigurationChangeEvent } from 'vscode';
import { IServiceContainer } from '../../ioc/types';
import { IWorkspaceService } from '../application/types';
import { PythonSettings } from '../configSettings';
import { IConfigurationService, IPythonSettings } from '../types';

@injectable()
export class ConfigurationService implements IConfigurationService {
    private readonly workspaceService: IWorkspaceService;

    private api!: PythonExtension;

    constructor(@inject(IServiceContainer) private readonly serviceContainer: IServiceContainer) {
        this.workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    }

    initialize(api: PythonExtension): void {
        this.api = api;
    }

    // eslint-disable-next-line class-methods-use-this
    public get onDidChange(): Event<ConfigurationChangeEvent | undefined> {
        return PythonSettings.onConfigChange();
    }

    public getSettings(resource?: Uri): IPythonSettings {
        return PythonSettings.getInstance(this.api, resource, this.workspaceService);
    }
}
