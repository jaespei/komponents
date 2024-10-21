const express = require("express");
const bodyParser = require("body-parser");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[ComponentRouter] ${msg}`));

    var router = express.Router();

    // Mount JSON body parser
    router.use(bodyParser.json());


    // ------------------ collections ------------------

    router.get("/collections", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.component.listCollections(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/collections/:colId", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.colId;

        try {
            let result = await app.services.component.listCollections(query, {});
            if (result.length) res.send(result[0]);
            else res.status(404).send();            
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });


    // ------------------ links ------------------

    router.get("/links", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.component.listLinks(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/links/:linkId", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.linkId;

        try {
            let result = await app.services.component.listLinks(query, {});
            if (result.length) res.send(result[0]);
            else res.status(404).send();            
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });



    // ------------------ instances ------------------

    router.get("/instances", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.component.listInstances(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/instances/:instId", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.instId;

        try {
            let result = await app.services.component.listInstances(query, {});
            if (result.length) res.send(result[0]);
            else res.status(404).send();            
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/collections/:colId/instances", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.collection = req.params.colId;
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.component.listInstances(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.post("/instances", async (req, res) => {

        let spec = req.body;

        try {
            let inst = await app.services.component.addInstance(spec);
            res.send(inst);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.put("/instances/:instId", async (req, res) => {

        let data = req.body;

        try {
            let result = await app.services.component.updateInstance(req.params.instId, data);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/instances/:instId", async (req, res) => {

        try {
            let result = await app.services.component.removeInstance(req.params.instId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    // ------------------ graphs ------------------

    router.get("/instances/:instId/graph", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.instId;

        try {
            let result = await app.services.component.listGraphs(query, {});
            if (result.length) res.send(result[0]);
            else res.status(404).send();            
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/graphs/:instId", async (req, res) => {

        let query = { id: req.params.instId };

        try {
            let result = await app.services.component.listGraphs(query, {});
            if (result.length) res.send(result[0]);
            else res.status(404).send();            
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/graphs", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.component.listGraphs(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });    


    return router;

}