import path from 'node:path';

import { glob } from 'glob';
import { IAppConfig } from '@epiijs/config';

export function getModuleDirPath(config: IAppConfig, dirName: string): string {
  return path.join(config.root, config.dirs.target, config.dirs.server, dirName);
}

export async function findAllModuleFiles(dirPath: string, pattern?: string): Promise<string[]> {
  const filePattern = `${dirPath}/**/${pattern || 'index.js'}`;
  const fileNames = await glob(filePattern);
  return fileNames;
}

export async function importModule(fileName: string): Promise<unknown> {
  const maybeModule = await import(fileName) as {
    __esModule?: boolean;
    default?: unknown;
  };
  if (maybeModule.__esModule) {
    return maybeModule.default;
  }
  return maybeModule as unknown;
}
