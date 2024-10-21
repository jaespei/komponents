/**
 * This module contains utilities for managing errors in the platform.
 *
 * When using promises, keeping track of errors is quite difficult. When an
 * error is thrown, its stack trace keeps information about the current function
 * call stack, which is typically composed of event loop related routines and
 * this information is not useful for debugging purposes.
 *
 * This module enables the following mechanism for keeping track of errors in a
 * useful way:
 * - Whenever an error is detected, and we want to keep track of that step, the
 * 	 error() function should be called with information about the error.
 * - The error() function wraps the error within a ManagedError instance, and
 * 	 registers the stack trace when the error() function was called, keeping
 * 	 track of every step.
 *
 * To have more meaningful stack traces, the error() function of this module
 * should be used with Q promises with long stack support enabled.
 */

// Standard dependencies
var util = require('util');

/**
 * Managed Error in the platform.
 *
 * @constructor
 * @param {string} [message] - The error message
 * @param {Error} [cause] - The potential cause of the error
 * @param {string} [type] - The error type
 */
function ManagedError(message, cause, type) {
    message = message? message.message || message: '';
    cause = cause || (message? message.cause: null);
    
    if (message && util.isString(message)) this.message = message;
    else if (message) {
        type = cause;
        cause = message;
    }
    if (cause && util.isString(cause)) this.type = cause;
    else if (cause) this.cause = cause;
    if (type && util.isString(type)) this.type = type;
    else if (type) this.cause = type;
    if (this.cause && !this.type && this.cause.type) this.type = this.cause.type;
    if (this.cause && !this.message && this.cause.message) this.message = this.cause.message;
    if (!this.type) this.type = 'ManagedError';
    Error.captureStackTrace(this, ManagedError);
}
util.inherits(ManagedError, Error);
ManagedError.prototype.name = 'ManagedError';
ManagedError.prototype.getStackTrace = function () {
    var str = this.name + ': ' + this.message + '\n' + this.stack;
    var cause = this.cause;
    while (cause) {
        str += '\n' + cause.name + ': ' + cause.message + '\n' + cause.stack;
        cause = cause.cause;
    }
    return str;
};

/**
 * Wraps an error within a traceable error.
 *
 * @param {string} [msg] - The error message
 * @param {Error} [cause] - The error to keep track of
 * @param {string} [type] - The error type
 * @return {ManagedError} The traceable error
 */
function error(msg, cause, type) {

    return new ManagedError(msg, cause, type);

}

module.exports = error;
