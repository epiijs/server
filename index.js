'use strict'

const http = require('http')
const assist = require('./kernel/assist.js')
const logger = require('./kernel/logger.js')
const server = require('./kernel/server.js')

module.exports = startServer
module.exports.server = server

/**
 * start server
 *
 * @param  {Object} config - config for apps
 * @param  {Object} plugin - { [name]: [handler] }
 * @return {Object[]} http.Server instances
 */
function startServer(config, plugin) {
  var version = require('./package.json').version
  logger.info(`epii server version: ${version}`)
  var configs = assist.arrayify(config)
  if (configs.length === 0) {
    return logger.warn('server config not provided')
  }

  return configs.map(async function (c) {
    // create server handler
    var handler = await server.create(c, plugin)

    // start server
    var httpServer = http
      .createServer(handler)
      .listen(c.port)
      .on('clientError', function (error, socket) {
        // MUST use Node 6+
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      })

    // output launch info
    logger.done(`start server: ${c.name}`)
    logger.done(` |- port: ${c.port}`)

    return httpServer
  })
}