const axios = require("axios");
const _ = require("lodash");
const { URL } = require("url");
const Q = require("q");

/**
 * Store Proxy driver.
 * 
 * This driver forwards all the operations to a remote server.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

class ProxyDriver {

    /**
     * Creates a new store.
     *
     * @constructor
     * @classdesc Store backed by SQLite engine
     * @param {Object} cfg - Store configuration
     * @param {string} cfg.url - The store location
     * @param {Object} [cfg.schema] - The store schema
     * @param {string} [cfg.schema.version] - The schema version
     * @param {Object} [cfg.schema.collections] - Dictionary containing all collections in the store {<col-name>: <col-spec>}
     */
    constructor(cfg) {
        this.cfg = cfg;
        this.log = cfg.log || (msg => console.log(`[ProxyDriver] ${msg}`));
    }

    /**
     * Initialize the store.
     * 
     * @param {Function} [cb] 
     */
    async init(cb) {
        this.log(`init()`);
        let parsedUrl = new URL(this.cfg.url);

        // Compose URL
        this.url = `http://${parsedUrl.hostname}:${parsedUrl.port || 8080}/${parsedUrl.protocol.slice(0, -1)}${parsedUrl.pathname}`;

        // Create (open) database
        let response = await axios.post(this.url, this.cfg);
        return Q().nodeify(cb);
    }

    /**
     * Open the specified store.
     *
     * @param {Object} [cfg] - Store configuration
     * @param {string} cfg.url - The store location
     * @param {Object} [cfg.schema] - The store schema If not provided, the database is supposed to exist
     * @param {string} [cfg.schema.version] - The schema version
     * @param {Object.<string, Object>} cfg.schema.collections - Dictionary containing all collections in the store
     * @param {Function} [cb] - The operation callback
     */
    async open(cb) {
        this.log(`open()`);

        // Do nothing, the store does not need opening
        return Q().nodeify(cb);
    }



    /**
     * Close the store.
     *
     * @param {Function} cb - The operation callback
     */
    async close(cb) {
        this.log(`close()`);

        // Do nothing, the store does not need closing
        return Q().nodeify(cb);
    }



    /**
     * Insert the specified object.
     *
     * @param {string} colName - The collection name
     * @param {Object} data - The object to insert
     * @param {Function} cb - The operation callback
     */
    async insert(colName, data, cb) {
        this.log(`insert(${colName},${JSON.stringify(data)})`);

        // Forward op
        let response = await axios.post(`${this.url}/${colName}`, data);

        return Q().nodeify(cb);
    }

    /**
     * Search the specified data.
     *
     * @param {string} colName - The collection name
     * @param {Object|Array.<Object>} [query] - The query
     * @param {Object} [opts] - Query options
     * @param {string} [opts.orderBy] - Order results by field in format '[+|-]field' (e.g. '+name')
     * @param {string} [opts.limit] - Maximum number of results
     * @param {string} [opts.offset] - Discard initial results
     * @param {string} [opts.fields] - Comma-separated list of fields (fields prefixed by '-' are hidden)
     * @param {Function} cb - The operation callback. It returns the query results
     */
    async search(colName, query, opts, cb) {
        this.log(`search(${colName},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        // Forward op
        let response = await axios.get(
            `${this.url}/${colName}`, {
                params: {
                    query: JSON.stringify(query),
                    opts: JSON.stringify(opts)
                }
            }
        );
        return Q(response.data).nodeify(cb);
    }

    /**
     * Update the specified object with the specified data.
     *
     * @param {string} colName - The collection name
     * @param {Object} query - The query to select the objects to update
     * @param {Object} data - The data to update
     * @param {Object} [opts] - Optional parameters
     * @param {boolean} [opts.atomic] - Atomic update
     * @param {Function} cb - The operation callback
     */
    async update(colName, query, data, opts, cb) {
        this.log(`update(${colName},${JSON.stringify(query)},${JSON.stringify(data)},${JSON.stringify(opts)})`);

        // Forward op
        let response = await axios.put(
            `${this.url}/${colName}`, {
                query: query,
                data: data,
                opts: opts
            }
        );
        return Q().nodeify(cb);
    }

    /**
     * Delete the specified object from the datastore.
     *
     * @param {string} colName - The collection name
     * @param {string} query - The query to select the objects to delete
     * @param {Function} cb - The operation callback
     */
    async delete(colName, query, cb) {
        this.log(`delete(${colName},${JSON.stringify(query)})`);

        // Forward op
        let response = await axios.delete(
            `${this.url}/${colName}`, {
                query: query
            }
        );
        return Q().nodeify(cb);
    }



    /**
     * Destroy the store.
     *
     * @param {Function} cb - The operation callback
     */
    async drop() {

    }

    /**
     * Create a backup of the store.
     * 
     * @param {Function} cb - The operation callback. It returns the backup in JSON format
     */
    async backup() {

    }

    /**
     * Restore the specified bckup.
     * 
     * @param {string} backup - The backup in JSON format
     * @param {Function} cb - The operation callback
     */
    async restore(backup) {

    }
}

module.exports = async(url, opts, cb) => {
    if (_.isFunction(opts)) {
        cb = opts;
        opts = undefined;
    }
    opts = opts || {};
    opts.url = url;

    // Create store
    let st = new ProxyDriver(opts);

    // Initialize store
    await st.init();

    return Q(st).nodeify(cb);
}