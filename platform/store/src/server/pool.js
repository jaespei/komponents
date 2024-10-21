const Q = require("q");
const utils = require("utils");

/**
 * Pool of connections.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class ConnectionPool {

    /**
     * Initialize the pool.
     * 
     * @param {Object} opts - The pool config options
     * @param {number} [opts.ttl] - Connection max ttl
     * @param {number} [opts.ttlSession] - Session max ttl
     * @param {Object} store - The store factory
     */
    constructor(opts, store) {
        console.log(`[ConnectionPool] constructor(${JSON.stringify(opts)})`);
        this.opts = opts || {};
        this.opts.cfg = this.opts.cfg || {};
        this.store = store;
        this.connections = {}; // connections by url
        this.log = (msg) => console.log(`[ConnectionPool] ${msg}`);
    }

    /**
     * Request new connection.
     * 
     * @param {string} url - The store URL 
     * @param {Object} opts - The connection options
     * @return {Object} The connection
     */
    async request(url, opts) {
        this.log(`request(${url}, ${JSON.stringify(opts)})`);

        let queue = this.connections[url];
        if (queue) {

            // Look for expired connections
            if (this.opts.ttlSession || this.opts.ttl) {
                let expiredCons = queue.filter(con =>
                    (Date.now() - con.sessionTs >= this.opts.ttlSession) ||
                    (Date.now() - con.ts >= this.opts.ttl)
                );
                expiredCons.forEach(
                    expiredCon => {
                        // Close connection
                        con.store.close();
                        let index = queue.findIndex(
                            con => con.id == expiredCon.id
                        );
                        // Remove connection from queue
                        queue.splice(index, 1);
                    }
                );

            }

            // Look for ready connection
            let readyCons = queue.filter(q => q.state == "ready");
            if (readyCons.length > 0) {
                // Ready connection found; select one randomly
                let randomIndex = Math.trunc(readyCons.length * Math.random());
                readyCons[randomIndex].state = "busy";
                readyCons[randomIndex].sessionTs = Date.now();
                return readyCons[randomIndex];
            } else {

                // No ready connections; get connection cfg
                let cfg = this.getCfg(url);
                if (queue.length < cfg.max) {
                    // Create new connection
                    let newCon = await this.newConnection(url, opts);
                    newCon.state = "busy";
                    newCon.sessionTs = Date.now();
                    return newCon;
                } else {
                    // Wait for connection
                    let deferred = Q.defer();
                    queue.deferreds.push(deferred);
                    return deferred.promise;
                }
            }

        } else {

            // No connections; create one
            this.connections[url] = [];
            this.connections[url].deferreds = [];
            let newCon = await this.newConnection(url);
            newCon.state = "busy";
            newCon.sessionTs = Date.now();
            return newCon;

        }
    }

    /**
     * Create new connection.
     * 
     * @param {string} url - The connection URL
     * @param {Object} opts - The connection options
     * @return {Object} The created connection 
     */
    async newConnection(url, opts) {
        this.log(`newConnection(${url})`);

        let con = {
            id: utils.uuid(),
            url: url,
            ts: Date.now(),
            state: "opening"
        };

        // Append new connection (in "opening" state)
        this.connections[url].push(con);

        // Open store
        try {
            con.store = await this.store(url, opts);
            await con.store.open();
            con.state = "ready";
            return con;
        } catch (err) {
            // if error remove entry from queue
            let index = this.connections[url].findIndex(c => c.id == con.id);
            this.connections[url].splice(index, 1);
            throw err;
        }
    }

    /**
     * Release connection.
     * 
     * @param {Object} con - The connection
     */
    async release(con) {
        this.log(`release(${con.url})`);

        // Mark connection as "ready"
        con.state = "ready";

        // Get queue
        let queue = this.connections[con.url];

        // If waiting clients, then take first and 
        // awake
        if (queue.deferreds.length) {
            let deferred = queue.deferreds.shift();
            deferred.resolve(con);
        }
    }

    /**
     * Returns the configuration for the specified database URL.
     * 
     * @param {string} url - The database URL
     * @return {Object} The database configuration 
     */
    getCfg(url) {

        // Look for matching url
        for (let pattern in this.opts.cfg) {
            let re = new RegExp(pattern);
            if (re.test(url)) return this.opts.cfg[pattern];
        }

        // Default cfg for every store
        return {
            max: 1,
            ttl: 1800000,
            ttlSession: 1800000
        }
    }


}

/**
 * Connection wrapper.
 */
class ConnectionWrapper {

    constructor(url, opts, pool) {
        console.log(`[ConnectionWrapper] constructor(${url})`);
        this.url = url;
        this.opts = opts;
        this.pool = pool;
        this.log = (msg) => console.log(`[ConnectionWrapper] ${msg}`);
    }

    async open(cb) {
        this.log(`open()`);

        if (this.con) throw new Error("The connection is already open");

        // Request connection
        this.con = await this.pool.request(this.url, this.opts);
        return Q().nodeify(cb);

    }

    async search(col, query, opts, cb) {
        this.log(`search(${col}, ${JSON.stringify(query)}, ${JSON.stringify(opts)})`);
        if (!this.con) throw new Error("The connection is not open");
        let ret = await this.con.store.search(col, query, opts, cb);
        return Q(ret).nodeify(cb);
    }

    async insert(col, data, cb) {
        this.log(`insert(${col}, ${JSON.stringify(data)})`);
        if (!this.con) throw new Error("The connection is not open");
        let ret = await this.con.store.insert(col, data, cb);
        return Q(ret).nodeify(cb);
    }

    async update(col, query, data, cb) {
        this.log(`update(${col}, ${JSON.stringify(query)}, ${JSON.stringify(data)})`);
        if (!this.con) throw new Error("The connection is not open");
        let ret = await this.con.store.update(col, query, data, cb);
        return Q(ret).nodeify(cb);
    }

    async delete(col, query, cb) {
        this.log(`delete(${col}, ${JSON.stringify(query)})`);
        if (!this.con) throw new Error("The connection is not open");
        await this.con.store.delete(col, query, cb);
        return Q().nodeify(cb);
    }

    async close(cb) {
        this.log(`close()`);
        if (!this.con) throw new Error("The connection is not open");
        await this.pool.release(this.con);
        delete this.con;
        return Q().nodeify(cb);
    }

}


module.exports = (opts, store) => {

    let pool = new ConnectionPool(opts, store);

    let storeWrapper = async(url, opts, cb) => {
        return new ConnectionWrapper(url, opts, pool);
    };
    storeWrapper.pool = pool;

    return storeWrapper;
}