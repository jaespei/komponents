const _ = require("lodash");
const path = require("path");

/**
 * Domain driver implementation of kind-based K8S clusters.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class K8sKindDriver {

    /**
     * Initializes the driver. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(store, utils) {
        if (!store) throw new Error("Unable to initialize K8sKindDriver: missing store");
        if (!utils) throw new Error("Unable to initialize K8sKindDriver: missing utilities");
        this.store = store;
        this.utils = utils;
        this.ansible = this.utils.ansible(
            {
                pathHome: path.join(module.path, "ansible"),
                pathPlaybooks: path.join(module.path, "ansible", "playbooks"),
            }
        );
        this.log = utils.log || ((msg) => console.log("[K8sKindDriver] " + msg));
    }

    /**
     * Add a new domain.
     * 
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type "k8s/kind"
     * @param {string} [domain.privateKey] - The domain private key
     * @param {string} [domain.publicKey] - The domain public key
     * @param {string} [domain.user] - The domain user
     * @param {string} domain.hostAddr - The host address
     * @param {string} domain.hostUser - The host user
     * @param {string} [domain.hostPassword] - The host password
     * @param {string} [domain.hostPrivateKey] The host private key
     * @param {number} [domain.masterNodes] - The number of master nodes
     * @param {number} [domain.workerNodes] - The number of worker nodes
     * @param {Object} ctxt - The operation context
     * @return {Object} The created domain
     */
    async addDomain(domain, ctxt) {
        this.log(`addDomain(${JSON.stringify(domain)})`);

        if (!domain.hostAddr) throw new Error("Unable to add domain: missing host address");
        if (!domain.hostUser) throw new Error("Unable to add domain: missing host user");
        if (!domain.hostPassword && !domain.hostPrivateKey) throw new Error("Unable to add domain: missing host credentials");

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainUser: domain.user || this.utils.constants.DOMAIN_K8S_USER,
                var_hostAddr: domain.hostAddr,
                var_hostUser: domain.hostUser,
                var_masterNodes: domain.masterNodes || this.utils.constants.DOMAIN_KIND_MASTERNODES,
                var_workerNodes: domain.workerNodes || this.utils.constants.DOMAIN_KIND_WORKERNODES
            }
        };
        if (domain.privateKey) opts.vars.var_domainPrivateKey = domain.privateKey;
        if (domain.publicKey) opts.vars.var_domainPublicKey = domain.publicKey;
        if (domain.hostPassword) opts.vars.var_hostPassword = domain.hostPassword;
        if (domain.hostPrivateKey) opts.vars.var_hostPrivateKey = domain.hostPrivateKey;

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("domainadd", opts);
        // -------------------------

        // Init domain cfg
        let cfg = domain.cfg || {};
        cfg.privateKey = domain.privateKey || result.result.localhost.privateKey;  // obtain private key
        cfg.publicKey = domain.publicKey || result.result.localhost.publicKey;  // obtain public key
        cfg.user = domain.user || this.utils.constants.DOMAIN_K8S_USER;
        cfg.vhostMem = domain.vhostMem || this.utils.constants.DOMAIN_K8S_VHOST_MEM;
        cfg.vhostCpu = domain.vhostCpu || this.utils.constants.DOMAIN_K8S_VHOST_CPU;
        cfg.planning = domain.planning || this.utils.constants.DOMAIN_K8S_PLANNINGSTRATEGY;

        let _domain = {
            id: domainId,
            type: domain.type,
            cfg: cfg,
            data: {},
            state: "init",
            last: Date.now()
        }

        // Insert data
        await this.store.insert("domains", _domain);

        return domain;
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

        // [TODO] Removing a domain involves many cleanup ops



    }

    /**
     * Add a new resource to the specified domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource data
     * @param {stirng} resource.type - The resource type ("fabric", "host", "vhost")
     * @param {string} [resource.addr] - The host address (if fabric/host)
     * @param {string} [resource.privateKey] - The host private key (if fabric/host)
     * @param {string} [resource.user] - The host user (if fabric/host)
     * @param {string} [resource.password] - The host password (if fabric/host) 
     * @param {string} [resource.fabric] - The resource fabric (if vhost)
     * @param {Object} ctxt - The operation context
     * @return {Object} The added resource
     */
    async addResource(domain, resource, ctxt) {
        this.log(`addResource(${domain.id},${JSON.stringify(resource)})`);

        switch (resource.type) {
            case this.utils.constants.RESOURCE_TYPE_FABRIC: {
                // Add new fabric
                let fabric = await this._addFabric(domain, resource, ctxt);
                return fabric;
            }
            case this.utils.constants.RESOURCE_TYPE_VHOST: {
                // Add new vhost
                let vhost = await this._addVHost(domain, resource, ctxt);
                return vhost;
            }
            case this.utils.constants.RESOURCE_TYPE_HOST: {
                // Add new host
                let host = await this._addHost(domain, resource, ctxt);
                return host;
            }
            default:
                throw new Error(`Unable to add resource: unsupported resource type ${resource.type}`);
        }

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

        switch (resource.type) {
            case this.utils.constants.RESOURCE_TYPE_FABRIC: {
                // Remove fabric
                await this._removeFabric(domain, resource, ctxt);
                break;
            }
            case this.utils.constants.RESOURCE_TYPE_VHOST: {
                // Remove vhost
                await this._removeVHost(domain, resource, ctxt);
                break
            }
            case this.utils.constants.RESOURCE_TYPE_HOST: {
                // Remove host
                await this._removeHost(domain, resource, ctxt);
                break;
            }
            default:
                throw new Error(`Unable to remove resource: unsupported resource type ${resource.type}`);
        }

    }




}


module.exports = (store, utils) => {
    return new K8sKindDriver(store, utils);
}