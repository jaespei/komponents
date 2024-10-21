/**
 * Utilities related with UUID generation.
 *
 * @author Javier Esparza Peidro <jesparza@dsic.upv.es>
 */

// External dependencies
//
var _ = require('lodash');


/**
 * Generates a GUID (version 4).
 *
 * @see {@link http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript}
 * @returns {string} The generated GUID
 * @private
 */
function _uuid(str) {
    if (str) return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
    else return _s4() + _s4() + '-' + _s4() + '-' + _s4() + '-' +
        _s4() + '-' + _s4() + _s4() + _s4();
}

/**
 * Utility function for generating 4 random numbers, bsic piece for generating a GUID.
 *
 * @see {@link http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript}
 * @returns {string} The 4 random numbers
 * @private
 */
function _s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
}

exports.uuid = _uuid;
exports.s4 = _s4;
