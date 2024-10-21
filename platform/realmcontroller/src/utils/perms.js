const _ = require("lodash");

/**
 * Return the read permissions of the
 * specified user.
 * 
 * @param {Object} user - The user
 * @returns {Object} The permissions
 */
function read(user) {
    let perms = _.reduce(
        _.map(
            //user.roles,
            //
            (user.groups || []).concat(user.id),
            role => [`perm=${role}:o`, `perm=${role}:w`, `perm=${role}:r`]
        ),
        (accum, perms) => accum.concat(perms), []
    );
    return perms;
}

/**
 * Return the write permissions of the
 * specified user.
 * 
 * @param {Object} user - The user
 * @returns {Object} The permissions
 */
function write(user) {
    let perms = _.reduce(
        _.map(
            //user.roles,
            (user.groups || []).concat(user.id),
            role => [`perm=${role}:o`, `perm=${role}:w`]
        ),
        (accum, perms) => accum.concat(perms), []
    );
    return perms;
}

/**
 * Return the owner permissions of the
 * specified user.
 * 
 * @param {Object} user - The user
 * @returns {Object} The permissions
 */
function owner(user) {
    let perms = _.map(
        //user.roles,
        (user.groups || []).concat(user.id),
        role => [`perm=${role}:o`]
    );
    return perms;
}


module.exports = {
    read,
    write,
    owner
}