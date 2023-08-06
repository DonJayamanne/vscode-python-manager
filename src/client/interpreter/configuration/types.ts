import { QuickPickItem } from 'vscode';
import { Resource } from '../../common/types';
import { PythonEnvironment } from '../../pythonEnvironments/info';

export interface IInterpreterQuickPickItem extends QuickPickItem {
    path: string;
    /**
     * The interpreter related to this quickpick item.
     *
     * @type {PythonEnvironment}
     * @memberof IInterpreterQuickPickItem
     */
    interpreter: PythonEnvironment;
}

export interface ISpecialQuickPickItem extends QuickPickItem {
    path?: string;
}

export const IInterpreterComparer = Symbol('IInterpreterComparer');
export interface IInterpreterComparer {
    compare(a: PythonEnvironment, b: PythonEnvironment): number;
    getRecommended(interpreters: PythonEnvironment[], resource: Resource): PythonEnvironment | undefined;
}

export interface InterpreterQuickPickParams {
    /**
     * Specify `null` if a placeholder is not required.
     */
    placeholder?: string | null;
    /**
     * Specify `null` if a title is not required.
     */
    title?: string | null;
    /**
     * Specify `true` to skip showing recommended python interpreter.
     */
    skipRecommended?: boolean;

    /**
     * Specify `true` to show back button.
     */
    showBackButton?: boolean;
}

export const IInterpreterQuickPick = Symbol('IInterpreterQuickPick');
export interface IInterpreterQuickPick {
    getInterpreterViaQuickPick(
        workspace: Resource,
        filter?: (i: PythonEnvironment) => boolean,
        params?: InterpreterQuickPickParams,
    ): Promise<string | undefined>;
}
