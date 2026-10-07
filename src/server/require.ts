import path from 'node:path';

import type { IAppConfig } from '@epiijs/config';
import { glob } from 'glob';

/**
 * 历史约定：index.(js|mjs) 是可被发现模块入口
 */
export const RegExpForDeclareModuleFileName = /\/?index\.(js|mjs)$/;

/**
 * 获取模块目录的绝对路径
 * 形如 {appRoot}/{appDirs.target}/{dirName}
 */
export function getModuleDirPath(config: IAppConfig, dirName: string): string {
  return path.join(config.appRoot, config.appDirs.target, dirName);
}

/**
 * 查找目录下所有匹配的模块文件路径
 */
export async function findAllModuleFilePaths(dirPath: string, pattern: string): Promise<string[]> {
  const filePattern = `${dirPath}/**/${pattern}`;
  const filePaths = await glob(filePattern);
  return filePaths;
}

/**
 * 动态导入带有 declare() 函数的模块
 * 非入口模块返回 undefined；约定入口模块没有 declare() 时，options 为 undefined
 */
export async function importDeclareModule<ModuleDefault, DeclareResult extends object>(filePath: string): Promise<{
  default: ModuleDefault;
  options?: DeclareResult;
} | undefined> {
  const module = await import(filePath) as {
    default: ModuleDefault;
    declare?: () => DeclareResult;
  };
  const declareResult = typeof module.declare === 'function' ? module.declare() : undefined;
  const isDeclareModuleFile = RegExpForDeclareModuleFileName.test(filePath);
  // 判定条件：存在 declare() 声明值 或是约定入口模块
  if (!declareResult && !isDeclareModuleFile) {
    return;
  }
  return {
    default: module.default,
    options: declareResult
  };
}
