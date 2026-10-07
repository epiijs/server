import path from 'node:path';

import type { IAppConfig } from '@epiijs/config';
import {
  createInjector, IInjector, IServiceLocator,
  ServiceFactoryFn
} from '@epiijs/inject';

import { createLogger } from './logging.js';
import {
  findAllModuleFilePaths, getModuleDirPath, importDeclareModule,
  RegExpForDeclareModuleFileName
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
 * Service 声明结果，由模块的 declare() 函数返回
 */
type ServiceDeclareResult = {
  name: string;
  scope: EServiceScope;
};

/**
 * Service 声明函数类型
 */
type ServiceDeclareFn = () => ServiceDeclareResult;

/**
 * Service 引用，包含工厂函数和注册选项
 */
interface IRefService {
  default: ServiceFactoryFn;
  options: ServiceDeclareResult;
}

/**
 * 加载单个 Service 模块
 */
async function loadServiceModule({ dirPath, filePath }: {
  dirPath: string;
  filePath: string;
}): Promise<IRefService | undefined> {
  const serviceModule = await importDeclareModule<ServiceFactoryFn, ServiceDeclareResult>(filePath);
  const {
    default: maybeServiceFn,
    options: maybeDeclare
  } = serviceModule || {};
  const relativePath = path.relative(dirPath, filePath);
  const defaultName = relativePath.replace(RegExpForDeclareModuleFileName, '');
  const serviceFn: ServiceFactoryFn = (services: IServiceLocator): unknown => {
    return typeof maybeServiceFn === 'function'
      ? maybeServiceFn(services)
      : maybeServiceFn;
  };
  const refService: IRefService = {
    default: serviceFn,
    options: {
      name: maybeDeclare?.name ?? defaultName,
      scope: maybeDeclare?.scope ?? EServiceScope.Process
    }
  };
  return refService;
}

/**
 * 查找并加载所有 Service 模块
 */
async function findAllServices(config: IAppConfig): Promise<IRefService[]> {
  const serviceDirPath = getModuleDirPath(config, 'services');
  const serviceFilePaths = await findAllModuleFilePaths(serviceDirPath, '*.{js,mjs}');
  const services: IRefService[] = [];
  for (const serviceFilePath of serviceFilePaths) {
    const service = await loadServiceModule({
      dirPath: serviceDirPath,
      filePath: serviceFilePath
    });
    if (service) {
      services.push(service);
    }
  }
  return services;
}

/**
 * 启动依赖注入子系统
 */
async function startServiceManager(config: IAppConfig, options: {
  builtin: IServiceLocator;
}): Promise<{
  createProcessInjector: () => IInjector;
  createSessionInjector: (inherit: IInjector) => IInjector;
}> {
  const logger = createLogger();
  const builtinServices = options.builtin;
  const services = (await findAllServices(config).catch((error) => {
    logger.error(error);
    return [];
  })).filter(service => {
    return !Object.hasOwn(builtinServices, service.options.name);
  });

  return {
    createProcessInjector: () => {
      const injector = createInjector();
      Object.entries(builtinServices).forEach(([name, instance]) => {
        injector.provide(name, instance);
      });
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
  EServiceScope,
  startServiceManager
};

export type {
  IServiceLocator,
  ServiceDeclareFn,
  ServiceDeclareResult,
  ServiceFactoryFn
};
