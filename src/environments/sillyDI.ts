// For inversify to work we must have at lest one class that binds to an interface

import { injectable } from 'inversify';
import { IExtensionActivationService } from '../client/activation/types';
import { Resource } from '../client/common/types';

@injectable()
export class Dummy implements IExtensionActivationService {
    supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean; } = { untrustedWorkspace: false, virtualWorkspace: false };
    async activate(_resource: Resource): Promise<void> {
        //
    }

}
