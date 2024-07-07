type ContextHookFn<P = void> = (bind: P, ...args: any[]) => unknown;

interface IContextInner {
  install: <P = void>(key: string, hook: ContextHookFn<P>, bind: P) => void;
  resolve: () => unknown;
  dispose: () => void;
}

export function buildContext(): IContextInner {
  const methods: Record<string, unknown> = {};

  const context: Partial<IContextInner> = {};

  context.install = <P>(key: string, hook: ContextHookFn<P>, bind: P): void => {
    methods[key] = (...args: unknown[]) => hook(bind, ...args);
  };

  context.resolve = () => {
    return new Proxy({}, {
      get: (_, name) => {
        if (typeof name === 'string') {
          return methods[name];
        }
        return undefined;
      }
    });
  };

  context.dispose = () => {
    Object.keys(methods).map(key => {
      delete methods[key];
    });
  };

  return context as IContextInner;
}

export type {
  IContextInner
};
