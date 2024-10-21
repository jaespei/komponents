/**
 * Export all services.
 */
module.exports = (drivers, store, utils) => {
    let services = {};
    Object.assign(services, {
        //instance: require("./instance")(drivers, services, store, utils),
        domain: require("./domain")(drivers, services, store, utils), 
        event: require("./event")(utils),        
        transaction: require("./transaction")(services, store, utils)
    });
    return services;
};