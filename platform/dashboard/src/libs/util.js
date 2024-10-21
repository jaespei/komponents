
const Q = require("q");

/**
 * Returns an asynchronous result.
 * 
 * @param {Promise} promise - The promise to wrap, if any
 * @param {Function} cb - The callback to wrap, if any 
 */
function asyncResult(promise, cb) {
    if (cb) {
        promise
            .then(res => cb(null, res))
            .catch(err => cb(err));
    }
    return promise;
}

/**
 * Execute the provided function a number of times
 *
 * @param {Function} fn - The function to execute
 * @param {Object} [opts] - Additional options
 * @param {number} [opts.retry] - The retry timeout (default 5s)
 * @param {number} [opts.count] - Max number of retries
 * @param {number} [opts.timeout] - Max waiting time (default 5m)
 */
 function loop(fn, opts) {
    console.log(`loop(${JSON.stringify(opts)})`);
    opts = opts || {};
    opts.retry = opts.retry || 5000;
    opts.timeout = opts.timeout || 300000;

    let deferred = Q.defer();
    let count = 0,
        ts = Date.now();
    let wrappedFn = async () => {
        let result;
        try {
            result = await fn();
        } catch (err) {
            deferred.reject(err);
            return;
        }
        if (result) deferred.resolve(result);
        else {
            if (opts.count) {
                count++;
                if (count == opts.count) {
                    deferred.reject(new Error("Loop operation exceeded maximum number of retries"));
                    return;
                }
            }
            if (opts.timeout && Date.now() - ts > opts.timeout) {
                deferred.reject(new Error("Loop operation expired timeout"));
                return;
            }
            setTimeout(wrappedFn, opts.retry);
        }
    }
    wrappedFn();
    return deferred.promise;
}

let constants = {
    PATH_SEPARATOR: '/',
    MAPPING_SEPARATOR: '.'
};

export default {
    asyncResult,
    constants,
    /*uuid: (str) => {
        if (str) return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
        else return this._s4() + this._s4() + '-' + this._s4() + '-' + this._s4() + '-' +
        this._s4() + '-' + this._s4() + this._s4() + this._s4();
    },
    _s4: () => {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1)
    }*/
    uuid: () => {
        return Date.now() + "-" + Date.now()*Math.random();
    },
    log: (msg) => {
        console.log(`[Dashboard] ${msg}`);
    },
    loop: loop
}