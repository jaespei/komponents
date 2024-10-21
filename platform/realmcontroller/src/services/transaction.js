const Q = require("q");
const _ = require("lodash");
const axios = require("axios");

Q.longStackSupport = true;

Q.waitAll = function(promises) {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then(function(snapshots) {
        _.forEach(snapshots, function(snapshot) {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};

/**
 * Transactions Proxy Service.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class TransactionService {

    /**
     * Initializes the service. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {string} opts.componentHost - The server host in format <addr>:<port>
     * @param {string} opts.componentAddr - The server address
     * @param {number} opts.componentPort - The server port
     * @param {string} opts.domainHost - The server host in format <addr>:<port>
     * @param {string} opts.domainAddr - The server address
     * @param {number} opts.domainPort - The server port
     */
    constructor(opts) {
        this.opts = opts;
        this.opts.domainHost = this.opts.domainHost || `${this.opts.domainAddr}:${this.opts.domainPort}`;
        [this.opts.domainAddr, this.opts.domainPort] = this.opts.domainHost.split(":");
        this.opts.componentHost = this.opts.componentHost || `${this.opts.componentAddr}:${this.opts.componentPort}`;
        [this.opts.componentAddr, this.opts.componentPort] = this.opts.componentHost.split(":");
        this.log = opts.log || ((msg) => console.log("[TransactionService] " + msg));
    }

    /**
     * List the specified transactions.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     *
    async listTransactions(issuer, query, opts) {
        this.log(`listTransactions(${issuer.id},${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        query = query || {};
        opts = opts || {};
        let promises = [];
        try {
            // Obtain transactions from both controllers
            promises.push(axios.get(
                `http://${this.opts.componentAddr}:${this.opts.componentPort}/transactions`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            ));
            promises.push(axios.get(
                `http://${this.opts.domainAddr}:${this.opts.domainAddr}/transactions`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            ));
            let result = _.reduce(
                await Q.waitAll(promises),
                (accum, result) => {
                    return accum.concat(result);
                }, []
            );
            // Organize results
            if (opts.orderBy) {
                result = _.sortBy(result, elem => elem[opts.orderBy.slice(1)]);
                if (opts.orderBy.charAt(0) == "-") result = _.reverse
            }
            if (opts.offset) {

            }
            if (opts.limit) {

            }

        } catch (err) {
            this._error(err);
        }
    }*/

    /**
     * Find the specified transaction.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} txId - The transaction id
     * @return {Array<Object>} The query results
     */
    async findTransactionById(issuer, txId) {
        this.log(`findTransactionById(${issuer.id},${txId})`);

        let [source, id] = txId.split(":");
        try {

            if (source == "domain") {
                let { data: result } = await axios.get(
                    `http://${this.opts.domainAddr}:${this.opts.domainPort}/transactions/${id}`
                );
                return result;

            } else if (source == "component") {
                let { data: result } = await axios.get(
                    `http://${this.opts.componentAddr}:${this.opts.componentPort}/transactions/${id}`
                );
                return result;
            }

        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified transaction.
     * 
     * @param {string|Array<string>} ids - The id/s
     * @return {Array<Object>} The query results
     */
    async listTransactionsById(ids) {
        this.log(`listTransactionsById(${JSON.stringify(ids)})`);

        ids = _.isString(ids) ? [ids] : ids;

        let compIds = [],
            domIds = [];
        _.each(ids, id => {
            let [source, tx] = id.split(":");
            if (source == "component") compIds.push(tx);
            else if (source == "domain") domainIds.push(tx);
        });

        try {
            let promises = [];
            if (compIds.length) {
                promises.push(
                    axios.get(
                        `http://${this.opts.componentAddr}:${this.opts.componentPort}/transactions`, {
                            params: {
                                query: JSON.stringify({ id: { $in: compIds } })
                            }
                        }
                    ).then(res => {
                        return _.map(res.data, tx => { tx.id = `component:${tx.id}`; return tx; })
                    })
                );
            }
            if (domIds.length) {
                promises.push(
                    axios.get(
                        `http://${this.opts.domainAddr}:${this.opts.domainAddr}/transactions`, {
                            params: {
                                query: JSON.stringify({ id: { $in: compIds } })
                            }
                        }
                    ).then(res => {
                        return _.map(res.data, tx => { tx.id = `domain:${tx.id}`; return tx; })
                    })
                );
            }
            let results = await Q.waitAll(promises);
            return _.reduce(results, (accum, result) => accum.concat(result), []);

        } catch (err) {
            this._error(err);
        }
    }

    _error(err) {
        this.log(`ERROR: ${err.message}, ${err.stack}`);
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


module.exports = (services, store, utils, opts) => {
    let _opts = Object.assign({}, opts || {});
    if (!_opts.domainAddr) _opts.domainHost = process.env.DOMAIN_HOST || "127.0.0.1:10000";
    if (!_opts.componentAddr) _opts.componentHost = process.env.COMPONENT_HOST || "127.0.0.1:9000";
    return new TransactionService(_opts);
}