import { IAppConfig } from '@epiijs/config';

interface IConfigForLogging {
  silent?: boolean;
}

type LoggingFn = (...args: unknown[]) => void;

export function buildLogging(config: IAppConfig): {
  error: LoggingFn;
  warn: LoggingFn;
  info: LoggingFn;
} {
  const loggingConfig = config.side.logging as IConfigForLogging | undefined;
  if (loggingConfig?.silent) {
    const emptyFn = (): void => {};
    return {
      error: emptyFn,
      warn: emptyFn,
      info: emptyFn
    };
  }
  return {
    error: console.error,
    warn: console.warn,
    info: console.info
  };
}