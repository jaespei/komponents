const _ = require('lodash');

/**
 * Returns an asynchronous result.
 * 
 * @param {Promise} promise - The promise to wrap, if any
 * @param {Function} cb - The callback to wrap, if any 
 */
function _asyncResult(promise, cb) {
    if (promise && _.isFunction(promise)) {
        cb = promise;
        promise = null;
    }
    if (promise && promise.then && cb) {
        // - promise and callback
        promise
            .then(res => cb(null, res))
            .catch(err => cb(err));
    } else if (promise && cb) {
        // - promise is not a promise
        cb(null, promise)
    }
    return promise;
}

exports.asyncResult = _asyncResult;