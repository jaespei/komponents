const _ = require("lodash");
const path = require("path");

/**
 * Base driver for managing bare-metal hosts.
 * 
 * This driver provides basic primitives for managing metal
 * servers. It is responsible for:
 * - adding 'komponents' user
 * - configuring SSH keys for remote login
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class MetalDriver {

    /**
     * Initializes the driver. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} utils - Additional utilities
     */
    constructor(utils) {
        if (!utils) throw new Error("Unable to initialize MetalDriver: missing utilities");
        this.utils = utils;
        this.ansible = this.utils.ansible(
            {
                pathHome: path.join(module.path, "ansible"),
                pathPlaybooks: path.join(module.path, "ansible", "playbooks"),
            }
        );
        this.log = utils.log || ((msg) => console.log("[MetalDriver] " + msg));
    }

    /**
     * Add a new keypair.
     * 
     * @param {Object} opts - Additional options
     */
    async addKeys(opts) {
        this.log(`addKeys()`);

        // Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("keysadd", ansibleOpts);
        // -------------------------

        return result.result.localhost;

    }

    /**
     * Add new metal host. 
     * 
     * The original host credentials must be provided.
     * 
     * Upon first authentication, a domain user is added and 
     * SSH login gets automated through the domain public/private 
     * key credentials.
     * 
     * Details about the added host are returned.
     * 
     * @param {Object} host - The host
     * @param {string} host.addr - The host address 
     * @param {string} host.user - The host user 
     * @param {string} [host.privateKey] - The host private key 
     * @param {string} [host.password] - The host password 
     * @param {Object} opts - Additional options
     * @param {string} opts.domainUser - The domain user
     * @param {string} opts.domainPrivateKey - The domain private key
     * @param {string} opts.domainPublicKey - The domain public key
     * @return {Object} The added host metadata
     */
    async addHost(host, opts) {
        this.log(`addHost(${host.addr})`);

        if (!host.addr) throw new Error("Unable to add host: missing host address");
        if (!host.privateKey && (!host.user || !host.password)) throw new Error("Unable to add host: missing auth credentials");
        if (!opts.domainUser) throw new Error("Unable to add host: missing domain user");
        if (!opts.domainPrivateKey) throw new Error("Unable to add host: missing domain private key");
        if (!opts.domainPublicKey) throw new Error("Unable to add host: missing domain public key");

        // Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainPrivateKey: opts.domainPrivateKey,
                var_domainPublicKey: opts.domainPublicKey,
                var_domainUser: opts.domainUser,
                var_hostAddr: host.addr
            }
        };
        if (host.user) ansibleOpts.vars.var_hostUser = host.user;
        if (host.password) ansibleOpts.vars.var_hostPassword = host.password;
        if (host.privateKey) ansibleOpts.vars.var_hostPrivateKey = host.privateKey;

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("hostadd", ansibleOpts);
        // -------------------------

        return result.result.host;
    }

    /**
     * Remove host.
     * 
     * 
     * @param {Object} host - The host
     * @param {string} host.addr - The host address
     * @param {Object} opts - Additional options
     * @param {string} opts.domainUser - The domain user
     * @param {string} opts.domainPrivateKey - The domain private key
     */
    async removeHost(host, opts) {
        this.log(`removeHost(${host.addr})`);

        if (!host.addr) throw new Error("Unable to remove host: missing host address");
        if (!opts.domainUser) throw new Error("Unable to remove host: missing domain user");
        if (!opts.domainPrivateKey) throw new Error("Unable to remove host: missing domain private key");

        // Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainPrivateKey: opts.domainPrivateKey,
                var_domainUser: opts.domainUser,
                var_hosts: host.addr
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("hostremove", ansibleOpts);
        // -------------------------

    }

    /**
     * Obtain info about the host.
     * 
     * @param {Object} host - The host
     * @param {Object} opts - Additional options
     */
    async getHostInfo(host, opts) {
        this.log(`get(${host.id}, ${host.id})`);
    }


}


module.exports = (drivers, utils) => {
    return new MetalDriver(utils);
}