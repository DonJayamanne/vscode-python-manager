// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Disposable, Uri } from 'vscode';
import { Environment, PythonExtension } from '@vscode/python-extension';
import { dirname } from 'path';
import { IPathUtils, Resource } from '../../../common/types';
import { IInterpreterComparer, IInterpreterQuickPickItem, IInterpreterSelector } from '../types';

@injectable()
export class InterpreterSelector implements IInterpreterSelector {
    private disposables: Disposable[] = [];

    constructor(
        @inject(IInterpreterComparer) private readonly envTypeComparer: IInterpreterComparer,
        @inject(IPathUtils) private readonly pathUtils: IPathUtils,
    ) { }

    public dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    public getSuggestions(api: PythonExtension, resource: Resource, useFullDisplayName = false): IInterpreterQuickPickItem[] {
        const interpreters: Environment[] = api.environments.known.slice();
        // if (resource){
        //     interpreters = api.environments.known.filter(e => {
        //         e.e.environment?.workspaceFolder ).getInterpreters(resource);
        // }
        interpreters.sort(this.envTypeComparer.compareV2.bind(this.envTypeComparer));

        return interpreters.map((item) => this.suggestionToQuickPickItem(item, resource, useFullDisplayName));
    }

    // public async getAllSuggestions(resource: Resource): Promise<IInterpreterQuickPickItem[]> {
    //     const interpreters = await this.interpreterManager.getAllInterpreters(resource);
    //     interpreters.sort(this.envTypeComparer.compare.bind(this.envTypeComparer));

    //     return Promise.all(interpreters.map((item) => this.suggestionToQuickPickItem(item, resource)));
    // }

    public suggestionToQuickPickItem(
        interpreter: Environment,
        workspaceUri?: Uri,
        _useDetailedName = false,
    ): IInterpreterQuickPickItem {
        const path =
            interpreter.environment?.folderUri?.fsPath || interpreter.executable?.uri?.fsPath || interpreter.path;
        const detail = this.pathUtils.getDisplayName(path, workspaceUri ? workspaceUri.fsPath : undefined);
        const version = interpreter.version?.major ? `${interpreter.version.major}.${interpreter.version.minor}.${interpreter.version.micro}` : '';
        const displayVersion = version ? ` (${version})` : ''
        const pythonDisplayName = `Python${displayVersion}`;
        const envName = interpreter.environment?.name || (interpreter.environment?.folderUri ? dirname(interpreter.environment.folderUri.fsPath) : undefined);
        return {
            label: envName ? `${envName} (${pythonDisplayName})` : pythonDisplayName,
            description: detail || '',
            path,
            interpreter,
        };
    }

    public getRecommendedSuggestion(
        _suggestions: IInterpreterQuickPickItem[],
        _resource: Resource,
    ): IInterpreterQuickPickItem | undefined {
        return undefined;
        // const envs = this.interpreterManager.getInterpreters(resource);
        // const recommendedEnv = this.envTypeComparer.getRecommended(envs, resource);
        // if (!recommendedEnv) {
        //     return undefined;
        // }
        // return suggestions.find((item) => arePathsSame(item.interpreter.path, recommendedEnv.path));
    }
}
