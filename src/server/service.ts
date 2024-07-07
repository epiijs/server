import path from 'path';

import { IAppConfig } from '@epiijs/config';
import { IInjector, ServiceFactoryFn, ServiceLocator, createInjector } from '@epiijs/inject';

import { findAllModuleFiles, getModuleDirPath, importModule } from './require.js';
import { IContextInner } from './context.js';

enum EServiceScope {
  Process = 'Process',
  Session = 'Session'
}

interface IRefService {
  default: ServiceFactoryFn;
  options: {
    name: string;
    scope: EServiceScope;
  };
}

type ServiceDeclareResult = IRefService['options'];
type ServiceDeclareFn = () => ServiceDeclareResult;

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

async function findAllServices(config: IAppConfig): Promise<IRefService[]> {
  const serviceDir = getModuleDirPath(config, 'servies');
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
  // TODO: watch & load new actions
  return services;
}

interface IHookBind {
  services: ServiceLocator;
}

function useService({ services }: IHookBind, name: string): unknown {
  return services[name];
}

interface IContextForService {
  useService: <T = unknown>(name: string) => T;
}

export async function mountService(config: IAppConfig): Promise<{
  buildInjectorForProcess: () => IInjector;
  buildInjectorForSession: (inherit: IInjector, context: IContextInner) => IInjector;
}> {
  const services = await findAllServices(config);

  return {
    buildInjectorForProcess: () => {
      const injector = createInjector();
      const servicesForProcess = services.filter(service => service.options.scope === EServiceScope.Process);
      servicesForProcess.forEach(service => {
        injector.provide(service.options.name, service.default);
      });
      return injector;
    },

    buildInjectorForSession: (inherit, context) => {
      const injector = createInjector();
      injector.inherit(inherit);
      const servicesForSession = services.filter(service => service.options.scope === EServiceScope.Session);
      servicesForSession.forEach(service => {
        injector.provide(service.options.name, service.default);
      });
      context?.install<IHookBind>('useService', useService, { services: injector.service() as ServiceLocator });
      return injector;
    }
  };
}

export type {
  ServiceFactoryFn,
  ServiceDeclareResult,
  ServiceDeclareFn,
  ServiceLocator,
  IContextForService
};
