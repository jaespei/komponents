const _ = require("lodash");
const path = require("path");
const crypto = require("crypto");
const { K8sDriver } = require("../k8s");

/**
 * Domain driver implementation of kind-based K8S clusters.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class K8sKindDriver extends K8sDriver {

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
        if (!drivers) throw new Error("Unable to initialize K8sKindDriver: missing drivers");
        if (!store) throw new Error("Unable to initialize K8sKindDriver: missing store");
        if (!utils) throw new Error("Unable to initialize K8sKindDriver: missing utilities");
        this.drivers = drivers;
        this.store = store;
        this.utils = utils;
        this.error = utils.error;
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
     * @param {string} domain.type - The domain type "kind/k8s"
     * @param {string} domain.title - The domain title
     * @param {Array<string>} domain.labels - The domain labels
     * @param {string} [domain.privateKey] - The domain private key
     * @param {string} [domain.publicKey] - The domain public key
     * @param {string} [domain.user] - The domain user
     * @param {string} domain.hostAddr - The host address
     * @param {string} domain.hostUser - The host user
     * @param {string} [domain.hostPassword] - The host password
     * @param {string} [domain.hostPrivateKey] The host private key
     * @param {string} [domain.namespace] - The domain namespace
     * @param {number} [domain.masterNodes] - The number of master nodes
     * @param {number} [domain.workerNodes] - The number of worker nodes
     * @param {number} [domain.apiPort] - The domain API server port
     * @param {number} [domain.gwPort] - The domain gateway port
     * @param {number} [domain.ingressPort] - The domain ingress port
     * @param {number} [domain.ingressSecurePort] - The domain ingress secure port
     * @param {string} [domain.podSubnet] - The pod subnet
     * @param {string} [domain.serviceSubnet] - The service subnet
     * @param {Object} ctxt - The operation context
     * @return {Object} The created domain
     */
    async addDomain(domain, ctxt) {
        this.log(`addDomain(${domain.hostAddr})`);

        if (!domain.hostAddr) throw new Error("Unable to add domain: missing host address");
        if (!domain.hostUser) throw new Error("Unable to add domain: missing host user");
        if (!domain.hostPassword && !domain.hostPrivateKey) throw new Error("Unable to add domain: missing host credentials");

        // Fill optional atts
        domain.id = this.utils.uuid();
        domain.user = domain.user || this.utils.constants.DOMAIN_K8S_USER;
        domain.namespace = domain.namespace || this.utils.constants.DOMAIN_K8S_NAMESPACE;
        domain.masterNodes = domain.masterNodes || this.utils.constants.DOMAIN_KIND_MASTERNODES;
        domain.workerNodes = domain.workerNodes || this.utils.constants.DOMAIN_KIND_WORKERNODES;
        domain.apiPort = domain.apiPort || (20000 + Math.floor(Math.random() * 10000));
        domain.gwPort = domain.gwPort || (30000 + Math.floor(Math.random() * 2768));
        domain.gwPrivatePort = domain.gwPrivatePort || this.utils.constants.DOMAIN_K8S_GATEWAY_PORT;
        domain.ingressPort = domain.ingressPort || (30000 + Math.floor(Math.random() * 2768));
        domain.ingressSecurePort = domain.ingressSecurePort || (30000 + Math.floor(Math.random() * 2768));
        domain.podSubnet = domain.podSubnet || this.utils.randsubnet(); //"10.244.0.0/16";
        domain.serviceSubnet = domain.serviceSubnet || this.utils.randsubnet(); // "10.96.0.0/12";*/

        // 1. Generate domain keys
        if (!domain.privateKey || !domain.publicKey) {
            let keys = await this.drivers.base.metal.addKeys();
            domain.privateKey = keys.privateKey;
            domain.publicKey = keys.publicKey;
        }

        // 2. Add host
        let host = await this.drivers.base.metal.addHost(
            {
                addr: domain.hostAddr,
                user: domain.hostUser,
                privateKey: domain.hostPrivateKey,
                password: domain.hostPassword
            },
            {
                domainUser: domain.user,
                domainPrivateKey: domain.privateKey,
                domainPublicKey: domain.publicKey
            }
        )

        // 3. Configure host
        //
        // - Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainUser: domain.user,
                var_domainPrivateKey: domain.privateKey,
                var_hostAddr: domain.hostAddr,
                var_masterNodes: domain.masterNodes,
                var_workerNodes: domain.workerNodes,
                var_domainId: domain.id,
                var_apiPort: domain.apiPort,
                var_gwPort: domain.gwPort,
                var_gwPrivatePort: domain.gwPrivatePort,
                var_ingressPort: domain.ingressPort,
                var_ingressSecurePort: domain.ingressSecurePort,
                var_imagesPath: path.join(module.path, '..', 'k8s'),
                var_podSubnet: domain.podSubnet,
                var_serviceSubnet: domain.serviceSubnet
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("domainadd", opts);
        // -------------------------

        // Insert data
        let _domain = {
            id: domain.id,
            type: domain.type,
            title: domain.title || "",
            labels: domain.labels || [],
            gateway: `${domain.hostAddr}:${domain.gwPort}`,
            ingress: `${domain.hostAddr}:${domain.ingressPort}`,
            sIngress: `${domain.hostAddr}:${domain.ingressSecurePort}`,
            runtimes: ["docker"],
            cfg: {
                hostAddr: domain.hostAddr,
                user: domain.user,
                privateKey: domain.privateKey,
                publicKey: domain.publicKey,
                namespace: domain.namespace,
                masterNodes: domain.masterNodes,
                workerNodes: domain.workerNodes,
                kubeconfig: result.result.host.config,
                apiPort: domain.apiPort,
                gwPrivatePort: domain.gwPrivatePort,
                podSubnet: domain.podSubnet,
                serviceSubnet: domain.serviceSubnet
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

        // Get lock and mark as destroying
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

        // [TODO] Removing a domain involves many cleanup ops

        // 1. Release host
        //
        // - Prepare Ansible options
        let opts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainUser: domain.cfg.user,
                var_domainPrivateKey: domain.cfg.privateKey,
                var_domainId: domain.id,
                var_hostAddr: domain.cfg.hostAddr
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("domainremove", opts);
        // -------------------------


        // 2. Remove host
        /*await this.drivers.base.metal.removeHost(
            {
                addr: domain.cfg.hostAddr, 
            },
            {
                domainUser: domain.cfg.user,
                domainPrivateKey: domain.cfg.privateKey
            }
        );*/

        // 3. Remove domain
        //await this.store.update("domains", { id: domain.id }, { state: "destroy", last: Date.now()  });
        //await this.store.delete("domains", { id: domain.id });

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
     *
    async updateResource(domain, resource, data, ctxt) {
        this.log(`updateResource(${domain.id}, ${resource.id}, ${JSON.stringify(data)})`);
    }*/

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

    /**
     * Add new instance to the domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} collection - The collection
     * @param {Object} instance - The instance
     * @param {Array<string>} [instance.labels] - The instance labels
     * @param {string} [instance.addr] - The instance address
     * @param {string} [instance.proxy] - Proxy?
     * @param {string} [instance.proxyTarget] - Proxy target route
     * @param {string} [instance.source] - The instance source
     * @param {string} [instance.runtime] - The instance runtime
     * @param {string} [instance.durability] - The instance durability     * 
     * @param {Object} [instance.events] - The instance event handlers
     * @param {Object} ctxt - The operation context
     */
    async addInstance(domain, collection, instance, ctxt) {
        this.log(`addInstance(${domain.id},${collection.id},${JSON.stringify(instance)})`);

        // In Kind domain, we first need to load the instance source 
        // to the cluster

        // Parse image source:
        // - if standard image[:tag] is used then do nothing
        // - if private registry image host:port/<image> then pull and load
        // - if URL then build image and load
        let load = false, mode;
        if (RegExp("^[^:]*:\\d+\\/.+$").test(instance.source)) {
            load = true; mode = "pull";
        } else if (RegExp("^.+:\\/\\/.+$").test(instance.source)) {
            load = true; mode = "build";
        } else if (RegExp("^[^:]+(:.+)?$").test(instance.source)) {
            load = false; 
        }

        if (load) {
            let hash = crypto.createHash('md5').update(instance.source).digest("hex");

            // Add image 
            //
            // - Prepare Ansible options
            let opts = {
                vars: {
                    var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                    var_domainUser: domain.cfg.user,
                    var_domainPrivateKey: domain.cfg.privateKey,
                    var_hostAddr: domain.cfg.hostAddr,
                    var_domainId: domain.id,
                    var_imageMode: mode,
                    var_imageSource: instance.source,
                    var_imageId: hash
                }
            };

            // --- Execute Ansible -----
            let result = await this.ansible.playbook("instanceadd", opts);
            // -------------------------

            // Change image source
            instance.source = `${hash}:1.0`;

            this.log(JSON.stringify(instance));
        }

        // -----------------------------
        // Invoke super 
        // -----------------------------
        // - add gateway
        let _instance = await super.addInstance(domain, collection, instance, ctxt);

        return _instance;

    }


}


module.exports = (drivers, store, utils) => {
    return new K8sKindDriver(drivers, store, utils);
}