const _ = require("lodash");
const path = require("path");

/**
 * Base driver for managing vagrant virtual hosts.
 * 
 * This driver provides basic primitives for managing virtual
 * hosts. It is responsible for:
 * - adding/removing fabrics
 * - adding/removing virtual hosts on a given fabric
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class VagrantDriver {

    /**
     * Initializes the driver. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} drivers - Drivers
     * @param {Object} utils - Additional utilities
     */
    constructor(drivers, utils) {
        if (!drivers) throw new Error("Unable to initialize VagrantDriver: missing drivers");
        if (!utils) throw new Error("Unable to initialize VagrantDriver: missing utilities");
        this.drivers = drivers;
        this.utils = utils;
        this.ansible = this.utils.ansible(
            {
                pathHome: path.join(module.path, "ansible"),
                pathPlaybooks: path.join(module.path, "ansible", "playbooks"),
            }
        );
        this.log = utils.log || ((msg) => console.log("[VagrantDriver] " + msg));
    }


    /**
     * Add new fabric.
     * 
     * The original host credentials must be provided.
     * 
     * Upon first authentication, a domain user is added and 
     * SSH login gets automated through the domain public/private 
     * key credentials.
     * 
     * Details about the added host are returned.
     * 
     * @param {Object} fabric - The fabric
     * @param {string} fabric.addr - The fabric address 
     * @param {string} fabric.user - The fabric user 
     * @param {string} [fabric.privateKey] - The fabric private key 
     * @param {string} [fabric.password] - The fabric password 
     * @param {Object} opts - Additional options
     * @param {string} opts.domainUser - The domain user
     * @param {string} opts.domainPrivateKey - The domain private key
     * @param {string} opts.domainPublicKey - The domain public key
     * @return {Object} The added host metadata
     */
    async addFabric(fabric, opts) {
        this.log(`addFabric(${fabric.addr})`);

        if (!fabric.addr) throw new Error("Unable to add fabric: missing host address");
        if (!opts.domainUser) throw new Error("Unable to add fabric: missing domain user");
        if (!opts.domainPrivateKey) throw new Error("Unable to add fabric: missing domain private key");
        if (!opts.domainPublicKey) throw new Error("Unable to add fabric: missing domain public key");

        // 1. Add host, using "metal" driver
        let result = await this.drivers.metal.addHost(fabric, opts);

        // 2. Add fabric virtualization software
        //
        // - Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainPrivateKey: opts.domainPrivateKey,
                var_domainPublicKey: opts.domainPublicKey,
                var_domainUser: opts.domainUser,
                var_fabricAddr: fabric.addr
            }
        };

        // --- Execute Ansible -----
        result = await this.ansible.playbook("fabricadd", ansibleOpts);
        // -------------------------

        return result.result.fabric;

    }


    /**
     * Remove the specified fabric.
     * 
     * @param {Object} fabric - The fabric
     * @param {string} fabric.addr - The fabric address
     * @param {Object} opts - Additional options
     * @param {string} opts.domainUser - The domain user
     * @param {string} opts.domainPrivateKey - The domain private key
     */
    async removeFabric(fabric, opts) {
        this.log(`removeFabric(${fabric.addr}})`);

        // 1. Remove fabric
        //
        // - Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainUser: opts.domainUser,
                var_domainPrivateKey: opts.domainPrivateKey,
                var_fabricAddr: fabric.addr
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("fabricremove", ansibleOpts);
        // -------------------------

        // 2. Remove host
        result = await this.drivers.metal.removeHost(fabric, opts);


    }

    /**
     * Add a new virtual host to the specified fabric. 
     * 
     * @param {Object} fabric - The fabric
     * @param {string} fabric.addr - The fabric address     * 
     * @param {Object} vhost - The virtual host
     * @param {string} vhost.id - The virtual host id 
     * @param {string} [vhost.addr] - The virtual host address 
     * @param {string} [vhost.mem] - The required virtual host memory
     * @param {string} [vhost.cpu] - The required virtual host cpu
     * @param {string} [vhost.iface] - The iface the virtual host will be attached to
     * @param {Object} opts - Additional options
     * @param {string} opts.domainUser - The domain user
     * @param {string} opts.domainPrivateKey - The domain private key
     * @param {string} opts.domainPublicKey - The domain public key
     * @return {Object} The added host metadata {addr, ...}
     */
    async addVirtualHost(fabric, vhost, opts) {
        this.log(`addVirtualHost(${fabric.adddr},${vhost.id})`);

        if (!fabric.addr) throw new Error("Unable to add virtual host: missing fabric address");
        if (!vhost.id) throw new Error("Unable to add virtual host: missing id");
        if (!opts.domainUser) throw new Error("Unable to add virtual host: missing domain user");
        if (!opts.domainPrivateKey) throw new Error("Unable to add virtual host: missing domain private key");
        if (!opts.domainPublicKey) throw new Error("Unable to add virtual host: missing domain public key");

        // 1. Add virtual host
        //
        // Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainPrivateKey: opts.domainPrivateKey,
                var_domainPublicKey: opts.domainPublicKey,
                var_domainUser: opts.domainUser,
                var_fabricAddr: fabric.addr,
                var_vhostId: vhost.id,
                /*var_vhostMem: vhost.mem,
                var_vhostCpu: vhost.cpu,
                var_vhostIface: vhost.iface*/
            }
        };
        if (vhost.mem) ansibleOpts.vars.var_vhostMem = vhost.mem;
        if (vhost.cpu) ansibleOpts.vars.var_vhostCpu = vhost.cpu;
        if (vhost.iface) ansibleOpts.vars.var_vhostIface = vhost.iface;
        if (vhost.addr) ansibleOpts.vars.var_vhostAddr = vhost.addr;

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("vhostadd", ansibleOpts);
        // -------------------------

        // Obtain vhost addr
        vhost.addr = result.result.fabric.addr;
        vhost.privateKey = result.result.fabric.privateKey;

        // 2. Configure new virtual host using "metal" driver 
        result = await this.drivers.metal.addHost(
            { 
                addr: vhost.addr, 
                user: "vagrant", 
                privateKey: vhost.privateKey
            },
            opts
        )

        return result.result.fabric;
    }

    /**
     * Remove virtual host from the specified fabric.
     * 
     * @param {Object} fabric - The fabric
     * @param {string} fabric.addr - The fabric address
     * @param {Object} vhost - The virtual host
     * @param {string} vhost.id - The virtual host id
     * @param {Object} opts - Additional options
     * @param {string} opts.domainUser - The domain user
     * @param {string} opts.domainPrivateKey - The domain private key
     */
    async removeVirtualHost(fabric, vhost, opts) {
        this.log(`removeVirtualHost(${fabric.addr},${JSON.stringify(vhost)})`);

        if (!fabric.addr) throw new Error("Unable to remove virtual host: missing fabric address");
        if (!vhost.id) throw new Error("Unable to remove virtual host: missing virtual host id");
        if (!opts.domainUser) throw new Error("Unable to remove virtual host: missing domain user");
        if (!opts.domainPrivateKey) throw new Error("Unable to remove virtual host: missing domain private key");

        // Prepare Ansible options
        let ansibleOpts = {
            vars: {
                var_workingDir: path.join(process.cwd(), this.utils.constants.DOMAIN_WORKINGDIR),
                var_domainPrivateKey: opts.domainPrivateKey,
                var_domainUser: opts.domainUser,
                var_fabricAddr: fabric.addr,
                var_vhostId: vhost.id
            }
        };

        // --- Execute Ansible -----
        let result = await this.ansible.playbook("vhostremove", ansibleOpts);
        // -------------------------

    }

    /**
     * Obtain info about the host.
     * 
     * @param {Object} fabric - The fabric
     * @param 
     * @param {Object} host - The host
     * @param {Object} opts - Additional options
     */
    async getVirtualHostInfo(fabric, vhost, opts) {
        this.log(`get(${host.id}, ${host.id})`);
    }


}


module.exports = (drivers, utils) => {
    return new VagrantDriver(drivers, utils);
}