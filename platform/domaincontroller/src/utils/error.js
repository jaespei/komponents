const _ = require("lodash");

module.exports = (msg, type, cause) => {
    if (msg && !_.isString(msg)) { cause = msg; msg = type = undefined; }
    if (type && !_.isString(type)) { cause = type; type = undefined; }
    let err = new Error();
    err.message = msg || cause && cause.response && cause.response.message || cause && cause.message;
    err.type = type || cause && cause.type || (cause && cause.response && cause.response.body.reason);
    err.cause = cause;
    err.stack = cause && cause.stack ? err.stack + "\n" + cause.stack : err.stack;
    return err;
}