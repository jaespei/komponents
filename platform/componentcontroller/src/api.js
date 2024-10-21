const axios = require("axios");

class ComponentControllerAPI {

    /**
     * Create Component Controller API proxy.
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
        this.log = opts.log || (msg => console.log(`[ComponentControllerAPI] ${msg}`));
    }

    // ------------------ collections ------------------

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
     * @param {Object} spec - The instance specification
     * @param {string} [spec.parent] - The instance parent
     * @param {string} [spec.subcomponent] - The subcomponent name
     * @param {string} [spec.connector] - The connector name
     * @param {Array<string>} [spec.labels] - The instance labels
     * @param {Object} [spec.deployment] - The instance deployment data
     * @param {Object} [spec.deployment.variables] - The instance variables
     * @param {Object} [spec.deployment.entrypoints] - The instance entrypoints
     * @param {Object} [spec.model] - The instance model
     */
    async addInstance(spec) {
        this.log(`addInstance(${JSON.stringify(spec)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/instances`,
                spec
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

    // ------------------ graphs ------------------
    /**
     * List the specified graphs.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
     async listGraphs(query, opts) {
        this.log(`listGraphs(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data:result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/graphs`,
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
    return new ComponentControllerAPI(opts);
}