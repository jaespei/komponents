const express = require("express");

module.exports = (app, opts) => {

    // Create parent router
    var router = express.Router();

    // Mount all subrouters
    router.use(require("./identity")(app, opts));
    router.use(require("./domain")(app, opts));
    router.use(require("./component")(app, opts));
    router.use(require("./deployment")(app, opts));
    router.use(require("./transaction")(app, opts));

    return router;

}