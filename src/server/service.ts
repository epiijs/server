import path from 'node:path';

import { IAppConfig } from '@epiijs/config';
import {
  createInjector, IInjector, ServiceFactoryFn, ServiceLocator
} from '@epiijs/inject';

import { createLogger } from './logging.js';
import {
  findAllModuleFiles, getModuleDirPath, importModule
} from './require.js';

/**
 * Service 作用域
 */
enum EServiceScope {
  /**
   * 进程生命周期，适用于应用全局配置和实例
   */
  Process = 'Process',

  /**
   * 会话生命周期，适用于请求关联的临时状态
   */
  Session = 'Session'
}

/**
 * Service 引用，包含工厂函数和注册选项
 */
interface IRefService {
  default: ServiceFactoryFn;
  options: {
    name: string;
    scope: EServiceScope;
  };
}

/**
 * Service 声明结果，由模块的 declare() 函数返回
 */
type ServiceDeclareResult = IRefService['options'];

/**
 * Service 声明函数类型
 */
type ServiceDeclareFn = () => ServiceDeclareResult;

/**
 * 加载单个 Service 模块
 * 解析 default 导出和 declare() 声明，返回 IRefService
 */
async function loadServiceModule({ dirName, fileName }: {
  dirName: string;
  fileName: string;
}): Promise<IRefService | undefined> {
  interface IServiceModule {
    default: unknown;
    declare?: () => IRefService['options'];
  }
  const relativePath = path.relative(dirName, fileName);
  const {
    default: maybeServiceFn,
    declare
  } = await importModule(fileName) as IServiceModule;
  const serviceFn: ServiceFactoryFn = (services: ServiceLocator): unknown => {
    return typeof maybeServiceFn === 'function'
      ? maybeServiceFn(services)
      : maybeServiceFn;
  };
  const serviceOptions = typeof declare === 'function' ? declare() : undefined;
  const defaultName = relativePath.replace(/\/?index\.js$/, '');
  const refService: IRefService = {
    default: serviceFn,
    options: {
      name: defaultName,
      scope: EServiceScope.Process,
      ...serviceOptions
    }
  };
  return refService;
}

/**
 * 查找并加载所有 Service 模块
 * 扫描 services 目录下的所有 index.js 文件
 */
async function findAllServices(config: IAppConfig): Promise<IRefService[]> {
  const serviceDir = getModuleDirPath(config, 'services');
  const serviceFileNames = await findAllModuleFiles(serviceDir);
  const services: IRefService[] = [];
  for (const serviceFileName of serviceFileNames) {
    const service = await loadServiceModule({
      dirName: serviceDir,
      fileName: serviceFileName
    });
    if (service) {
      services.push(service);
    }
  }
  return services;
}

/**
 * 挂载 Service 系统
 * 返回 createProcessInjector 和 createSessionInjector 工厂函数
 * findAllServices 失败时日志错误并兜底为空数组
 */
async function mountService(config: IAppConfig): Promise<{
  createProcessInjector: () => IInjector;
  createSessionInjector: (inherit: IInjector) => IInjector;
}> {
  const services = await findAllServices(config).catch((error) => {
    createLogger().error(error);
    return [];
  });

  return {
    createProcessInjector: () => {
      const injector = createInjector();
      const servicesForProcess = services.filter(service => service.options.scope === EServiceScope.Process);
      servicesForProcess.forEach(service => {
        injector.provide(service.options.name, service.default);
      });
      return injector;
    },

    createSessionInjector: (inherit) => {
      const injector = createInjector();
      injector.inherit(inherit);
      const servicesForSession = services.filter(service => service.options.scope === EServiceScope.Session);
      servicesForSession.forEach(service => {
        injector.provide(service.options.name, service.default);
      });
      return injector;
    }
  };
}

export {
  mountService
};

export type {
  ServiceDeclareFn,
  ServiceDeclareResult,
  ServiceFactoryFn,
  ServiceLocator
};
