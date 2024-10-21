module.exports = async () => {
    let app = {};

    // Get common utils
    app.utils = require("./utils");

    // Create app-wise store
    app.store = await require("./db")(app.utils.constants.STORE_URL);
    await app.store.open();

    // Load drivers
    app.drivers = require("./drivers")(app.store, app.utils);

    // Load services
    app.services = require("./services")(app.drivers, app.store, app.utils);
    
    return app;
}