// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { ConfigurationTarget, Uri, WorkspaceConfiguration } from 'vscode';
import { IInterpreterAutoSelectionService } from '../../interpreter/autoSelection/types';
import { IServiceContainer } from '../../ioc/types';
import { IWorkspaceService } from '../application/types';
import { PythonSettings } from '../configSettings';
import { isUnitTestExecution } from '../constants';
import { IConfigurationService, IInterpreterPathService, IPythonSettings } from '../types';

@injectable()
export class ConfigurationService implements IConfigurationService {
    private readonly workspaceService: IWorkspaceService;

    constructor(@inject(IServiceContainer) private readonly serviceContainer: IServiceContainer) {
        this.workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    }

    public getSettings(resource?: Uri): IPythonSettings {
        const InterpreterAutoSelectionService = this.serviceContainer.get<IInterpreterAutoSelectionService>(
            IInterpreterAutoSelectionService,
        );
        const interpreterPathService = this.serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        return PythonSettings.getInstance(
            resource,
            InterpreterAutoSelectionService,
            this.workspaceService,
            interpreterPathService,
        );
    }

    public async updateSectionSetting(
        section: string,
        setting: string,
        value?: unknown,
        resource?: Uri,
        configTarget?: ConfigurationTarget,
    ): Promise<void> {
        const interpreterPathService = this.serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        // DON:
        const inExperimentDeprecatePythonPath = true;
        const defaultSetting = {
            uri: resource,
            target: configTarget || ConfigurationTarget.WorkspaceFolder,
        };
        let settingsInfo = defaultSetting;
        if (section === 'python' && configTarget !== ConfigurationTarget.Global) {
            settingsInfo = PythonSettings.getSettingsUriAndTarget(resource, this.workspaceService);
        }
        configTarget = configTarget || settingsInfo.target;

        const configSection = this.workspaceService.getConfiguration(section, settingsInfo.uri);
        const currentValue =
            inExperimentDeprecatePythonPath && section === 'python' && setting === 'pythonPath'
                ? interpreterPathService.inspect(settingsInfo.uri)
                : configSection.inspect(setting);

        if (
            currentValue !== undefined &&
            ((configTarget === ConfigurationTarget.Global && currentValue.globalValue === value) ||
                (configTarget === ConfigurationTarget.Workspace && currentValue.workspaceValue === value) ||
                (configTarget === ConfigurationTarget.WorkspaceFolder && currentValue.workspaceFolderValue === value))
        ) {
            return;
        }
        if (section === 'python' && setting === 'pythonPath') {
            if (inExperimentDeprecatePythonPath) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await interpreterPathService.update(settingsInfo.uri, configTarget, value as any);
            }
        } else {
            await configSection.update(setting, value, configTarget);
            await this.verifySetting(configSection, configTarget, setting, value);
        }
    }

    public async updateSetting(
        setting: string,
        value?: unknown,
        resource?: Uri,
        configTarget?: ConfigurationTarget,
    ): Promise<void> {
        return this.updateSectionSetting('python', setting, value, resource, configTarget);
    }

    // eslint-disable-next-line class-methods-use-this
    public isTestExecution(): boolean {
        return process.env.VSC_PYTHON_CI_TEST === '1';
    }

    private async verifySetting(
        configSection: WorkspaceConfiguration,
        target: ConfigurationTarget,
        settingName: string,
        value?: unknown,
    ): Promise<void> {
        if (this.isTestExecution() && !isUnitTestExecution()) {
            let retries = 0;
            do {
                const setting = configSection.inspect(settingName);
                if (!setting && value === undefined) {
                    break; // Both are unset
                }
                if (setting && value !== undefined) {
                    // Both specified
                    let actual;
                    if (target === ConfigurationTarget.Global) {
                        actual = setting.globalValue;
                    } else if (target === ConfigurationTarget.Workspace) {
                        actual = setting.workspaceValue;
                    } else {
                        actual = setting.workspaceFolderValue;
                    }
                    if (actual === value) {
                        break;
                    }
                }
                // Wait for settings to get refreshed.
                await new Promise((resolve) => setTimeout(resolve, 250));
                retries += 1;
            } while (retries < 20);
        }
    }
}
