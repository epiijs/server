import http from 'node:http';

import {
  AnyForOutgoingMessage, IncomingMessage
} from '@epiijs/httply';
import type { ServiceLocator } from '@epiijs/inject';

/**
 * Handler 管线输出，本质是可转化 OutgoingMessage 的任意数据
 */
type HandlerResult = AnyForOutgoingMessage;

/**
 * 携带路由参数的入站请求  
 * 路由匹配阶段构造，Handler 通过 message.params 访问路径参数
 */
class IncomingMessageWithParams extends IncomingMessage {
  readonly params: Record<string, string>;

  constructor(raw: http.IncomingMessage, params: Record<string, string>) {
    super(raw);
    this.params = params;
  }
}

/**
 * Handler 管线处理函数，Koa-like 模型
 */
type HandlerFn = (
  /**
   * 依赖注入访问点，可用于获取依赖实例
   */
  this: ServiceLocator,

  /**
   * 携带路由参数的入站请求
   */
  message: IncomingMessageWithParams,

  /**
   * 调用 next() 可将控制权交给下一个 Handler
   */
  next: () => Promise<HandlerResult>
) => Promise<HandlerResult>;

/**
 * 组合后的 Handler 链可调用函数，由 composeHandlers 产生
 * 接收入站请求和 ServiceLocator，返回 HandlerResult（由调用方转换为 OutgoingMessage）
 */
type ComposedHandler = (message: IncomingMessageWithParams, serviceLocator: ServiceLocator) => Promise<HandlerResult>;

/**
 * 将 stacks 和 defaultHandler 组合为洋葱链，返回 ComposedHandler
 * 每次请求通过 .call() 绑定 ServiceLocator，错误由调用方处理
 */
function composeHandlers(
    stacks: HandlerFn[],
    defaultHandler: HandlerFn
): ComposedHandler {
  const chain = stacks.concat(defaultHandler);
  return async (message, serviceLocator) => {
    let index = -1;
    async function dispatch(i: number): Promise<HandlerResult> {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      if (i >= chain.length) {
        return { status: 204 };
      }
      return chain[i].call(serviceLocator, message, () => dispatch(i + 1));
    }
    return dispatch(0);
  };
}

export {
  composeHandlers,
  IncomingMessageWithParams
};

export type {
  ComposedHandler,
  HandlerFn,
  HandlerResult
};
