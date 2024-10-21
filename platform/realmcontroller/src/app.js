module.exports = async (opts) => {
    
    opts = opts || {};

    let app = {};

    // Get common utils
    app.utils = require("./utils");

    // Create app-wise store
    app.store = await require("./db")(app.utils.constants.STORE_URL);
    await app.store.open();

    // Load services
    app.services = require("./services")(app.store, app.utils, opts);
    
    return app;
}