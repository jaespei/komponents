/**
 * Export all schedulers.
 */
module.exports = (services, store, utils) => {
    let schedulers = {};
    Object.assign(schedulers, {
        basic: require("./basic")(services, store, utils), 
        //composite: require("./composite")(services, store, utils)
    });
    return schedulers;
};