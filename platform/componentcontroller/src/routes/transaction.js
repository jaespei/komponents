const express = require("express");
const bodyParser = require("body-parser");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[TransactionRouter] ${msg}`));

    var router = express.Router();

    // Mount JSON body parser
    router.use(bodyParser.json());

    // ------------------ transactions ------------------

    router.get("/transactions", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        let opts = req.query.opts && JSON.parse(req.query.opts) || {};

        try {
            let result = await app.services.transaction.listTransactions(query, opts);
            res.send(result);
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });

    router.get("/transactions/:txId", async (req, res) => {

        let query = req.query.query && JSON.parse(req.query.query) || {};
        query.id = req.params.txId;

        try {
            let result = await app.services.transaction.listTransactions(query, {});
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

    /*router.delete("/transactions", async (req, res) => {

        try {
            let ini = Number(req.query.ini);
            let end = Number(req.query.end);
            await app.services.transactions.purgeTransactions(ini, end);
            res.status(204).send();
        } catch (err) {
            res.status(400).send({
                type: err.type,
                message: err.message,
                stack: err.stack
            });
        }

    });*/

    return router;

}