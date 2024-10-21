/**
 * Utilities related with REST calls.
 *
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
var util = require('util');

 // External dependencies
 var Q = require('q');
 var _ = require('lodash');
 var request = require('request');
 var url = require('url');

 var name = process.env.INSTANCE_NAME? process.env.INSTANCE_NAME: (process.env.INSTANCE_ID? process.env.INSTANCE_ID: null);
 var _log = require('./log').logger('utils.rest' + (name? '<' + name + '>': ''), {enabled: true, print: true});
 var error = require('./error');

/**
 * Globals:
 * - timeout: the maximum timeout for receiving a response
 */
var timeout = 10*60*1000; // 10 mins


/**
 * Call an HTTP RESTful service.
 *
 * @param {string} req - The HTTP request
 * @param {string} req.host - The host
 * @param {number} req.port - The port
 * @param {string} req.url - The HTTP url
 * @param {string} req.url.path - The path
 * @param {Object} [req.url.query] - The query
 * @param {string} [req.method] - The HTTP method
 * @param {Object} [req.content] - The request body
 * @param {number} [req.timeout] - The maximum timeout for receiving a response
 * @param {OperationCallback} [cb] - The operation callback
 */
function callREST(req, cb) {

     _log('START callREST(' + JSON.stringify(req) + ')');

     if (!req) throw error('Unable to call REST: request not specified');
     if (!req.host) throw error('Unable to call REST: request \'host\' not specified');
     if (!req.port) throw error('Unable to call REST: request \'port\' not specified');
     if (!req.url) throw error('Unable to call REST: request \'url\' not specified');
     if (!util.isString(req.url) && !req.url.path) throw error('Unable to call REST: request \'url.path\' not specified');

     var path = util.isString(req.url)? req.url: req.url.path + (req.url.query? url.format({query: req.url.query}): '');

     var opts = {
         url: 'http://' + req.host + ':' + req.port + path,
         method: req.method? req.method: 'GET',
         json: true,
         timeout: req.timeout? req.timeout: timeout
     };
     if (req.content) {
         opts.body = req.content;
     }

     // call machine
     //
     request(opts, function (err, res, body) {
         if (err || (res && (res.statusCode < 200 || res.statusCode >= 300))) {
             _log.error('END callREST(' + JSON.stringify(req) + ') ERROR', err);
             if (cb)
                 cb(err?
                     error(err):
                     error('Unable to call REST service: REST call finished with code ' + res.statusCode + ': ' + (res? JSON.stringify(res.body): 'Unknown'))
                 );
             return;
         }

         // no error,
         // - notify result
         //
         _log('END callREST(' + JSON.stringify(req) + ') SUCCESS');
         if (cb) cb(null, body);
     });

 }

module.exports = callREST;
