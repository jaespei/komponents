const EventEmitter2 = require("eventemitter2");

/**
 * Event Service.
 * 
 * Component responsible for implementing an internal event bus.
 * In this implementation the EventEmitter2 class is used in order 
 * to  support wildcards and namespaces.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class EventService extends EventEmitter2 { 
    
    /**
     * Initializes the service. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} [utils] - Additional utilities
     */
    constructor(utils) {
        super({
            wildcard: true,
            delimiter: ':'
        });
        this.utils = utils;
        this.log = utils && utils.log || ((msg) => console.log("[EventService] " + msg));
    }
    
    /**
     * Wrapper of EventEmitter emit() method.
     * 
     * @param  {...any} args 
     */
    emit(eventName, ...args) {
        this.log(`emit(${eventName},${JSON.stringify(args)})`);
        super.emit(eventName, ...args);
    }
}

module.exports = (...opts) => {
    return new EventService();
}