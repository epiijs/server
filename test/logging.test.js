import assert from 'assert';
import { createLogger, setTransport } from '../build/server/logging.js';

describe('logging', () => {
  it('createLogger returns singleton', () => {
    const logger1 = createLogger();
    const logger2 = createLogger();
    assert.strictEqual(logger1, logger2);
  });

  it('Proxy: standard methods call transport with method name', () => {
    const calls = [];
    setTransport((method, ...args) => {
      calls.push({ method, args });
    });

    const logger = createLogger();
    logger.log('log message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    logger.debug('debug message');

    assert.strictEqual(calls.length, 5);
    assert.deepStrictEqual(calls[0], { method: 'log', args: ['log message'] });
    assert.deepStrictEqual(calls[1], { method: 'info', args: ['info message'] });
    assert.deepStrictEqual(calls[2], { method: 'warn', args: ['warn message'] });
    assert.deepStrictEqual(calls[3], { method: 'error', args: ['error message'] });
    assert.deepStrictEqual(calls[4], { method: 'debug', args: ['debug message'] });
  });

  it('Proxy: custom method names work', () => {
    const calls = [];
    setTransport((method, ...args) => {
      calls.push({ method, args });
    });

    const logger = createLogger();
    logger.custom('custom message');
    logger.anything('multiple', 'args');

    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls[0], { method: 'custom', args: ['custom message'] });
    assert.deepStrictEqual(calls[1], { method: 'anything', args: ['multiple', 'args'] });
  });

  it('setTransport overrides previous transport', () => {
    const calls1 = [];
    const calls2 = [];

    setTransport((method, ...args) => { calls1.push({ method, args }); });
    const logger = createLogger();
    logger.info('first');

    setTransport((method, ...args) => { calls2.push({ method, args }); });
    logger.info('second');

    assert.strictEqual(calls1.length, 1);
    assert.strictEqual(calls2.length, 1);
    assert.deepStrictEqual(calls1[0].args, ['first']);
    assert.deepStrictEqual(calls2[0].args, ['second']);
  });

  it('multiple args passed through', () => {
    const calls = [];
    setTransport((method, ...args) => {
      calls.push({ method, args });
    });

    const logger = createLogger();
    logger.info('a', 'b', 'c', 123, { key: 'value' });

    assert.deepStrictEqual(calls[0].args, ['a', 'b', 'c', 123, { key: 'value' }]);
  });
});
