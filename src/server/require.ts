import path from 'node:path';

import { IAppConfig } from '@epiijs/config';
import { glob } from 'glob';

/**
 * 获取模块目录的绝对路径
 * 基于 config.root + dirs.target + dirs.server + dirName 拼接
 */
export function getModuleDirPath(config: IAppConfig, dirName: string): string {
  return path.join(config.root, config.dirs.target, config.dirs.server, dirName);
}

/**
 * 查找目录下所有匹配的模块文件
 * 默认匹配 index.js，可通过 pattern 自定义
 */
export async function findAllModuleFiles(dirPath: string, pattern?: string): Promise<string[]> {
  const filePattern = `${dirPath}/**/${pattern || 'index.js'}`;
  const fileNames = await glob(filePattern);
  return fileNames;
}

/**
 * 动态导入模块，兼容 ESM 和 CJS
 * ESM 模块返回 default 导出，CJS 模块返回整个模块对象
 */
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
