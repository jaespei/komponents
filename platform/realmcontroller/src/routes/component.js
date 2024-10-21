const express = require("express");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[ComponentRouter] ${msg}`));

    var router = express.Router();

    // ------------------ components ------------------

    router.get("/components", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.component.listComponents(issuer, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/components/:compId", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.compId;

        try {
            let result = await app.services.component.listComponents(issuer, query, {});
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

    router.post("/components", async(req, res) => {

        let issuer = res.locals.issuer;
        let data = req.body;

        try {
            let result = await app.services.component.addComponent(issuer, data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.put("/components/:compId", async(req, res) => {

        let issuer = res.locals.issuer;
        let compId = req.params.compId;
        let data = req.body;

        try {
            let result = await app.services.component.updateComponent(issuer, compId, data);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/components/:compId", async(req, res) => {

        let issuer = res.locals.issuer;
        let compId = req.params.compId;

        try {
            let result = await app.services.component.removeComponent(issuer, compId);
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

    router.post("/components/:compId/perms", async(req, res) => {

        let issuer = res.locals.issuer;
        let compId = req.params.compId;
        let perm = req.body

        try {
            await app.services.component.addComponentPerm(issuer, compId, perm);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/components/:compId/perms", async(req, res) => {

        let issuer = res.locals.issuer;
        let compId = req.params.compId;
        let perm = req.body;

        try {
            await app.services.component.removeComponentPerm(issuer, compId, perm);
            res.send();
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