const _ = require("lodash");
const path = require("path");
/*const kubeadm = require("./kubeadm");
const kubectl = require("./kubectl");*/

/**
 * Domain driver implementation of K8s on metal servers.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class K8sMetalDriver {

    /**
     * Initializes the driver. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(store, utils) {
        if (!store) throw new Error("Unable to initialize K8sMetalDriver: missing store");
        if (!utils) throw new Error("Unable to initialize K8sMetalDriver: missing utilities");
        this.store = store;
        this.utils = utils;
        this.ansible = this.utils.ansible(
            {
                pathHome: path.join(module.path, "ansible"),
                pathPlaybooks: path.join(module.path, "ansible", "playbooks"),
            }
        );
        this.log = utils.log || ((msg) => console.log("[K8sMetalDriver] " + msg));
    }

    /**
     * Add a new domain.
     * 
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type "k8s/metal"
     * @param {string} [domain.privateKey] - The domain private key
     * @param {string} [domain.publicKey] - The domain public key
     * @param {string} [domain.user] - The domain user
     * @param {number} [domain.vhostMem] - Min vhost mem
     * @param {number} [domain.vhostCpu] - Min vhost cpu
     * @param {string} [domain.planning] - Resources planning strategy ("conservative", "balanced")
     * @param {Object} ctxt - The operation context
     * @return {Object} The created domain
     */
    async addDomain(domain, ctxt) {
        this.log(`addDomain(${JSON.stringify(domain)})`);

        // Generate domain id
        let domainId = this.utils.uuid();

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR)
            }
        };
        if (domain.privateKey) opts.vars.var_privateKey = domain.privateKey;
        if (domain.publicKey) opts.vars.var_publicKey = domain.publicKey;

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


    // -----------------------------------------------------------
    // ------------------------ Private methods ------------------
    // -----------------------------------------------------------


    /**
     * Add a new fabric to the specified domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource data
     * @param {stirng} resource.type - The resource type ("fabric")
     * @param {string} resource.addr - The host address
     * @param {string} [resource.privateKey] - The host private key
     * @param {string} [resource.user] - The host user
     * @param {string} [resource.password] - The host password 
     * @return {Object} The added fabric
     */
    async _addFabric(domain, resource, ctxt) {
        this.log(`_addFabric(${domain.id}, ${JSON.stringify(resource)})`);

        if (!resource.addr) throw new Error("Unable to add resource: missing fabric address");
        if (!resource.privateKey && (!resource.user || !resource.password)) throw new Error("Unable to add resource: missing auth credentials");

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainPublicKey: domain.cfg.publicKey,
                var_domainUser: domain.cfg.user,
                var_fabricHost: resource.addr
            }
        };
        if (resource.user) opts.vars.var_fabricUser = resource.user;
        if (resource.password) opts.vars.var_fabricPassword = resource.password;
        if (resource.privateKey) opts.vars.var_fabricPrivateKey = resource.privateKey;

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("fabricadd", opts);
        // -------------------------

        // Add fabric 
        let fabric = {
            id: this.utils.uuid(),
            type: resource.type,
            domain: domain.id,
            owner: domain.id,
            url: resource.addr,
            cfg: result.result.fabric,  // get fabric cfg
            data: {},
            metrics: {},
            state: "ready",
            last: Date.now()
        };

        // Insert data
        await this.store.insert("resources", fabric);

        return fabric;
    }


    /**
     * Add a virtual host to the specified domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource 
     * @param {string} resource.type - The resource type ("vhost")
     * @param {string} [resource.addr] - The vhost address (static vs dynamic)
     * @param {string} [resource.fabric] - The owner fabric (automatic if not specified)
     * @param {string} [resource.role] - The vhost role ("master", "node")
     * @param {string} [resource.mem] - The required vhost memory
     * @param {string} [resource.cpu] - The required vhost cpu
     * @param {string} [resource.iface] - The iface to attach to
     * @return {Object} The added vhost
     */
    async _addVHost(domain, resource, ctxt) {
        this.log(`_addVHost(${domain.id}, ${JSON.stringify(resource)})`);

        // Set vhost requirements 
        resource.mem = resource.mem || domain.cfg.vhostMem;
        resource.cpu = resource.cpu || domain.cfg.vhostCpu;

        // Look for best available fabric
        let fabric = await this._searchFabric(domain, resource, ctxt);

        // Generate vhost id
        let vhostId = this.utils.uuid();

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainPublicKey: domain.cfg.publicKey,
                var_domainUser: domain.cfg.user,
                var_fabricHost: fabric.url,
                var_vhostId: vhostId,
                var_vhostMem: resource.mem,
                var_vhostCpu: resource.cpu,
                var_vhostIface: fabric.cfg.iface.interface
            }
        };
        if (resource.addr) opts.vars.var_vhostAddr = resource.addr;

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("vhostadd", opts);
        // -------------------------

        // Add vhost 
        let vhost = {
            id: vhostId,
            type: resource.type,
            domain: domain.id,
            owner: fabric.id,
            url: result.result.vhost.addr,
            cfg: result.result.vhost,  // get vhost cfg
            data: {},
            metrics: {},
            state: "ready",
            last: Date.now()
        };

        // Insert data
        await this.store.insert("resources", vhost);

        return vhost;
    }

    /**
     * Search best fabric for requested resource.
     */
    async _searchFabric(domain, resource, ctxt) {
        this.log(`_searchFabric(${domain.id})`);

        // Look for available fabrics
        let query = {
            domain: domain.id,
            type: this.utils.constants.RESOURCE_TYPE_FABRIC,
            state: this.utils.constants.HOST_STATE_READY
        };
        if (resource.fabric) query.id = resource.fabric;

        let fabrics = await this.store.search("resources", query);

        // Check fabric available 
        if (!fabrics.length) throw new Error("Unable to add virtual host: no available fabric in domain");

        // Select best fabric regarding planning strategy and
        // available resources
        let bestFabric;
        switch (domain.cfg.strategy) {
            case this.utils.constants.DOMAIN_PLANNINGSTRATEGY_CONSERVATIVE:
            // [TODO] When metrics are available sort appropriately
            case this.utils.constants.DOMAIN_PLANNINGSTRATEGY_BALANCED:
            // [TODO] When metrics are available sort appropriately
            case this.utils.constants.DOMAIN_PLANNINGSTRATEGY_RANDOM: {
                let randomIndex = Math.floor(fabrics.length * Math.random());
                bestFabric = fabrics[randomIndex];
            }
        }
        return bestFabric;
    }

    /**
     * Add a new host to the specified domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource data
     * @param {stirng} resource.type - The resource type ("host")
     * @param {string} resource.addr - The host address
     * @param {string} [resource.privateKey] - The host private key
     * @param {string} [resource.user] - The host user
     * @param {string} [resource.password] - The host password 
     * @return {Object} The added fabric
     */
    async _addHost(domain, resource, ctxt) {
        this.log(`_addFabric(${domain.id}, ${resource.addr})`);

        if (!resource.addr) throw new Error("Unable to add resource: missing host address");
        if (!resource.privateKey && (!resource.user || !resource.password)) throw new Error("Unable to add resource: missing auth credentials");

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainPublicKey: domain.cfg.publicKey,
                var_domainUser: domain.cfg.user,
                var_hostAddr: resource.addr
            }
        };
        if (resource.user) opts.vars.var_hostUser = resource.user;
        if (resource.password) opts.vars.var_hostPassword = resource.password;
        if (resource.privateKey) opts.vars.var_hostPrivateKey = resource.privateKey;

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("hostadd", opts);
        // -------------------------

        // Add host 
        let host = {
            id: this.utils.uuid(),
            type: resource.type,
            domain: domain.id,
            owner: domain.id,
            url: resource.addr,
            cfg: result.result.host,  // get host cfg
            data: {},
            metrics: {},
            state: "ready",
            last: Date.now()
        };

        // Insert data
        await this.store.insert("resources", host);

        return host;
    }


    /**
     * Remove the specified host.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _removeHost(domain, resource, ctxt) {
        this.log(`_removeHost(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainUser: domain.cfg.user,
                var_hosts: resource.url,
                var_addhoc: true // not using inventory
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("hostremove", opts);
        // -------------------------

        // Delete data
        await this.store.delete("resources", { id: resource.id });

    }

    /**
     * Remove the specified vhost.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _removeVHost(domain, resource, ctxt) {
        this.log(`_removeVHost(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);

        // Obtain vhost fabric
        let fabric;
        if (ctxt.fabric) fabric = ctxt.fabric;
        else {
            [fabric] = await this.store.search("resources", { id: resource.owner, type: "fabric" });
            if (!fabric) throw new Error("Unable to remove resource: owner fabric not found");
        }

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainUser: domain.cfg.user,
                var_fabricHost: fabric.url,
                var_vhosts: resource.id
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("vhostremove", opts);
        // -------------------------

        // Delete data
        await this.store.delete("resources", { id: resource.id });

    }

    /**
     * Remove the specified fabric.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _removeFabric(domain, resource, ctxt) {
        this.log(`_removeFabric(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);

        // Obtain included vhosts
        let vhosts = await this.store.search("resources", { owner: resource.id, type: "vhost" });

        // Remove all vhosts
        ctxt.fabric = resource;
        for (let vhost of vhosts) {
            await this._removeVHost(domain, vhost, ctxt);
        }

        // Remove fabric

        // Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(module.path, this.utils.constants.DOMAIN_K8S_WORKINGDIR),
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainUser: domain.cfg.user,
                var_fabricHost: resource.url
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("fabricremove", opts);
        // -------------------------

        // Delete data
        await this.store.delete("resources", { id: resource.id });

    }


    /**
     * Configure domain nodes.
     * 
     * @param {Object} domain - The domain
     * @param {Object} ctxt - The operation context
     */
    async _configNodes(domain, ctxt) {
        this.log(`_configNodes(${JSON.stringify(domain.id)})`);


    }


    /**
     * Turn the specified resource into master.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _addMaster(domain, resource, ctxt) {
        this.log(`_addMaster(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);



    }

    /**
     * Release the specified resource from being master.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _removeMaster(domain, resource, ctxt) {
        this.log(`_removeMaster(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);

    }

    /**
     * Turn the specified resource into node.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _addNode(domain, resource, ctxt) {
        this.log(`_addNode(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);

    }

    /**
     * Release the specified resource from being node.
     * 
     * @param {Object} domain - The domain
     * @param {Object} resource - The resource
     * @param {Object} ctxt - The operation context
     */
    async _removeNode(domain, resource, ctxt) {
        this.log(`_removeNode(${JSON.stringify(domain.id)}, ${JSON.stringify(resource.id)})`);


    }

}


module.exports = (store, utils) => {
    return new K8sMetalDriver(store, utils);
}