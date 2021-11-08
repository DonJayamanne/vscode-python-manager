// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { IServiceManager } from '../../ioc/types';
import { ProductType } from '../types';
import { InstallationChannelManager } from './channelManager';
import { CondaInstaller } from './condaInstaller';
import { InsidersBuildInstaller, StableBuildInstaller } from './extensionBuildInstaller';
import { PipEnvInstaller } from './pipEnvInstaller';
import { PipInstaller } from './pipInstaller';
import { PoetryInstaller } from './poetryInstaller';
import { DataScienceProductPathService } from './productPath';
import { ProductService } from './productService';
import {
    IExtensionBuildInstaller,
    IInstallationChannelManager,
    IModuleInstaller,
    INSIDERS_INSTALLER,
    IProductPathService,
    IProductService,
    STABLE_INSTALLER,
} from './types';

export function registerTypes(serviceManager: IServiceManager) {
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, CondaInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PipInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PipEnvInstaller);
    serviceManager.addSingleton<IModuleInstaller>(IModuleInstaller, PoetryInstaller);
    serviceManager.addSingleton<IInstallationChannelManager>(IInstallationChannelManager, InstallationChannelManager);
    serviceManager.addSingleton<IExtensionBuildInstaller>(
        IExtensionBuildInstaller,
        StableBuildInstaller,
        STABLE_INSTALLER,
    );
    serviceManager.addSingleton<IExtensionBuildInstaller>(
        IExtensionBuildInstaller,
        InsidersBuildInstaller,
        INSIDERS_INSTALLER,
    );

    serviceManager.addSingleton<IProductService>(IProductService, ProductService);

    serviceManager.addSingleton<IProductPathService>(
        IProductPathService,
        DataScienceProductPathService,
        ProductType.DataScience,
    );
}
