const express = require("express");

module.exports = (app, opts) => {

    log = opts.log || (msg => console.log(`[TransactionRouter] ${msg}`));

    var router = express.Router();

    router.get("/transactions/:txId", async(req, res) => {

        let issuer = res.locals.issuer;
        let txId = req.params.txId;

        try {
            let result = await app.services.transaction.findTransactionById(issuer, txId);
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