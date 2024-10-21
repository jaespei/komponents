const express = require("express");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[DeploymentRouter] ${msg}`));

    var router = express.Router();

    // ------------------ deployments ------------------

    router.get("/deployments", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.deployment.listDeployments(issuer, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/deployments/:instId", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.instId;

        try {
            let result = await app.services.deployment.listDeployments(issuer, query, {});
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

    router.post("/deployments", async(req, res) => {

        let issuer = res.locals.issuer;
        let componentId = req.body.componentId;
        let deployment = req.body.deployment;

        try {
            let result = await app.services.deployment.addDeployment(issuer, componentId, deployment);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/deployments/:instId", async(req, res) => {

        let issuer = res.locals.issuer;
        let instId = req.params.instId;

        try {
            let result = await app.services.deployment.removeDeployment(issuer, instId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    // ------------------ deployment permissions ------------------

    router.post("/deployments/:instId/perms", async(req, res) => {

        let issuer = res.locals.issuer;
        let instId = req.params.instId;
        let perm = req.body

        try {
            await app.services.deployment.addDeploymentPerm(issuer, instId, perm);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/deployments/:instId/perms", async(req, res) => {

        let issuer = res.locals.issuer;
        let instId = req.params.instId;
        let perm = req.body;

        try {
            await app.services.deployment.removeDeploymentPerm(issuer, instId, perm);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    // ------------------ instances ------------------

    router.get("/instances", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.deployment.listInstances(issuer, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/instances/:instId", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.instId;

        try {
            let result = await app.services.deployment.listInstances(issuer, query, {});
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

    router.post("/instances", async(req, res) => {

        let issuer = res.locals.issuer;
        let spec = req.body;

        try {
            let result = await app.services.deployment.addInstance(issuer, spec);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/instances/:instId", async(req, res) => {

        let issuer = res.locals.issuer;
        let instId = req.params.instId;

        try {
            let result = await app.services.deployment.removeInstance(issuer, instId);
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

    router.get("/instances/:instId/graph", async(req, res) => {

        let issuer = res.locals.issuer;
        let instId = req.params.instId;

        try {
            let result = await app.services.deployment.listGraphs(issuer, { id: instId });
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

    router.get("/graphs", async(req, res) => {

        let issuer = res.locals.issuer;
        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.deployment.listGraphs(issuer, query, opts);
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