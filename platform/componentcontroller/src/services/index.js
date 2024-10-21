/**
 * Export all services.
 */
module.exports = (store, utils, opts) => {
    let services = {};
    Object.assign(services, {
        component: require("./component")(services, store, utils, opts), 
        domain: require("./domain")(services, store, utils, opts), 
        transaction: require("./transaction")(services, store, utils, opts)
    });
    return services;
};