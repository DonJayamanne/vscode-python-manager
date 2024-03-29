// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Environment, EnvironmentsChangeEvent, PythonExtension } from '@vscode/python-extension';
import { inject, injectable } from 'inversify';
import { cloneDeep } from 'lodash';
import {
    l10n,
    QuickInputButton,
    QuickInputButtons,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
} from 'vscode';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../../../common/application/types';
import { Commands, Octicons, ThemeIcons } from '../../../../common/constants';
import { isParentPath } from '../../../../common/platform/fs-paths';
import { IPlatformService } from '../../../../common/platform/types';
import { IConfigurationService, IPathUtils, Resource } from '../../../../common/types';
import { Common, InterpreterQuickPickList } from '../../../../common/utils/localize';
import { noop } from '../../../../common/utils/misc';
import {
    IMultiStepInput,
    IMultiStepInputFactory,
    InputFlowAction,
    InputStep,
    IQuickPickParameters,
    QuickInputButtonSetup,
} from '../../../../common/utils/multiStepInput';
import { SystemVariables } from '../../../../common/variables/systemVariables';
import { TriggerRefreshOptions } from '../../../../pythonEnvironments/base/locator';
import { EnvironmentType } from '../../../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../../../telemetry';
import { EventName } from '../../../../telemetry/constants';
import { IInterpreterService } from '../../../contracts';
import {
    IInterpreterQuickPick,
    IInterpreterQuickPickItem,
    IInterpreterSelector,
    InterpreterQuickPickParams,
    ISpecialQuickPickItem,
} from '../../types';
import { BaseInterpreterSelectorCommand } from './base';
import { getEnvironmentType, isNonPythonCondaEnvironment } from '../../../../../environments/utils';

export type InterpreterStateArgs = { path?: string; workspace: Resource };
type QuickPickType = IInterpreterQuickPickItem | ISpecialQuickPickItem | QuickPickItem;

function isInterpreterQuickPickItem(item: QuickPickType): item is IInterpreterQuickPickItem {
    return 'interpreter' in item;
}

function isSpecialQuickPickItem(item: QuickPickType): item is ISpecialQuickPickItem {
    return 'alwaysShow' in item;
}

