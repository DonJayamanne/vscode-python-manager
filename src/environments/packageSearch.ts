import { Environment } from '@vscode/python-extension';
import { CancellationToken, CancellationTokenSource, QuickPickItem, window } from 'vscode';

type SearchProvider<T> = (value: string, env: Environment, token: CancellationToken) => Promise<(QuickPickItem & { item: T })[]>;

export async function searchPackageWithProvider<T>(searchProvider: SearchProvider<T>, env: Environment): Promise<T | undefined> {
    const quickPick = window.createQuickPick();
    quickPick.placeholder = 'Enter package name to search';
    quickPick.canSelectMany = false;
    quickPick.show();
    let progressCounter = 0;
    const searchAndUpdate = async (value: string, token: CancellationToken) => {
        if (!value.trim()) {
            quickPick.items = [];
            return;
        }
        quickPick.busy = true;
        progressCounter += 1;
        const packages = await searchProvider(value, env, token);
        progressCounter -= 1;
        if (!progressCounter) {
            quickPick.busy = false;
        }
        if (token.isCancellationRequested) {
            return;
        }

        quickPick.items = packages;
    };
    let token: CancellationTokenSource | undefined;
    quickPick.onDidChangeValue(async (value) => {
        if (token) {
            token.cancel();
            token.dispose();
        }
        token = new CancellationTokenSource();
        searchAndUpdate(value, token.token);
    });
    return new Promise<T | undefined>((resolve) => {
        quickPick.onDidHide(() => {
            if (token) {
                token.cancel();
                token.dispose();
            }
            resolve(undefined);
            quickPick.dispose();
        });
        quickPick.onDidAccept(async () => {
            if (!quickPick.selectedItems.length) {
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve('item' in quickPick.selectedItems[0] ? (quickPick.selectedItems[0] as any).item : undefined);
            quickPick.hide();
        });
    });
}
