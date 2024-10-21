const axios = require("axios");

class DomainControllerAPI {

    /**
     * Create Domain Controller API proxy.
     * 
     * @param {Object} opts - Additional options
     * @param {stirng} opts.host - The server host in format <addr>:<port>
     * @param {string} opts.addr - The server address
     * @param {number} opts.port - The server port
     */
    constructor(opts) {
        this.opts = opts;
        this.opts.host = this.opts.host || `${this.opts.addr}:${this.opts.port}`;
        [this.opts.addr, this.opts.port] = this.opts.host.split(":");
        this.log = opts.log || (msg => console.log(`[DomainControllerAPI] ${msg}`));
    }

    // ------------------ domains ------------------

    /**
     * Add a new domain.
     * 
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type
     * @return {string} The started transaction id
     */
    async addDomain(domain) {
        this.log(`addDomain(${JSON.stringify(domain)})`);
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                domain
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified domain.
     * 
     * @param {string} domainId - The domain id
     */
    async removeDomain(domainId) {
        this.log(`removeDomain(${domainId})`);
        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`);
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * List the specified domains.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listDomains(query, opts) {
        this.log(`listDomains(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);
        try {
            let { data:result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
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


    // ------------------ resources ------------------


    /**
     * Add a new resource to the specified domain.
     * 
     * @param {stirng} domainId - The domain
     * @param {Object} resource - The resource data
     * @param {stirng} resource.type - The resource type
     */
    async addResource(domainId, resource) {
        this.log(`addResource(${domainId}, ${JSON.stringify(resource)})`);
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`,
                resource
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }



    /**
     * Remove the specified resource.
     * 
     * @param {string} resourceId - The resource id
     */
    async removeResource(resourceId) {
        this.log(`removeResource(${resourceId})`);
        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/resources/${resourceId}`);
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified resources.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listResources(query, opts) {
        this.log(`listResources(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);
        try {
            let { data:result } = await axios.get(
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

    // ------------------ collections ------------------

    /**
     * Add new collection to the domain.
     * 
     * @param {string} domainId - The domain
     * @param {Object} collection - The collection
     * @param {Array<string>} [collection.labels] - The collection labels
     * @param {boolean} [collection.proxy] - Proxied collection?
     * @param {boolean|string} [collection.proxyAddr] - Reverse proxy address, if any
     * @param {Object} [collection.inputs] - Dictionary with collection inputs {name: protocol}
     * @param {Object} [collection.outputs] - Dictionary with collection outputs {name: protocol}
     * @param {Object} ctxt - The operation context
     * @return {Object} The added collection
     */
    async addCollection(domainId, collection) {
        this.log(`addCollection(${domainId},${JSON.stringify(collection)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}/collections`,
                collection
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified collections and all its members.
     * 
     * @param {string} collectionId - The collection
     */
    async removeCollection(collectionId) {
        this.log(`removeCollection(${collectionId})`);

        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/collections/${collectionId}`);
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified collections.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listCollections(query, opts) {
        this.log(`listCollections(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data:result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/collections`,
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


    // ------------------ links ------------------

    /**
     * Add new link between two collections.
     * 
     * @param {Object} link - The link info
     * @param {string} [link.name] - The link name
     * @param {Array<string>} [link.labels] - The link labels
     * @param {string|Object} link.src - The link source
     * @param {string} link.src.collection - The source collection
     * @param {string} link.src.name - The source endpoint name
     * @param {string|Object} link.dst - The link destination
     * @param {string} link.dst.colllection - The destination collection
     * @param {string} link.dst.name - The destination endpoint name
     */
    async addLink(link) {
        this.log(`addLink(${JSON.stringify(link)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/links`,
                link
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Remove the specified link.
     * 
     * @param {string} linkId - The link
     */
    async removeLink(linkId) {
        this.log(`removeLink(${linkId})`);

        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/links/${linkId}`);
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * List the specified links.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listLinks(query, opts) {
        this.log(`listLinks(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data:result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/links`,
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

    // ------------------ instances ------------------

    /**
     * Add new instance to the collection.
     * 
     * @param {string} collectionId - The collection
     * @param {Object} instance - The instance
     * @param {Array<string>} [instance.labels] - The instance labels
     * @param {string} [instance.addr] - The instance address
     * @param {boolean} [instance.proxy] - Is proxy?
     * @param {string} [instance.proxyTarget] - The proxy target id or route
     * @param {string} [instance.source] - The instance source
     * @param {string} [instance.runtime] - The instance runtime
     * @param {string} [instance.durability] - The instance durability
     * @param {Object} [instance.events] - The instance event handlers
     */
    async addInstance(collectionId, instance) {
        this.log(`addInstance(${collectionId},${JSON.stringify(instance)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/collections/${collectionId}/instances`,
                instance
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified instance.
     * 
     * @param {string} instanceId - The instance
     */
    async removeInstance(instanceId) {
        this.log(`removeInstance(${instanceId})`);

        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/instances/${instanceId}`);
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified instances.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listInstances(query, opts) {
        this.log(`listInstances(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data:result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`,
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

    // ------------------ transactions ------------------
    /**
     * List the specified transactions.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listTransactions(query, opts) {
        this.log(`listTransactions(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data:result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/transactions`,
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



    _error(err) {
        if (err.response) {
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

module.exports = (opts) => {
    return new DomainControllerAPI(opts);
}