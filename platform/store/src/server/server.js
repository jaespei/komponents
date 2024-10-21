const express = require("express");
const bodyParser = require("body-parser");


module.exports = (opts, store, utils) => {

    utils = utils || {};
    utils.log = utils.log || (msg => console.log(`[Server] ${msg}`));

    let server = express();

    server.use(bodyParser.json());

    server.use((req, res, next) => {
        utils.log(`${req.method} ${req.url} - params: ${JSON.stringify(req.params)} - body: ${JSON.stringify(req.body)}`);
        next();
    });

    /**
     * Open (or create) store.
     * 
     * @param {string} req.params.driver - The driver name
     * @param {string} req.params.db - The store name
     * @param {Object} [req.body] - The store cfg
     */
    server.post("/:driver/:db", async(req, res) => {
        let st, url = `${req.params.driver}:${req.params.db}`;
        try {
            st = await store(url, req.body);
            await st.open();
            res.status(204).end();
        } catch (err) {
            console.log(err.stack);
            res.status(400).send({ type: err.type, message: err.message, stack: err.stack });
        } finally {
            if (st) await st.close();
        }
    });

    /**
     * Search collection.
     * 
     * @param {string} req.params.driver - The driver name
     * @param {string} req.params.db - The store name
     * @param {string} req.params.collection - The collection name
     * @param {Object} [req.body] - Additional options
     * @param {Object} [req.body.query] - The query
     * @param {Object} [req.body.opts] - Query options
     */
    server.get("/:driver/:db/:collection", async(req, res) => {
        let url = `${req.params.driver}:${req.params.db}`;
        let query = req.query.query && JSON.parse(req.query.query);
        let opts = req.query.opts && JSON.parse(req.query.opts);
        let st;
        try {
            st = await store(url);
            await st.open();
            let result = await st.search(req.params.collection, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({ type: err.type, message: err.message, stack: err.stack });
        } finally {
            if (st) await st.close();
        }
    });

    /**
     * Insert object into collection.
     * 
     * @param {string} req.params.driver - The driver name
     * @param {string} req.params.db - The store name
     * @param {string} req.params.collection - The collection name
     * @param {Object} req.body - The data to insert
     */
    server.post("/:driver/:db/:collection", async(req, res) => {
        let st, url = `${req.params.driver}:${req.params.db}`;
        try {
            st = await store(url);
            await st.open();
            await st.insert(req.params.collection, req.body);
            res.status(204).end();
        } catch (err) {
            res.status(404).send({ type: err.type, message: err.message, stack: err.stack });
        } finally {
            if (st) await st.close();
        }
    });

    /**
     * Update object in collection.
     * 
     * @param {string} req.params.driver - The driver name
     * @param {string} req.params.db - The store name
     * @param {string} req.params.collection - The collection name
     * @param {Object} req.body - Update info
     * @param {Object} req.body.query - The update query
     * @param {Object} req.body.data - The data to update
     * @param {Object} req.body.opts - Additional update options
     */
    server.put("/:driver/:db/:collection", async(req, res) => {
        let url = `${req.params.driver}:${req.params.db}`;
        let query = req.body && req.body.query;
        let data = req.body && req.body.data;
        let opts = req.body && req.body.opts;
        let st;
        try {
            st = await store(url);
            await st.open();
            await st.update(req.params.collection, query, data, opts);
            res.status(204).end();
        } catch (err) {
            res.status(404).send({ type: err.type, message: err.message, stack: err.stack });
        } finally {
            if (st) await st.close();
        }
    });

    /**
     * Delete object in collection.
     * 
     * @param {string} req.params.driver - The driver name
     * @param {string} req.params.db - The store name
     * @param {string} req.params.collection - The collection name
     * @param {Object} req.body - Delete info
     * @param {Object} req.body.query - The delete query
     * @param {Object} req.body.opts - Additional delete options
     */
    server.delete("/:driver/:db/:collection", async(req, res) => {
        let url = `${req.params.driver}:${req.params.db}`;
        let query = req.body && req.body.query;
        let opts = req.body && req.body.opts;
        let st;
        try {
            st = await store(url);
            await st.open();
            await st.delete(req.params.collection, query, opts);
            res.status(204).end();
        } catch (err) {
            res.status(404).send({ type: err.type, message: err.message, stack: err.stack });
        } finally {
            if (st) await st.close();
        }
    });

    return {
        start: () => {
            utils.log(`start()`);
            server.listen(opts.port, opts.addr);
        },
        stop: () => {
            utils.log(`stop()`);
        }
    };
};