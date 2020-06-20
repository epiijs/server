/* eslint-disable no-await-in-loop */

const path = require('path');
const Koa = require('koa');
const assist = require('./assist');
const loader = require('./loader');
const logger = require('./logger');

/**
 * verify and fixup config
 *
 * @param  {Object} config
 * @return {Object} linted config
 */
function verifyConfig(config) {
  if (!config) throw new Error('config required');
  const result = { ...config };
  if (!result.name) result.name = 'unknown';
  return result;
}

/**
 * load & bind layers
 *
 * @param {Object} app
 * @return {Promise}
 */
async function applyLayers(app) {
  const orders = [
    'extend', // initial basic ability and extend aspect
    'static', // perform static output
    'middle', // proceed custom middlewares
    'router', // proceed custom controllers
    'logger', // perform analysis and save logs
  ];
  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i];
    const layerPath = path.join(__dirname, '../layers', order + '.js');
    const layerItem = loader.loadFile(layerPath);
    if (layerItem) {
      await layerItem(app);
    } else {
      logger.halt('failed to load layer', order);
    }
  }
}

/**
 * create server handler
 *
 * @param  {Object} config - app config
 * @return {Function} http.Server callback
 */
async function createServer(config) {
  // verify config
  const conf = verifyConfig(config);

  // create koa instance
  const app = new Koa();

  // create epii instance
  const globalEPII = {};
  assist.internal(globalEPII, 'config', conf, { enumerable: false });
  assist.internal(app, 'epii', globalEPII);
  app.use(async (ctx, next) => {
    const sessionEPII = {};
    assist.internal(ctx, 'epii', sessionEPII);
    await next();
  });

  // apply recipes
  await applyLayers(app);

  // bind event
  app.on('error', (error) => {
    logger.halt('server error', error.message);
    logger.halt(error.stack);
  });
  return app.callback();
}

module.exports = {
  createServer
};
