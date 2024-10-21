/**
 * Domain Subscriber.
 * 
 * Contains the logic for managing domain-related operations.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class DomainSubscriber {

    /**
     * Initializes the subscriber. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} drivers - The domain drivers
     * @param {object} services - The remainder services
     * @param {Object} store - The store
     * @param {Object} utils - Additional utilities
     */
    constructor(drivers, services, store, utils) {
        if (!drivers) throw new Error("Unable to initialize DomainService: missing drivers");
        if (!store) throw new Error("Unable to initialize DomainService: missing store");
        if (!services) throw new Error("Unable to initialize DomainService: missing services");
        if (!utils) throw new Error("Unable to initialize DomainService: missing utilities");
        this.drivers = drivers;
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.log = utils && utils.log || ((msg) => console.log("[DomainService] " + msg));
    }


}



module.exports = (...opts) => {
    
    // Crate subscriber
    let subscriber = new DomainSubscriber(...opts);

}