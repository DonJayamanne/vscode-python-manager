import { EnvironmentType } from '../client/pythonEnvironments/info';

export type RefreshUntilNewEnvIsAvailable = (options: { name?: string; path?: string; type: EnvironmentType }) => Promise<void>;
