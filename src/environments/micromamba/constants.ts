import * as path from 'path';
import { getOSType, getUserHomeDir, OSType } from '../../client/common/utils/platform';
import { home } from '../helpers';

export const MICROMAMBA_ROOTPREFIX = path.join(getUserHomeDir() || home, 'micromamba');
export const MICROMAMBA_DIR = path.join(getUserHomeDir() || home, '.micromamba');
export const MICROMAMBA_BASE_ENV_NAME = 'micromambaBase';
export const CONDA_EXE = path.join(MICROMAMBA_ROOTPREFIX, 'condabin', getOSType() === OSType.Windows ? 'conda.exe' : 'conda');
export const MICROMAMBA_EXE = path.join(MICROMAMBA_DIR, 'bin', getOSType() === OSType.Windows ? 'micromamba.exe' : 'micromamba');
export const BASE_MICROMAMBA_PYTHON_EXE = path.join(MICROMAMBA_ROOTPREFIX, getOSType() === OSType.Windows ? 'Scripts' : 'bin', getOSType() === OSType.Windows ? 'python.exe' : 'python');
