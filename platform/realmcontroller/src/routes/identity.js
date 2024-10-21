const express = require("express");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[IdentityRouter] ${msg}`));

    var router = express.Router();

    // ------------------ authentication ------------------
    router.post("/sessions", async (req, res) => {

        let cred = req.body;

        try {
            let result = await app.services.identity.login(cred);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.put("/sessions", async (req, res) => {

        let token = res.locals.token;

        try {
            token = await app.services.identity.refreshToken(token);
            res.send(token);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });


    router.delete("/sessions", async (req, res) => {

        try {
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });


    // ------------------ users ------------------
    router.get("/users", async (req, res) => {

        let issuer = res.locals.issuer;

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.identity.listUsers(issuer, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/users/:userId", async (req, res) => {

        let issuer = res.locals.issuer;

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.userId;

        try {
            let result = await app.services.identity.listUsers(issuer, query, {});
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

    router.post("/users", async (req, res) => {

        let data = req.body;

        try {
            let user = await app.services.identity.addUser(data);
            res.send(user);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.put("/users/:userId", async (req, res) => {

        let issuer = res.locals.issuer;
        let userId = req.params.userId;
        let data = req.body;

        try {
            let result = await app.services.identity.updateUser(issuer, userId, data);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/users/:userId", async (req, res) => {

        let issuer = res.locals.issuer;
        let userId = req.params.userId;

        try {
            let result = await app.services.identity.removeUser(issuer, userId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    // ------------------ groups ------------------
    router.get("/groups", async (req, res) => {

        let issuer = res.locals.issuer;

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.identity.listGroups(issuer, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/groups/:groupId", async (req, res) => {

        let issuer = res.locals.issuer;

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.groupId;

        try {
            let result = await app.services.identity.listGroups(issuer, query, {});
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

    router.post("/groups", async (req, res) => {

        let issuer = res.locals.issuer;
        let data = req.body;

        try {
            let group = await app.services.identity.addGroup(issuer, data);
            res.send(group);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.put("/groups/:groupId", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;
        let data = req.body;

        try {
            let result = await app.services.identity.updateGroup(issuer, groupId, data);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/groups/:groupId", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;

        try {
            let result = await app.services.identity.removeGroup(issuer, groupId);
            res.status(200).send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/groups/:groupId/members", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.identity.listGroupMembers(issuer, groupId, query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.post("/groups/:groupId/members", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;
        let userId = req.body.userId;

        try {
            await app.services.identity.addGroupMember(issuer, groupId, userId);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/groups/:groupId/members/:userId", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;
        let userId = req.params.userId;

        try {
            await app.services.identity.removeGroupMember(issuer, groupId, userId);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.post("/groups/:groupId/perms", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;
        let perm = req.body

        try {
            await app.services.identity.addGroupPerm(issuer, groupId, perm);
            res.send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.delete("/groups/:groupId/perms", async (req, res) => {

        let issuer = res.locals.issuer;
        let groupId = req.params.groupId;
        let perm = req.body;

        try {
            await app.services.identity.removeGroupPerm(issuer, groupId, perm);
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