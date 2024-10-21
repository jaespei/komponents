const express = require("express");
const bodyParser = require("body-parser");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[DomainRouter] ${msg}`));

    var router = express.Router();

    // Mount JSON body parser
    router.use(bodyParser.json());


    // ------------------ domains ------------------

    router.get("/domains", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listDomains(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/domains/:domId", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.domId;

        try {
            let result = await app.services.domain.listDomains(query, {});
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

    router.post("/domains", async (req, res) => {

        let data = req.body;

        try {
            let result = await app.services.domain.addDomain(data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.put("/domains/:domId", async (req, res) => {

        let data = req.body;

        try {
            let result = await app.services.domain.updateDomain(req.params.domId, data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/domains/:domId", async (req, res) => {

        try {
            let result = await app.services.domain.removeDomain(req.params.domId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    // ------------------ resources ------------------

    router.get("/resources", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listResources(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/domains/:domId/resources", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.domain = req.params.domId;
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listResources(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/resources/:resId", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.resId;

        try {
            let result = await app.services.domain.listResources(query, {});
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

    router.post("/domains/:domId/resources", async (req, res) => {

        let data = req.body;

        try {
            let result = await app.services.domain.addResource(req.params.domId, data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/resources/:resId", async (req, res) => {

        try {
            let result = await app.services.domain.removeResource(req.params.resId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });


    // ------------------ collections ------------------

    router.get("/collections", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listCollections(query, opts);
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
            let result = await app.services.domain.listCollections(query, {});
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

    router.get("/domains/:domId/collections", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.domain = req.params.domId;
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listDomains(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.post("/domains/:domId/collections", async (req, res) => {

        let data = req.body;

        try {
            let col = await app.services.domain.addCollection(req.params.domId, data);
            res.send(col);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/collections/:colId", async (req, res) => {

        try {
            let result = await app.services.domain.removeCollection(req.params.colId);
            res.status(200).send(result);
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
            let result = await app.services.domain.listLinks(query, opts);
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
            let result = await app.services.domain.listLinks(query, {});
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


    router.post("/links", async (req, res) => {

        let data = req.body;

        try {
            let result = await app.services.domain.addLink(data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/links/:linkId", async (req, res) => {

        try {
            let result = await app.services.domain.removeLink(req.params.linkId);
            res.status(200).send(result);
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
            let result = await app.services.domain.listInstances(query, opts);
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
            let result = await app.services.domain.listInstances(query, {});
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

    router.get("/domains/:domId/instances", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.domain = req.params.domId;
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listInstances(query, opts);
            res.send(result);
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
            let result = await app.services.domain.listInstances(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.post("/collections/:colId/instances", async (req, res) => {

        let data = req.body;

        try {
            let inst = await app.services.domain.addInstance(req.params.colId, data);
            res.send(inst);
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
            let result = await app.services.domain.removeInstance(req.params.instId);
            res.status(200).send(result);
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