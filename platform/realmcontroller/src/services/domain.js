const axios = require("axios");
const _ = require("lodash");

/**
 * Domain Service.
 * 
 * This service is responsible for managing the user domains. 
 * To that end it implements a lightweight label-based
 * access control system and it forwards all granted operations 
 * to the DomainController.
 * 
 * @author Javier Esparza-Peidro <jesparza@description.upv.es>
 */
class DomainService {

    /**
     * Create Domain Service proxy.
     * 
     * @param {Object} services - The remainder services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     * @param {Object} opts - Additional options
     * @param {stirng} opts.host - The server host in format <addr>:<port>
     * @param {string} opts.addr - The server address
     * @param {number} opts.port - The server port
     */
    constructor(services, store, utils, opts) {
        if (!store) this._error("Unable to initialize DomainService: missing store");
        if (!services) this._error("Unable to initialize DomainService: missing services");
        if (!utils) this._error("Unable to initialize DomainService: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.opts = opts;
        this.opts.host = this.opts.host || `${this.opts.addr}:${this.opts.port}`;
        [this.opts.addr, this.opts.port] = this.opts.host.split(":");
        this.log = opts.log || utils.log || (msg => console.log(`[DomainService] ${msg}`));
    }

    // ------------------ domains ------------------

    /**
     * Add a new domain.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type
     * @return {string} The started transaction id
     */
    async addDomain(issuer, domain) {
        this.log(`addDomain(${issuer.id},${JSON.stringify(domain)})`);

        // Add permission
        domain.labels = (domain.labels || []).concat([
            `perm=0:o`,             // root is owner
            `perm=${issuer.id}:o`   // issuer is owner
        ]);

        // Forward op
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                domain
            );
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Update the specified domain.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} domainId - The domain id
     * @param {Object} data - The domain data
     */
     async updateDomain(issuer, domainId, data) {
        this.log(`updateDomain(${issuer.id},${domainId},${JSON.stringify(data)})`);

        // Check access
        let [domain] = await this.listDomains(
            issuer,
            {
                id: domainId,
                labels: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!domain) this._error(`Unable to update domain: access denied`);

        // Forward op
        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`,
                data
            );
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Remove the specified domain.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} domainId - The domain id
     */
    async removeDomain(issuer, domainId) {
        this.log(`removeDomain(${issuer.id},${domainId})`);

        // Check access
        let [domain] = await this.listDomains(
            issuer,
            {
                id: domainId,
                labels: { $any: this.utils.perms.owner(issuer) }
            }
        );
        if (!domain) this._error(`Unable to remove domain: access denied`);

        // Forward op
        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`);
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * List the specified domains.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listDomains(issuer, query, opts) {
        this.log(`listDomains(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list domains: missing issuer`);

        query = query || {};
        query.labels = query.labels || {};
        query.labels.$any = (query.labels.$any || []).concat(this.utils.perms.read(issuer));

        // Forward op
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            );
            _.each(result, domain => {
                let perms = _.filter(domain.labels, label => label.startsWith("perm="));
                domain.perms = _.map(perms, perm => {
                    let [name, value] = perm.split("=");
                    let [id, right] = value.split(":");
                    return {role: id, type: right == "r"? "read": right == "w" && "write" || "owner"};
                });
            });
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    // ------------------ resources ------------------


    /**
     * Add a new resource to the specified domain.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} domainId - The domain
     * @param {Object} resource - The resource data
     */
    async addResource(issuer, domainId, resource) {
        this.log(`addResource(${issuer.id},${domainId}, ${JSON.stringify(resource)})`);

        // Check access
        let query = {
            id: domainId,
            labels: { $any: this.utils.perms.write(issuer) }
        };

        let domain;
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error("Unable to add resource: access denied");
            domain = result[0];
        } catch (err) {
            this._error(err);
        }

        // Forward op
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}/resources`,
                resource
            );
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }
    }



    /**
     * Remove the specified resource.
     * 
     * @param {Object} issuer - The issuer
     * @param {stirng} domainId - The domain id
     * @param {string} resourceId - The resource id
     */
    async removeResource(issuer, domainId, resourceId) {
        this.log(`removeResource(${issuer.id},${domainId},${resourceId})`);

        // Check access
        let query = {
            id: domainId,
            labels: { $any: this.utils.perms.write(issuer) }
        };

        let domain;
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error("Unable to remove resource: access denied");
            domain = result[0];
        } catch (err) {
            this._error(err);
        }

        // Forward op
        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/resources/${resourceId}`);
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified resources of the specified domain.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} domainId - The domain id
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listResources(issuer, domainId, query, opts) {
        this.log(`listResources(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        // Check access
        let [domain] = await this.listDomains(issuer, { id: domainId });
        if (!domain) this._error(`Unable to list resources: access denied`);

        query = query || {};
        query.domain = domainId;

        // Forward op
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/resources`,
                {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    // ------------------ permissions ------------------
    /**
     * Add the specified permission to the domain.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} domainId- The domain id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addDomainPerm(issuer, domainId, perm) {
        this.log(`addPerm(${issuer.id},${domainId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to add permission: missing issuer`);
        if (!domainId) this._error(`Unable to add permission: missing domain id`);
        if (!perm) this._error(`Unable to add permission: missing permission`);
        if (!perm.role) this._error(`Unable to add permission: missing permission role`);
        if (!perm.type) this._error(`Unable to add permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to add permission: unsupported permission type ${perm.type}`);

        // Check access
        let domain, query = {
            id: domainId,
            labels: { $any: this.utils.perms.write(issuer) }
        };
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error("Unable to add permission: access denied");
            domain = result[0];
        } catch (err) {
            this._error(err);
        }

        let labels = (domain.labels || []).concat(`perm=${perm.role}:${perm.type.charAt(0)}`);

        // Forward op
        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`,
                { labels: labels }
            );
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified permission from the domain.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} domainId- The domain id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeDomainPerm(issuer, domainId, perm) {
        this.log(`removePerm(${issuer.id},${domainId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to remove permission: missing issuer`);
        if (!domainId) this._error(`Unable to remove permission: missing domain id`);
        if (!perm) this._error(`Unable to remove permission: missing permission`);
        if (!perm.role) this._error(`Unable to remove permission: missing permission role`);
        if (!perm.type) this._error(`Unable to remove permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to remove permission: unsupported permission type ${perm.type}`);

        // Check access
        let domain, query = {
            id: domainId,
            labels: { $any: this.utils.perms.write(issuer) }
        };
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error("Unable to remove permission: access denied");
            domain = result[0];
        } catch (err) {
            this._error(err);
        }

        let labels = _.filter(
            domain.labels || [],
            label => {
                let [name, value] = label.split("=");
                if (name != "perm") return true;
                let [role, right] = value.split(":");
                if (role == perm.role && right == perm.type.charAt(0)) return false;
                return true;
            }
        );

        // Forward op
        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`,
                { labels: labels }
            );
            return `domain:${result}`;
        } catch (err) {
            this._error(err);
        }

    }


    _error(err) {
        this.log(`ERROR: ${err.message}, ${err.stack}`);
        if (_.isString(err)) {
            let err0 = new Error(err);
            err0.type = "DomainError";
            throw err0;
        } else if (err.response) {
            let err0 = new Error();
            err0.type = err.response.data && err.response.data.type || "DomainError";
            err0.message = err.response.data && err.response.data.message || err.message;
            err0.cause = err;
            err0.stack = err.response.data && err.response.data.stack || err.stack;
            throw err0;
        } else {
            throw err;
        }

    }

}

module.exports = (services, store, utils, opts) => {
    let _opts = Object.assign({}, opts || {});
    _opts.addr = opts.domainAddr || opts.addr;
    _opts.port = opts.domainPort || opts.port;
    if (!_opts.addr) _opts.host = process.env.DOMAIN_HOST || "127.0.0.1:10000";
    else _opts.host = `${_opts.addr}:${_opts.port}`;
    return new DomainService(services, store, utils, _opts);
}