function isSeparatorItem(item: QuickPickType): item is QuickPickItem {
    return 'kind' in item && item.kind === QuickPickItemKind.Separator;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EnvGroups {
    export const Workspace = InterpreterQuickPickList.workspaceGroupName;
    export const Conda = 'Conda';
    export const Global = InterpreterQuickPickList.globalGroupName;
    export const VirtualEnv = 'VirtualEnv';
    export const PipEnv = 'PipEnv';
    export const Pyenv = 'Pyenv';
    export const Venv = 'Venv';
    export const Poetry = 'Poetry';
    export const VirtualEnvWrapper = 'VirtualEnvWrapper';
    export const ActiveState = 'ActiveState';
    export const Recommended = Common.recommended;
}

@injectable()
export class SetInterpreterCommand extends BaseInterpreterSelectorCommand implements IInterpreterQuickPick {
    private readonly manualEntrySuggestion: ISpecialQuickPickItem = {
        label: `${Octicons.Add} ${InterpreterQuickPickList.enterPath.label}`,
        alwaysShow: true,
    };

    private readonly refreshButton = {
        iconPath: new ThemeIcon(ThemeIcons.Refresh),
        tooltip: InterpreterQuickPickList.refreshInterpreterList,
    };

    private readonly noPythonInstalled: ISpecialQuickPickItem = {
        label: `${Octicons.Error} ${InterpreterQuickPickList.noPythonInstalled}`,
        detail: InterpreterQuickPickList.clickForInstructions,
        alwaysShow: true,
    };

    private wasNoPythonInstalledItemClicked = false;

    private readonly tipToReloadWindow: ISpecialQuickPickItem = {
        label: `${Octicons.Lightbulb} Reload the window if you installed Python but don't see it`,
        detail: `Click to run \`Developer: Reload Window\` command`,
        alwaysShow: true,
    };

    private api!: PythonExtension;

    private isBusyLoadingPythonEnvs = false;

    constructor(
        @inject(IApplicationShell) applicationShell: IApplicationShell,
        @inject(IPathUtils) pathUtils: IPathUtils,
        @inject(IConfigurationService) configurationService: IConfigurationService,
        @inject(ICommandManager) commandManager: ICommandManager,
        @inject(IMultiStepInputFactory) private readonly multiStepFactory: IMultiStepInputFactory,
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IInterpreterSelector) private readonly interpreterSelector: IInterpreterSelector,
        @inject(IWorkspaceService) workspaceService: IWorkspaceService,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
    ) {
        super(commandManager, applicationShell, workspaceService, pathUtils, configurationService);
        this.isBusyLoadingPythonEnvs = true;
        PythonExtension.api().then((api) => {
            this.api = api;
            api.environments.refreshEnvironments().finally(() => {
                this.isBusyLoadingPythonEnvs = false;
            });
        });
    }

    public async activate(): Promise<void> {
        // this.disposables.push(
        //     this.commandManager.registerCommand(Commands.Set_Interpreter, this.setInterpreter.bind(this)),
        // );
    }

    public async _pickInterpreter(
        input: IMultiStepInput<InterpreterStateArgs>,
        state: InterpreterStateArgs,
        filter?: (i: Environment) => boolean,
        params?: InterpreterQuickPickParams,
    ): Promise<void | InputStep<InterpreterStateArgs>> {
        const api = await PythonExtension.api();
        // If the list is refreshing, it's crucial to maintain sorting order at all
        // times so that the visible items do not change.
        const preserveOrderWhenFiltering = this.isBusyLoadingPythonEnvs;
        const suggestions = this._getItems(api, state.workspace, filter, params);
        state.path = undefined;
        const currentInterpreterPathDisplay = this.pathUtils.getDisplayName(
            this.configurationService.getSettings(state.workspace).pythonPath,
            state.workspace ? state.workspace.fsPath : undefined,
        );
        const placeholder =
            params?.placeholder === null
                ? undefined
                : params?.placeholder ?? l10n.t('Selected Interpreter: {0}', currentInterpreterPathDisplay);
        const title =
            params?.title === null ? undefined : params?.title ?? InterpreterQuickPickList.browsePath.openButtonLabel;
        const buttons: QuickInputButtonSetup[] = [
            {
                button: this.refreshButton,
                callback: (quickpickInput) => {
                    this.refreshCallback(quickpickInput, { isButton: true, showBackButton: params?.showBackButton });
                },
            },
        ];
        if (params?.showBackButton) {
            buttons.push({
                button: QuickInputButtons.Back,
                callback: () => {
                    // Do nothing. This is handled as a promise rejection in the quickpick.
                },
            });
        }

        const selection = await input.showQuickPick<QuickPickType, IQuickPickParameters<QuickPickType>>({
            placeholder,
            items: suggestions,
            sortByLabel: !preserveOrderWhenFiltering,
            keepScrollPosition: true,
            activeItem: this.getActiveItem(state.workspace, suggestions), // Use a promise here to ensure quickpick is initialized synchronously.
            matchOnDetail: true,
            matchOnDescription: true,
            title,
            customButtonSetups: buttons,
            initialize: (quickPick) => {
                // Note discovery is no longer guranteed to be auto-triggered on extension load, so trigger it when
                // user interacts with the interpreter picker but only once per session. Users can rely on the
                // refresh button if they want to trigger it more than once. However if no envs were found previously,
                // always trigger a refresh.
                if (this.api.environments.known.length === 0) {
                    this.refreshCallback(quickPick, { showBackButton: params?.showBackButton });
                } else {
                    this.refreshCallback(quickPick, {
                        ifNotTriggerredAlready: true,
                        showBackButton: params?.showBackButton,
                    });
                }
            },
            onChangeItem: {
                event: this.api.environments.onDidChangeEnvironments,
                // It's essential that each callback is handled synchronously, as result of the previous
                // callback influences the input for the next one. Input here is the quickpick itself.
                callback: (event: EnvironmentsChangeEvent, quickPick) => {
                    if (this.isBusyLoadingPythonEnvs) {
                        quickPick.busy = true;
                        this.api.environments.refreshEnvironments().then(() => {
                            // Items are in the final state as all previous callbacks have finished executing.
                            quickPick.busy = false;
                            // Ensure we set a recommended item after refresh has finished.
                            this.updateQuickPickItems(api, quickPick, undefined, state.workspace, filter, params);
                        });
                    }
                    this.updateQuickPickItems(api, quickPick, event, state.workspace, filter, params);
                },
            },
        });

        if (selection === undefined) {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_SELECTED, undefined, { action: 'escape' });
        } else if (selection.label === this.manualEntrySuggestion.label) {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTER_OR_FIND);
            return this._enterOrBrowseInterpreterPath.bind(this);
        } else if (selection.label === this.noPythonInstalled.label) {
            this.commandManager.executeCommand(Commands.InstallPython).then(noop, noop);
            this.wasNoPythonInstalledItemClicked = true;
        } else if (selection.label === this.tipToReloadWindow.label) {
            this.commandManager.executeCommand('workbench.action.reloadWindow').then(noop, noop);
        } else {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_SELECTED, undefined, { action: 'selected' });
            state.path = (selection as IInterpreterQuickPickItem).path;
        }
        return undefined;
    }

    public _getItems(
        api: PythonExtension,
        resource: Resource,
        filter: ((i: Environment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): QuickPickType[] {
        const suggestions: QuickPickType[] = [this.manualEntrySuggestion];
        const defaultInterpreterPathSuggestion = this.getDefaultInterpreterPathSuggestion(resource);
        if (defaultInterpreterPathSuggestion) {
            suggestions.push(defaultInterpreterPathSuggestion);
        }
        const interpreterSuggestions = this.getSuggestions(api, resource, filter, params);
        this.finalizeItems(api, interpreterSuggestions, resource, params);
        suggestions.push(...interpreterSuggestions);
        return suggestions;
    }

    private getSuggestions(
        api: PythonExtension,
        resource: Resource,
        filter: ((i: Environment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): QuickPickType[] {
        const workspaceFolder = this.workspaceService.getWorkspaceFolder(resource);
        const items = this.interpreterSelector
            .getSuggestions(api, resource, this.isBusyLoadingPythonEnvs)
            .filter((i) => !filter || filter(i.interpreter));
        if (this.isBusyLoadingPythonEnvs) {
            // We cannot put items in groups while the list is loading as group of an item can change.
            return items;
        }
        const itemsWithFullName = this.interpreterSelector
            .getSuggestions(api, resource, true)
            .filter((i) => !filter || filter(i.interpreter));
        let recommended: IInterpreterQuickPickItem | undefined;
        if (!params?.skipRecommended) {
            recommended = this.interpreterSelector.getRecommendedSuggestion(
                itemsWithFullName,
                this.workspaceService.getWorkspaceFolder(resource)?.uri,
            );
        }
        if (recommended && items[0].interpreter.id === recommended.interpreter.id) {
            items.shift();
        }
        return getGroupedQuickPickItems(items, recommended, workspaceFolder?.uri.fsPath);
    }

    private async getActiveItem(resource: Resource, suggestions: QuickPickType[]) {
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        const activeInterpreterItem = suggestions.find(
            (i) => isInterpreterQuickPickItem(i) && i.interpreter.id === interpreter?.id,
        );
        if (activeInterpreterItem) {
            return activeInterpreterItem;
        }
        const firstInterpreterSuggestion = suggestions.find((s) => isInterpreterQuickPickItem(s));
        if (firstInterpreterSuggestion) {
            return firstInterpreterSuggestion;
        }
        const noPythonInstalledItem = suggestions.find(
            (i) => isSpecialQuickPickItem(i) && i.label === this.noPythonInstalled.label,
        );
        return noPythonInstalledItem ?? suggestions[0];
    }

    private getDefaultInterpreterPathSuggestion(resource: Resource): ISpecialQuickPickItem | undefined {
        const config = this.workspaceService.getConfiguration('python', resource);
        const systemVariables = new SystemVariables(resource, undefined, this.workspaceService);
        const defaultInterpreterPathValue = systemVariables.resolveAny(config.get<string>('defaultInterpreterPath'));
        if (defaultInterpreterPathValue && defaultInterpreterPathValue !== 'python') {
            return {
                label: `${Octicons.Gear} ${InterpreterQuickPickList.defaultInterpreterPath.label}`,
                description: this.pathUtils.getDisplayName(
                    defaultInterpreterPathValue,
                    resource ? resource.fsPath : undefined,
                ),
                path: defaultInterpreterPathValue,
                alwaysShow: true,
            };
        }
        return undefined;
    }

    /**
     * Updates quickpick using the change event received.
     */
    private updateQuickPickItems(
        api: PythonExtension,
        quickPick: QuickPick<QuickPickType>,
        event: EnvironmentsChangeEvent | undefined,
        resource: Resource,
        filter: ((i: Environment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ) {
        // Active items are reset once we replace the current list with updated items, so save it.
        const activeItemBeforeUpdate = quickPick.activeItems.length > 0 ? quickPick.activeItems[0] : undefined;
        quickPick.items = this.getUpdatedItems(api, quickPick.items, event, resource, filter, params);
        // Ensure we maintain the same active item as before.
        const activeItem = activeItemBeforeUpdate
            ? quickPick.items.find((item) => {
                  if (isInterpreterQuickPickItem(item) && isInterpreterQuickPickItem(activeItemBeforeUpdate)) {
                      return item.interpreter.id === activeItemBeforeUpdate.interpreter.id;
                  }
                  if (isSpecialQuickPickItem(item) && isSpecialQuickPickItem(activeItemBeforeUpdate)) {
                      // 'label' is a constant here instead of 'path'.
                      return item.label === activeItemBeforeUpdate.label;
                  }
                  return false;
              })
            : undefined;
        quickPick.activeItems = activeItem ? [activeItem] : [];
    }

    /**
     * Prepare updated items to replace the quickpick list with.
     */
    private getUpdatedItems(
        _api: PythonExtension,
        _items: readonly QuickPickType[],
        _event: EnvironmentsChangeEvent | undefined,
        _resource: Resource,
        _filter: ((i: Environment) => boolean) | undefined,
        _params?: InterpreterQuickPickParams,
    ): QuickPickType[] {
        // const updatedItems = [...items.values()];
        // const areItemsGrouped = items.find((item) => isSeparatorItem(item));
        // const env = event.old ?? event.new;
        // if (filter && event.new && !filter(event.new)) {
        //     event.new = undefined; // Remove envs we're not looking for from the list.
        // }
        // let envIndex = -1;
        // if (env) {
        //     envIndex = updatedItems.findIndex(
        //         (item) => isInterpreterQuickPickItem(item) && item.interpreter.id === env.id,
        //     );
        // }
        // if (event.new) {
        //     const newSuggestion = this.interpreterSelector.suggestionToQuickPickItem(
        //         event.new,
        //         resource,
        //         !areItemsGrouped,
        //     );
        //     if (envIndex === -1) {
        //         const noPyIndex = updatedItems.findIndex(
        //             (item) => isSpecialQuickPickItem(item) && item.label === this.noPythonInstalled.label,
        //         );
        //         if (noPyIndex !== -1) {
        //             updatedItems.splice(noPyIndex, 1);
        //         }
        //         const tryReloadIndex = updatedItems.findIndex(
        //             (item) => isSpecialQuickPickItem(item) && item.label === this.tipToReloadWindow.label,
        //         );
        //         if (tryReloadIndex !== -1) {
        //             updatedItems.splice(tryReloadIndex, 1);
        //         }
        //         if (areItemsGrouped) {
        //             addSeparatorIfApplicable(
        //                 updatedItems,
        //                 newSuggestion,
        //                 this.workspaceService.getWorkspaceFolder(resource)?.uri.fsPath,
        //             );
        //         }
        //         updatedItems.push(newSuggestion);
        //     } else {
        //         updatedItems[envIndex] = newSuggestion;
        //     }
        // }
        // if (envIndex !== -1 && event.new === undefined) {
        //     updatedItems.splice(envIndex, 1);
        // }
        // this.finalizeItems(api, updatedItems, resource, params);
        // return updatedItems;
        return [];
    }

    private finalizeItems(
        api: PythonExtension,
        items: QuickPickType[],
        resource: Resource,
        params?: InterpreterQuickPickParams,
    ) {
        const interpreterSuggestions = this.interpreterSelector.getSuggestions(api, resource, true);
        if (!this.isBusyLoadingPythonEnvs) {
            if (interpreterSuggestions.length) {
                if (!params?.skipRecommended) {
                    this.setRecommendedItem(interpreterSuggestions, items, resource);
                }
                // Add warning label to certain environments
                items.forEach((item, i) => {
                    if (isInterpreterQuickPickItem(item) && isNonPythonCondaEnvironment(item.interpreter)) {
                        if (!items[i].label.includes(Octicons.Warning)) {
                            items[i].label = `${Octicons.Warning} ${items[i].label}`;
                            items[i].tooltip = InterpreterQuickPickList.condaEnvWithoutPythonTooltip;
                        }
                    }
                });
            } else {
                if (!items.some((i) => isSpecialQuickPickItem(i) && i.label === this.noPythonInstalled.label)) {
                    items.push(this.noPythonInstalled);
                }
                if (
                    this.wasNoPythonInstalledItemClicked &&
                    !items.some((i) => isSpecialQuickPickItem(i) && i.label === this.tipToReloadWindow.label)
                ) {
                    items.push(this.tipToReloadWindow);
                }
            }
        }
    }

    private setRecommendedItem(
        interpreterSuggestions: IInterpreterQuickPickItem[],
        items: QuickPickType[],
        resource: Resource,
    ) {
        const suggestion = this.interpreterSelector.getRecommendedSuggestion(
            interpreterSuggestions,
            this.workspaceService.getWorkspaceFolder(resource)?.uri,
        );
        if (!suggestion) {
            return;
        }
        const areItemsGrouped = items.find((item) => isSeparatorItem(item) && item.label === EnvGroups.Recommended);
        const recommended = cloneDeep(suggestion);
        recommended.label = `${Octicons.Star} ${recommended.label}`;
        recommended.description = areItemsGrouped
            ? // No need to add a tag as "Recommended" group already exists.
              recommended.description
            : `${recommended.description ?? ''} - ${Common.recommended}`;
        const index = items.findIndex(
            (item) => isInterpreterQuickPickItem(item) && item.interpreter.id === recommended.interpreter.id,
        );
        if (index !== -1) {
            items[index] = recommended;
        }
    }

    private refreshCallback(
        input: QuickPick<QuickPickItem>,
        options?: TriggerRefreshOptions & { isButton?: boolean; showBackButton?: boolean },
    ) {
        input.buttons = this.getButtons(options);

        input.busy = true;
        this.api.environments
            .refreshEnvironments({})
            .finally(() => {
                input.busy = false;
                input.buttons = this.getButtons({ isButton: false, showBackButton: options?.showBackButton });
            })
            .ignoreErrors();
    }

    private getButtons(options?: { isButton?: boolean; showBackButton?: boolean }): QuickInputButton[] {
        const buttons: QuickInputButton[] = [];
        if (options?.showBackButton) {
            buttons.push(QuickInputButtons.Back);
        }
        if (options?.isButton) {
            buttons.push({
                iconPath: new ThemeIcon(ThemeIcons.SpinningLoader),
                tooltip: InterpreterQuickPickList.refreshingInterpreterList,
            });
        } else {
            buttons.push(this.refreshButton);
        }
        return buttons;
    }

    public async _enterOrBrowseInterpreterPath(
        input: IMultiStepInput<InterpreterStateArgs>,
        state: InterpreterStateArgs,
    ): Promise<void | InputStep<InterpreterStateArgs>> {
        const items: QuickPickItem[] = [
            {
                label: InterpreterQuickPickList.browsePath.label,
                detail: InterpreterQuickPickList.browsePath.detail,
            },
        ];

        const selection = await input.showQuickPick({
            placeholder: InterpreterQuickPickList.enterPath.placeholder,
            items,
            acceptFilterBoxTextAsSelection: true,
        });

        if (typeof selection === 'string') {
            // User entered text in the filter box to enter path to python, store it
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTER_CHOICE, undefined, { choice: 'enter' });
            state.path = selection;
            // this.sendInterpreterEntryTelemetry(selection, state.workspace);
        } else if (selection && selection.label === InterpreterQuickPickList.browsePath.label) {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTER_CHOICE, undefined, { choice: 'browse' });
            const filtersKey = 'Executables';
            const filtersObject: { [name: string]: string[] } = {};
            filtersObject[filtersKey] = ['exe'];
            const uris = await this.applicationShell.showOpenDialog({
                filters: this.platformService.isWindows ? filtersObject : undefined,
                openLabel: InterpreterQuickPickList.browsePath.openButtonLabel,
                canSelectMany: false,
                title: InterpreterQuickPickList.browsePath.title,
            });
            if (uris && uris.length > 0) {
                state.path = uris[0].fsPath;
                // this.sendInterpreterEntryTelemetry(api, state.path!, state.workspace);
            } else {
                return Promise.reject(InputFlowAction.resume);
            }
        }
        return Promise.resolve();
    }

    public async setInterpreter(): Promise<void> {
        const targetConfig = await this.getConfigTargets();
        if (!targetConfig) {
            return;
        }
        const wkspace = targetConfig[0].folderUri;
        const interpreterState: InterpreterStateArgs = { path: undefined, workspace: wkspace };
        const multiStep = this.multiStepFactory.create<InterpreterStateArgs>();
        await multiStep.run((input, s) => this._pickInterpreter(input, s, undefined), interpreterState);
    }

    public async getInterpreterViaQuickPick(
        workspace: Resource,
        filter: ((i: Environment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): Promise<string | undefined> {
        const interpreterState: InterpreterStateArgs = { path: undefined, workspace };
        const multiStep = this.multiStepFactory.create<InterpreterStateArgs>();
        await multiStep.run((input, s) => this._pickInterpreter(input, s, filter, params), interpreterState);
        return interpreterState.path;
    }
}

function getGroupedQuickPickItems(
    items: IInterpreterQuickPickItem[],
    recommended: IInterpreterQuickPickItem | undefined,
    workspacePath?: string,
): QuickPickType[] {
    const updatedItems: QuickPickType[] = [];
    if (recommended) {
        updatedItems.push({ label: EnvGroups.Recommended, kind: QuickPickItemKind.Separator }, recommended);
    }
    let previousGroup = EnvGroups.Recommended;
    for (const item of items) {
        previousGroup = addSeparatorIfApplicable(updatedItems, item, workspacePath, previousGroup);
        updatedItems.push(item);
    }
    return updatedItems;
}

function addSeparatorIfApplicable(
    items: QuickPickType[],
    newItem: IInterpreterQuickPickItem,
    workspacePath?: string,
    previousGroup?: string | undefined,
) {
    if (!previousGroup) {
        const lastItem = items.length ? items[items.length - 1] : undefined;
        previousGroup =
            lastItem && isInterpreterQuickPickItem(lastItem) ? getGroup(lastItem, workspacePath) : undefined;
    }
    const currentGroup = getGroup(newItem, workspacePath);
    if (!previousGroup || currentGroup !== previousGroup) {
        const separatorItem: QuickPickItem = { label: currentGroup, kind: QuickPickItemKind.Separator };
        items.push(separatorItem);
        previousGroup = currentGroup;
    }
    return previousGroup;
}

function getGroup(item: IInterpreterQuickPickItem, workspacePath?: string) {
    if (workspacePath && isParentPath(item.path, workspacePath)) {
        return EnvGroups.Workspace;
    }
    const envType = getEnvironmentType(item.interpreter);
    switch (envType) {
        case EnvironmentType.Global:
        case EnvironmentType.System:
        case EnvironmentType.Unknown:
        case EnvironmentType.MicrosoftStore:
            return EnvGroups.Global;
        default:
            return EnvGroups[envType];
    }
}
