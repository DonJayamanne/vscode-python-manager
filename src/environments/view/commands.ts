import { Disposable, ExtensionContext, commands, window, workspace } from 'vscode';
import {
    exportPackages,
    installPackage,
    searchPackage,
    uninstallPackage,
    updatePackage,
    updatePackages,
} from '../packages';
import { traceError } from '../../client/logging';
import { EnvironmentWrapper, Package, PackageWrapper } from './types';
import { ActiveWorkspaceEnvironment, WorkspaceFoldersTreeDataProvider } from './foldersTreeDataProvider';
import { PythonEnvironmentsTreeDataProvider } from './environmentsTreeDataProvider';
import { IDisposable } from '../../client/common/types';
import { disposeAll } from '../../client/common/utils/resourceLifecycle';

function triggerChanges(item: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WorkspaceFoldersTreeDataProvider.instance.triggerChanges(item as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PythonEnvironmentsTreeDataProvider.instance.triggerChanges(item as any);
}

export function registerCommands(context: ExtensionContext) {
    const disposables: IDisposable[] = [];
    disposables.push(
        commands.registerCommand('python.envManager.updatePackage', async (pkg: Package) => {
            const yes = await window.showWarningMessage(
                `Are you sure you want to update the package '${pkg.pkg.name} to the latest version ${pkg.latestVersion}?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (yes === 'No') {
                return;
            }

            pkg.status = 'DetectingLatestVersion';
            triggerChanges(pkg);
            await updatePackage(pkg.env, pkg.pkg).catch((ex) =>
                traceError(`Failed to update package ${pkg.pkg.name} in ${pkg.env.id}`, ex),
            );
            pkg.status = undefined;

            // Other packages may have been updated, so refresh all packages.
            triggerChanges(pkg.parent);
        }),
    );
    disposables.push(
        commands.registerCommand('python.envManager.uninstallPackage', async (pkg: Package) => {
            const yes = await window.showWarningMessage(
                `Are you sure you want to uninstall the package '${pkg.pkg.name}'?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (yes === 'No') {
                return;
            }

            pkg.status = 'UnInstalling';
            triggerChanges(pkg);
            uninstallPackage(pkg.env, pkg.pkg);

            pkg.status = undefined;

            // Other packages may have been uninstalled, so refresh all packages.
            triggerChanges(pkg.parent);
        }),
    );
    disposables.push(
        commands.registerCommand('python.envManager.searchAndInstallPackage', async (pkg: PackageWrapper) => {
            const result = await searchPackage(pkg.env).catch((ex) =>
                traceError(`Failed to install a package in ${pkg.env.id}`, ex),
            );
            if (!result) {
                return;
            }
            if (result) {
                await installPackage(pkg.env, result);

                // Other packages may have been updated, so refresh all packages.
                triggerChanges(pkg);
            }
        }),
    );
    disposables.push(
        commands.registerCommand(
            'python.envManager.exportEnvironment',
            async (options: ActiveWorkspaceEnvironment | EnvironmentWrapper) => {
                const env = options instanceof EnvironmentWrapper ? options.env : options.asNode()?.env;
                if (!env) {
                    return;
                }
                const exportedData = await exportPackages(env).catch((ex) =>
                    traceError(`Failed to export env ${env.id}`, ex),
                );
                if (!exportedData) {
                    return;
                }
                const doc = await workspace.openTextDocument({
                    content: `# ${exportedData.file}\n\n${exportedData.contents}`,
                    language: exportedData.language,
                });
                window.showTextDocument(doc);
            },
        ),
    );
    disposables.push(
        commands.registerCommand('python.envManager.updateAllPackages', async (pkg: PackageWrapper) => {
            const yes = await window.showWarningMessage(
                `Are you sure you want to update all the packages?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (yes === 'No') {
                return;
            }

            pkg.packages.forEach((e) => {
                e.status = 'UpdatingToLatest';
                triggerChanges(e);
            });

            await updatePackages(pkg.env);

            // Other packages may have been uninstalled, so refresh all packages.
            triggerChanges(pkg);
        }),
    );
    disposables.push(
        commands.registerCommand('python.envManager.refreshPackages', async (pkg: PackageWrapper) =>
            triggerChanges(pkg),
        ),
    );

    context.subscriptions.push(new Disposable(() => disposeAll(disposables)));
}
