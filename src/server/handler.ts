import { IncomingMessage, AnyForOutgoingMessage, OutgoingMessage, buildOutgoingMessage } from '@epiijs/httply';

import { IContextInner } from './context.js';

type ActionResult = AnyForOutgoingMessage;
type ActionFnInner<C = unknown> = (props: IncomingMessage, context: C) => Promise<ActionResult>;

type HandlerDisposeFn = () => ActionResult;
type HandlerFn = (dispose: (disposeFn: HandlerDisposeFn) => void) => ActionResult | Promise<ActionResult>;

class BreakActionError extends Error {
  actionResult: ActionResult;

  constructor(result: ActionResult) {
    super();
    this.actionResult = result;
  }
}

interface IHookBind {
  disposeFnQueue: HandlerDisposeFn[];
}

async function useHandler({ disposeFnQueue }: IHookBind, handler: HandlerFn): Promise<void> {
  let mutableDisposeFn: HandlerDisposeFn | undefined = undefined;
  const maybeAsyncResult = handler((fn: HandlerDisposeFn): void => {
    mutableDisposeFn = fn;
  });
  const result = maybeAsyncResult instanceof Promise ? await maybeAsyncResult : maybeAsyncResult;
  if (result) {
    return Promise.reject(new BreakActionError(result));
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (mutableDisposeFn) {
    disposeFnQueue.unshift(mutableDisposeFn);
  }
}

interface IContextForHandler {
  useHandler: (handler: HandlerFn) => Promise<void>;
}

export async function performAction(action: ActionFnInner, props: IncomingMessage, context: unknown): Promise<OutgoingMessage> {
  const handlerDisposeFnQueue: HandlerDisposeFn[] = [];
  // install useHandler hook
  const contextInner = context as IContextInner;
  contextInner.install<IHookBind>('useHandler', useHandler, { disposeFnQueue: handlerDisposeFnQueue });
  // perform action for result
  let mutableActionResult = await action(props, contextInner.resolve()).catch(error => {
    // catch BreakActionError as skip sugar 
    if (error instanceof BreakActionError) {
      return error.actionResult;
    }
    // throw unexpected error
    throw error;
  });
  // dispose all handlers
  for (const disposeFn of handlerDisposeFnQueue) {
    const disposeResult = disposeFn();
    if (!mutableActionResult) {
      mutableActionResult = disposeResult;
    }
  }
  return buildOutgoingMessage(mutableActionResult);
}

export type {
  ActionResult,
  ActionFnInner,
  HandlerDisposeFn,
  HandlerFn,
  IContextForHandler
};
