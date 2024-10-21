/**
 * This folder includes all the modules with base primitives
 * reused by multiple domain controllers.
 */

module.exports = (utils) => {

    let base = {};
    base.metal = require("./metal")(base, utils);
    base.vagrant = require("./vagrant")(base, utils);
    //base.libvirt = require("./libvirt")(base, utils);
    return { base: base };

}