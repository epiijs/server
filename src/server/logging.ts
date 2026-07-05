/** 日志写函数，通用签名 */
type LoggerFn = (...args: unknown[]) => void;

/**
 * 日志器接口，任意属性访问均返回 LoggerFn（Proxy 实现）
 * 方法名作为第一个参数传递给 transport 函数
 */
interface ILogger {
  log: LoggerFn;
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
  debug: LoggerFn;
  [key: string]: LoggerFn;
}

const Internal: {
  instance: ILogger | undefined;
  transport: LoggerFn;
} = {
  instance: undefined,
  transport: (method, ...args) => {
    const consoleFn = (console as unknown as Record<string, (...a: unknown[]) => void>)[method as string];
    if (typeof consoleFn === 'function') {
      consoleFn(...args);
    } else {
      console.log(...args);
    }
  }
};

/**
 * 获取日志器单例，无参数
 * 任意属性访问均返回调用 transport 的函数，方法名注入第一个参数
 */
function createLogger(): ILogger {
  if (!Internal.instance) {
    Internal.instance = new Proxy({} as ILogger, {
      get(_target, prop) {
        if (typeof prop === 'string') {
          return (...args: unknown[]) => Internal.transport(prop, ...args);
        }
      }
    });
  }
  return Internal.instance;
}

/**
 * 覆盖日志写逻辑，可多次调用，最后一次生效
 * 独立导出，Handler 中的 ILogger 无法访问此方法
 */
function setTransport(fn: LoggerFn): void {
  Internal.transport = fn;
}

export {
  createLogger,
  setTransport
};

export type {
  ILogger,
  LoggerFn
};
