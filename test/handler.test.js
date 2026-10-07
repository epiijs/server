import { describe, it } from 'vitest';
import assert from 'node:assert';
import http from 'node:http';
import { composeHandlers } from '../build/server/handler.js';
import { IncomingMessageWithParams } from '../build/index.js';

describe('public entry exports', () => {
  it('index exports IncomingMessageWithParams, handlers factory and service scope enum', async () => {
    const api = await import('../build/index.js');
    assert.strictEqual(typeof api.IncomingMessageWithParams, 'function');
    assert.strictEqual(typeof api.handlers.staticFiles, 'function');
    assert.strictEqual(typeof api.startServer, 'function');
    assert.strictEqual(typeof api.createLogger, 'function');
    assert.strictEqual(typeof api.setTransport, 'function');
    assert.strictEqual(api.EServiceScope.Process, 'Process');
    assert.strictEqual(api.EServiceScope.Session, 'Session');
  });
});

describe('composeHandlers', () => {
  it('onion model: execution order is correct', async () => {
    const order = [];

    const stack1 = async function (message, next) {
      order.push('stack1-before');
      const result = await next();
      order.push('stack1-after');
      return result;
    };

    const stack2 = async function (message, next) {
      order.push('stack2-before');
      const result = await next();
      order.push('stack2-after');
      return result;
    };

    const defaultHandler = async function () {
      order.push('default');
      return { status: 200, content: 'ok' };
    };

    const composed = composeHandlers([stack1, stack2], defaultHandler);
    const mockMessage = new IncomingMessageWithParams(new http.IncomingMessage(), {});
    const mockLocator = {};
    const result = await composed(mockMessage, mockLocator);

    assert.deepStrictEqual(order, [
      'stack1-before',
      'stack2-before',
      'default',
      'stack2-after',
      'stack1-after'
    ]);
    assert.deepStrictEqual(result, { status: 200, content: 'ok' });
  });

  it('early return: next() not called stops chain', async () => {
    const order = [];

    const interceptor = async function () {
      order.push('interceptor');
      return { status: 403, content: 'forbidden' };
    };

    const defaultHandler = async function () {
      order.push('default');
      return { status: 200 };
    };

    const composed = composeHandlers([interceptor], defaultHandler);
    const mockMessage = new IncomingMessageWithParams(new http.IncomingMessage(), {});
    const result = await composed(mockMessage, {});

    assert.deepStrictEqual(order, ['interceptor']);
    assert.strictEqual(result.status, 403);
  });

  it('double next() throws error', async () => {
    const badHandler = async function (message, next) {
      await next();
      await next();
      return { status: 200 };
    };

    const defaultHandler = async function () {
      return { status: 200 };
    };

    const composed = composeHandlers([badHandler], defaultHandler);
    const mockMessage = new IncomingMessageWithParams(new http.IncomingMessage(), {});

    await assert.rejects(
      () => composed(mockMessage, {}),
      /next\(\) called multiple times/
    );
  });

  it('empty handlers: only default handler executes', async () => {
    const defaultHandler = async function () {
      return { status: 200, content: 'default' };
    };

    const composed = composeHandlers([], defaultHandler);
    const mockMessage = new IncomingMessageWithParams(new http.IncomingMessage(), {});
    const result = await composed(mockMessage, {});

    assert.deepStrictEqual(result, { status: 200, content: 'default' });
  });

  it('next() beyond chain end resolves undefined', async () => {
    const defaultHandler = async function (message, next) {
      return next();
    };

    const composed = composeHandlers([], defaultHandler);
    const mockMessage = new IncomingMessageWithParams(new http.IncomingMessage(), {});
    const result = await composed(mockMessage, {});

    assert.strictEqual(result, undefined);
  });

  it('this binding: IServiceLocator injected via .call()', async () => {
    let capturedThis = null;

    const defaultHandler = async function () {
      capturedThis = this;
      return { status: 200 };
    };

    const composed = composeHandlers([], defaultHandler);
    const mockMessage = new IncomingMessageWithParams(new http.IncomingMessage(), {});
    const mockLocator = { userService: {}, appConfig: {} };
    await composed(mockMessage, mockLocator);

    assert.strictEqual(capturedThis, mockLocator);
  });
});

describe('IncomingMessageWithParams', () => {
  it('params accessible via message.params', () => {
    const raw = new http.IncomingMessage();
    const params = { id: '42', name: 'alice' };
    const message = new IncomingMessageWithParams(raw, params);

    assert.deepStrictEqual(message.params, { id: '42', name: 'alice' });
  });

});
