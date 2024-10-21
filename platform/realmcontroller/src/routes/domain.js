const express = require("express");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[DomainRouter] ${msg}`));

    var router = express.Router();


    // ------------------ domains ------------------

    router.get("/domains", async (req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listDomains(issuer, query, opts);
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

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.domId;

        try {
            let result = await app.services.domain.listDomains(issuer, query, {});
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

        let issuer = res.locals.issuer;
        let data = req.body;

        try {
            let result = await app.services.domain.addDomain(issuer, data);
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

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let data = req.body;

        try {
            let result = await app.services.domain.updateDomain(issuer, domId, data);
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

        let issuer = res.locals.issuer;
        let domId = req.params.domId;

        try {
            let result = await app.services.domain.removeDomain(issuer, domId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    // ------------------ permissions ------------------

    router.post("/domains/:domId/perms", async (req, res) => {

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let perm = req.body

        try {
            await app.services.domain.addDomainPerm(issuer, domId, perm);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/domains/:domId/perms", async (req, res) => {

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let perm = req.body;

        try {
            await app.services.domain.removeDomainPerm(issuer, domId, perm);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });


    // ------------------ resources ------------------

    router.get("/domains/:domId/resources", async (req, res) => {

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.domain.listResources(issuer, domId, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/domains/:domId/resources/:resId", async (req, res) => {

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.resId;

        try {
            let result = await app.services.domain.listResources(issuer, domId, query, {});
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

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let data = req.body;

        try {
            let result = await app.services.domain.addResource(issuer, domId, data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/domains/:domId/resources/:resId", async (req, res) => {

        let issuer = res.locals.issuer;
        let domId = req.params.domId;
        let resId = req.params.resId;

        try {
            let result = await app.services.domain.removeResource(issuer, domId, resId);
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