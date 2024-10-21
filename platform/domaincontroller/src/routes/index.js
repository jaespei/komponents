const express = require("express");

module.exports = (app, opts) => {

    // Create parent router
    var router = express.Router();

    // Mount all subrouters
    router.use(require("./domain")(app, opts));
    router.use(require("./transaction")(app, opts));
    //router.use(require("./server")(app, opts));


    return router;

}