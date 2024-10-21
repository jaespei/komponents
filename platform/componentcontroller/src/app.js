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

    // Load schedulers
    app.schedulers = require("./schedulers")(app.services, app.store, app.utils, opts);

    // Inject circular dependency between "component" service and schedulers ...
    app.services.component.schedulers = app.schedulers;

    // Load daemons
    app.daemons = require("./daemons")(app.schedulers, app.services, app.store, app.utils, opts);
    
    return app;
}