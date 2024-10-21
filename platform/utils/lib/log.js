/**
 * Utilities related with message logging.
 *
 * @author Javier Esparza Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
//
var util = require('util');

// External dependencies
var request = require('request');

// Globals
// - envLogManagerAddr: the environment var with the Log Manager address
// - envLogManagerPort: the environment var with the Log Manager port
// - logManagerPort: the default Log Manager port
// - level: the default level
//
var envLogManagerAddr = 'LOGMANAGER_ADDR';
var envLogManagerPort = 'LOGMANAGER_PORT';
var logManagerPort = 10005;
var level = 'debug';

/**
 * Creates a new logger.
 *
 * @param {string} [owner] - The owner of the log message
 * @param {Object} [cfg] - Logger configuration
 * @param {Object|string} [cfg.logManager] - The Log Manager
 * @param {string} [cfg.logManager.addr] - The Log Manager address
 * @param {number} [cfg.logManager.port] - The Log Manager port
 * @param {string} [cfg.level] - The default logger level
 * @param {boolean} [cfg.enabled] - Determines whether the logger is enabled
 * @param {boolean} [cfg.print] - Determines whether messages are printed
 * @param {boolean} [cfg.local] - Determines whether messages are only managed locally
 * @return {Function} the logger
 */
exports.logger = function(owner, cfg) {

    if (owner && !util.isString(owner)) {
        cfg = owner;
        owner = 'unknown';
    }

    if (!cfg) cfg = {};
    cfg.owner = owner;
    cfg.level = cfg.level? cfg.level: level;
    if (cfg.logManager) {
        if (util.isString(cfg.logManager)) {
            var addr = cfg.logManager.split(':')[0];
            var port = cfg.logManager.split(':')[1];
            cfg.logManager = {addr: addr, port: port? port: logManagerPort};
        } else {
            if (!cfg.logManager.addr) throw new Error('Unable to create logger: Log Manager addres not specified');
            cfg.logManager.port = cfg.logManager.port? cfg.logManager.port: logManagerPort;
        }
    } else {
        if (process.env[envLogManagerAddr]) {
            cfg.logManager = {
                addr: process.env[envLogManagerAddr],
                port: process.env[envLogManagerPort]? process.env[envLogManagerPort]: logManagerPort
            };
        }
    }

    var factory = function(level, out) {

        return function(msg, data, info, cb) {
            if (!cfg.enabled) return;
            if (cfg.print) {
                var str = '[' + cfg.owner + '] [' + level + '] ' + msg;
                if (data) {
                    if (data instanceof Error) {
                        str += '\n    ERROR: ' + data.name;
                        str += '\n    ERROR MESSAGE: ' + data.message;
                        str += '\n    ERROR STACK:\n' + data.stack;
                    } else {
                         str += '\n    DATA: ' + (util.isString(data)? data: JSON.stringify(data));
                    }
                }
                out(str);
            }
            if (!cfg.local && cfg.logManager) {
                var message = {
                    owner: cfg.owner,
                    level: level,
                    msg: msg,
                    opts: {}
                };

                if (data) {
                    if (data instanceof Error) {
                        message.opts.error = data.name;
                        message.opts.errorMsg = data.message;
                        message.opts.errorStack = data.stack;
                    } else {
                        message.opts.data = util.isString(data)? data: JSON.stringify(data);
                    }
                }

                if (info) msg.opts.info = info;

                var opts = {
                    url: 'http://' + cfg.logManager.addr + ':' + cfg.logManager.port + '/log/messages',
                    method: 'POST',
                    json: true,
                    body: message
                };
                request(opts, function (err, res, body) {
                    if (err || (res && (res.statusCode < 200 || res.statusCode >= 300))) {
                        if (cb) cb(err? err: new Error('HTTP request with status code ' + res.statusCode));
                    } else {
                        if (cb) cb();
                    }
                });
            } else {
                if (cb) cb();
            }
        };

    };

    var debug = factory('debug', cfg.debug? cfg.debug: console.log);
    var info = factory('info', cfg.info? cfg.info: console.info);
    var warn = factory('warn', cfg.warn? cfg.warn: console.warn);
    var error = factory('error', cfg.error? cfg.error: console.error);
    var critical = factory('critical', cfg.critical? cfg.critical: console.error);

    var logger = debug;
    logger.debug = debug;
    logger.info = info;
    logger.warn = warn;
    logger.error = error;
    logger.critical = critical;

    return logger;
};
