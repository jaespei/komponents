const Q = require("q");
const _ = require("lodash");
const forwarder = require("./forwarder");


Q.longStackSupport = true;

Q.waitAll = (promises) => {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then((snapshots) => {
        _.forEach(snapshots, (snapshot) => {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};


let error = (msg, code, cause) => {
    if (msg && !_.isString(msg)) { cause = msg; msg = code = undefined; }
    if (code && !_.isString(code)) { cause = code; code = undefined; }
    let err = new Error(msg);
    err.code = code;
    err.cause = cause;
    err.stack = cause && cause.stack ? err.stack + "\n" + cause.stack : err.stack;
    return err;
}

/**
 * Proxy.
 * 
 * @author Javier Esparza-Peidro <jesparza@description.upv.es
 */
class Proxy {

    /**
     * Initialize proxy.
     * 
     * @param {Object} opts
     * @param {Array<Object>} opts.dstPort - Ports mapping spec {srcAddr, srcPort, dstAddr, dstPort}
     * @param 
     */
    constructor(opts) {

        this.opts = _.clone(opts);
        this.log = (msg) => console.log(`[Proxy] ${msg}`);
        this.error = error;

        this.log(`Proxy(${JSON.stringify(opts)})`);

        // Initialize forwarders
        this.forwarders = {};

        this.opts.dstPort = this.opts.dstPort || [];
        for (let portSpec of this.opts.dstPort) {
            this.forwarders[portSpec.srcPort] = forwarder({
                addr: portSpec.srcAddr || this.opts.addr,
                port: portSpec.srcPort,
                gwAddr: this.opts.gwAddr,
                gwPort: this.opts.gwPort,
                dstAddr: portSpec.dstAddr || this.opts.dstAddr,
                dstPort: portSpec.dstPort || portSpec.srcPort
            });
        }
    }

    /**
     * Start proxy.
     */
    async start() {
        this.log(`start()`);

        let promises = [];
        for (let port in this.forwarders) {
            promises.push(this.forwarders[port].start());
        }

        return Q.waitAll(promises);
    }

    /**
     * Stop proxy.
     */
    async stop() {
        this.log(`stop()`);

        let promises = [];
        for (let port in this.forwarders) {
            promises.push(this.forwarders[port].stop());
        }

        return Q.waitAll(promises);
    }

    /**
     * Change configuration.
     */
    async update(opts) {
        this.log(`update(${JSON.stringify(opts)})`);

        if (opts.gwAddr || opts.gwPort || opts.dstAddr) {

            // Relevant data has changed; update everything
            this.opts.gwAddr = opts.gwAddr || this.opts.gwAddr;
            this.opts.gwPort = opts.gwPort || this.opts.gwPort;
            this.opts.dstAddr = opts.dstAddr || this.opts.dstAddr;
            this.opts.dstPort = opts.dstPort || this.opts.dstPort;

            // Stop all forwarders 
            let promises = [];
            for (let port in this.forwarders) {
                promises.push(this.forwarders[port].stop());
            }
            // Wait ...
            await Q.waitAll(promises);

            // Replace all forwarders, and start
            promises = [];
            this.forwarders = {};
            for (let portSpec of this.opts.dstPort) {
                this.forwarders[portSpec.srcPort] = forwarder({
                    addr: portSpec.srcAddr || this.opts.addr,
                    port: portSpec.srcPort,
                    gwAddr: this.opts.gwAddr,
                    gwPort: this.opts.gwPort,
                    dstAddr: portSpec.dstAddr || this.opts.dstAddr,
                    dstPort: portSpec.dstPort || portSpec.srcPort
                });
                promises.push(this.forwarders[portSpec.srcPort].start());
            }
            // Wait ...
            await Q.waitAll(promises);

        } else if (opts.dstPort) {

            // Replace forwarders surgically

            // - Remove useless forwarders
            let promises = [];
            for (let portSpec of this.opts.dstPort) {
                if (!opts.dstPort.find(ps => ps.srcPort == portSpec.srcPort)) {
                    promises.push(this.forwarders[portSpec.srcPort].stop());
                    delete this.forwarders[portSpec.srcPort];
                }
            }
            // Wait ...
            await Q.waitAll(promises);

            // - Add new forwarders
            promises = [];
            for (let portSpec of opts.dstPort) {
                if (!this.forwarders[portSpec.srcPort]) {
                    this.forwarders[portSpec.srcPort] = forwarder({
                        addr: portSpec.srcAddr || this.opts.addr,
                        port: portSpec.srcPort,
                        gwAddr: this.opts.gwAddr,
                        gwPort: this.opts.gwPort,
                        dstAddr: portSpec.dstAddr || this.opts.dstAddr,
                        dstPort: portSpec.dstPort || portSpec.srcPort
                    });
                    promises.push(this.forwarders[portSpec.srcPort].start());
                }
            }
            this.opts.dstPort = opts.dstPort;
            
            // Wait ...
            await Q.waitAll(promises);
        }

    }

}

module.exports = (opts) => {
   return new Proxy(opts);
}