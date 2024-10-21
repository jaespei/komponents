const _ = require("lodash");
const path = require("path");
const k8s = require('@kubernetes/client-node');
const { K8sDriver } = require("../k8s");

/**
 * Domain driver implementation of an externally managed K8S cluster.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class K8sExternalDriver extends K8sDriver {

    /**
     * Initializes the driver. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} drivers - Dictionary of drivers
     * @param {Object} store - The store
     * @param {Object} utils - Additional utilities
     */
    constructor(drivers, store, utils) {
        super(store, utils);
        if (!drivers) throw new Error("Unable to initialize K8sExternalDriver: missing drivers");
        if (!store) throw new Error("Unable to initialize K8sExternalDriver: missing store");
        if (!utils) throw new Error("Unable to initialize K8sExternalDriver: missing utilities");
        this.drivers = drivers;
        this.store = store;
        this.utils = utils;
        this.error = utils.error;
        this.drivers = drivers;
        this.log = utils.log || ((msg) => console.log(`[K8sExternalDriver] ${msg}`));
    }

    /**
     * Add a new domain.
     * 
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type "external/k8s"
     * @param {string} domain.kubeconfig - The domain configuration
     * @param {string} domain.gateway - The domain gateway
     * @param {string} [domain.gwAddr] - The domain gateway address
     * @param {number} [domain.gwPort] - The domain gateway port
     * @param {string} [domain.namespace] - The domain namespace
     * @param {Object} ctxt - The operation context
     * @return {Object} The created domain
     */
    async addDomain(domain, ctxt) {
        this.log(`addDomain(${JSON.stringify(domain)})`);

        if (!domain.kubeconfig) throw new Error("Unable to add domain: missing kubeconfig");
        if (!domain.gateway) throw new Error("Unable to add domain: missing gateway");
        //if (!domain.gateway || !domain.gwAddr || !domain.gwPort) throw new Error("Unable to add domain: missing addr");
        let [gwAddr, gwPort] = domain.gateway.split(":");
        if (!gwAddr || !gwPort) throw new Error("Unable to add domain: unsupported gateway format");


        // Fill optional atts
        domain.id = this.utils.uuid();
        domain.namespace = domain.namespace || this.utils.constants.DOMAIN_K8S_NAMESPACE;

        // Insert data
        let _domain = {
            id: domain.id,
            type: domain.type,
            gateway: domain.gateway,
            runtimes: ["docker"],
            cfg: {
                //gwAddr: domain.addr,
                kubeconfig: domain.kubeconfig,
                namespace: domain.namespace                
            },
            data: {},
            state: "init",
            last: Date.now()
        }

        // Insert data
        await this.store.insert("domains", _domain);

        try {

            // -----------------------------
            // Invoke super 
            // -----------------------------
            // - add gateway
            _domain = await super.addDomain(_domain, ctxt);

            // Update state
            await this.store.update(
                "domains",
                { id: _domain.id },
                { state: "ready", last: Date.now() }
            );

            return _domain;

        } catch (err) {

            // Undo
            await this.store.update(
                "domains",
                { id: _domain.id },
                { state: "failed", last: Date.now() }
            );

            throw err;
        }


    }


    /**
     * Update the specified domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} data  - The data to update
     * @param {Object} ctxt - The operation context
     */
    async updateDomain(domain, data, ctxt) {
        this.log(`updateDomain(${JSON.stringify(domain)}, ${JSON.stringify(domain)})`);

        // Update data
        await this.store.update("domains", { id: domain.id }, data);

    }

    /**
     * Remove the specified domain.
     * 
     * @param {string} domain - The domain
     * @param {Object} ctxt - The operation context
     */
    async removeDomain(domain, ctxt) {
        this.log(`removeDomain(${JSON.stringify(domain)})`);

       
        let lock = this.utils.uuid();
        await this.store.update(
            "domains",
            { id: domain.id },
            { state: "destroy" },
            { lock: lock }
        );

        // -----------------------------
        // Invoke super 
        // -----------------------------
        await super.removeDomain(domain, ctxt);

        // 2. Remove domain
        await this.store.delete("domains", { id: domain.id });

    }

    /**
     * Add a new resource to the specified domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource data
     * @param {Object} ctxt - The operation context
     * @return {Object} The added resource
     */
    async addResource(domain, resource, ctxt) {
        this.log(`addResource(${domain.id},${JSON.stringify(resource)})`);

        throw new Error("Unsupported operation");

    }

    /**
     * Update the specified resource.
     * 
     * @param {Object} domain - The resource domain
     * @param {Object} resource - The resource
     * @param {Object} data  - The data to update
     * @param {Object} ctxt - The operation context
     */
    async updateResource(domain, resource, data, ctxt) {
        this.log(`updateResource(${domain.id}, ${resource.id}, ${JSON.stringify(data)})`);

        throw new Error("Unsupported operation");

    }

    /**
     * Remove the specified resource.
     * 
     * @param {Object} domain - The resource domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async removeResource(domain, resource, ctxt) {
        this.log(`removeResource(${domain.id}, ${resource.id})`);

        throw new Error("Unsupported operation");
    }

}


module.exports = (drivers, store, utils) => {
    return new K8sExternalDriver(drivers, store, utils);
}