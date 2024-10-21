/**
 * Transactions Service.
 * 
 * Long-term operations are modeled as transactions. Every transaction has
 * a unique identifier and remains at a particula state ('started', 
 * 'committed', 'aborted'). 
 * 
 * A transaction may go through multiple phases until it is finally
 * completed.
 * 
 * After each relevant change of state, an event is triggered.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class TransactionService {

    /**
     * Initializes the service. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} store - The store.
     * @param {Object} [utils] - Additional utilities
     */
    constructor(services, store, utils) {
        this.store = store;
        this.utils = utils;
        this.services = services;
        this.log = utils && utils.log || ((msg) => console.log("[TransactionService] " + msg));
    }

    /**
     * Add a new transaction.
     * 
     * @param {Object} tx - The transaction data
     */
    async startTransaction(tx) {
        this.log(`startTransaction(${JSON.stringify(tx)})`);

        // Check constraints
        if (!tx.type) throw new Error("Unable to start transaction: missing transaction type");

        // Generate UUID
        tx.id = this.utils.uuid();

        // Register timestamps
        tx.ini = tx.last = Date.now();

        // Initialize state
        tx.state = this.utils.constants.TRANSACTION_STATE_STARTED;

        // Insert transaction
        await this.store.insert("transactions", tx);

        /* Trigger event
        this.services.event.emit(
            `${this.utils.constants.EVENT_TRANSACTION_START}:${tx.type}`, {
            txId: tx.id
        });*/

        return tx;
    }

    /**
     * Update the specified transaction.
     * 
     * @param {string} txId - The transaction identifier
     * @param {Object} data - The transaction data
     */
    async updateTransaction(txId, data) {
        this.log(`updateTransaction(${txId}, ${JSON.stringify(data)})`);

        let tx/*, lock = this.utils.uuid()*/;
        try {
            // Get transaction, set lock and check constraints            
            [tx] = await this.store.search("transactions", { id: txId }/*, { lock: lock }*/);
            if (!tx) throw new Error(`Unable to update transaction: transaction ${txId} not found`);
            if (
                [this.utils.constants.TRANSACTION_STATE_COMPLETED,
                this.utils.constants.TRANSACTION_STATE_ABORTED].includes(tx.state))
                throw new Error(`Unable to update transaction: illegal transaction state ${tx.state}`);

            // Update data (release lock)
            await this.store.update("transactions",
                { id: txId },
                { data: JSON.stringify(data), last: Date.now() }/*,
                { unlock: lock }*/
            );

            /* Trigger event
            this.services.event.emit(
                `${this.utils.constants.EVENT_TRANSACTION_UPDATE}:${tx.type}`,
                { txId: txId }
            );*/

        } catch (err) {
            // release lock
            if (tx) await this.store.search("transactions", { id: txId }/*, { unlock: lock }*/);
            throw err;
        }
    }

    /**
     * Complete the specified transaction.
     * 
     * @param {string} txId - The transaction identifier
     * @param {Object} data - Additional data
     */
    async completeTransaction(txId, data) {
        this.log(`completeTransaction(${txId})`);

        data = data || {};
        let tx/*, lock = this.utils.uuid()*/;
        try {
            // Get transaction and check constraints
            [tx] = await this.store.search("transactions", { id: txId }/*, { lock: lock }*/);
            if (!tx) throw new Error(`Unable to update transaction: transaction ${txId} not found`);
            if (
                [this.utils.constants.TRANSACTION_STATE_COMPLETED,
                this.utils.constants.TRANSACTION_STATE_ABORTED].includes(tx.state))
                throw new Error(`Unable to complete transaction: illegal transaction state ${tx.state}`);
            
            data.state = this.utils.constants.TRANSACTION_STATE_COMPLETED;
            data.last = Date.now();

            // Update state (release lock)
            await this.store.update("transactions",
                { id: txId },
                data/*,
                { unlock: lock }*/
            );

            /* Trigger event
            this.services.event.emit(
                `${this.utils.constants.EVENT_TRANSACTION_COMPLETE}:${tx.type}`,
                { txId: txId }
            );*/

        } catch (err) {
            // release lock
            if (tx) await this.store.search("transactions", { id: txId }/*, { unlock: lock }*/);
            throw err;
        }
    }


    /**
     * Abort the specified transaction.
     * 
     * @param {string} txId 
     * @param {Object} err - The error cause, if any
     */
    async abortTransaction(txId, err) {
        this.log(`abortTransaction(${txId})`);

        let tx/*, lock = this.utils.uuid()*/;
        try {
            // Get transaction and check constraints
            [tx] = await this.store.search("transactions", { id: txId });
            if (!tx) throw new Error(`Unable to abort transaction: transaction ${txId} not found`);
            if (
                [this.utils.constants.TRANSACTION_STATE_COMPLETED,
                this.utils.constants.TRANSACTION_STATE_ABORTED].includes(tx.state))
                throw new Error(`Unable to complete transaction: illegal transaction state ${tx.state}`);

            // Update state
            await this.store.update("transactions",
                { id: txId },
                {
                    state: this.utils.constants.TRANSACTION_STATE_ABORTED,
                    err: err ? JSON.stringify( { type: err.type, message: err.message, stack: err.stack} ) : "",
                    last: Date.now()
                }
            );

            /* Trigger event
            this.services.event.emit(
                `${this.utils.constants.EVENT_TRANSACTION_ABORT}:${tx.type}`,
                { txId: txId }
            );*/

        } catch (err) {
            // release lock
            if (tx) await this.store.search("transactions", { id: txId }/*, { unlock: lock }*/);
            throw err;
        }
    }

    /**
     * List transactions.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional query options
     * @return {Object} - The results {next, results}
     */
    async listTransactions(query, opts) {
        this.log(`listTransactions(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);
        let result = await this.store.search("transactions", query, opts);
        return result;
    }

    /**
     * Purge completed transactions, optionally included in the specified range.
     * 
     * @param {number} [ini] - The initial limit
     * @param {number} [end] - The end limit
     */
    async purgeTransactions(ini, end) {
        this.log(`purgeTransactions(${ini}, ${end})`);

        let q = {
            state: {
                "$in": [
                    this.utils.constants.TRANSACTION_STATE_COMPLETED,
                    this.utils.constants.TRANSACTION_STATE_ABORTED
                ]
            }
        };
        if (ini) q.last = { "$gte": ini };
        if (end) q.last = { "$lt": end };

        await this.store.delete("transactions", q);
    }
}


module.exports = (...opts) => {
    return new TransactionService(...opts);
}