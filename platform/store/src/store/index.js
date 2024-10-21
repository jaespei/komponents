const Q = require('utils').q;
//const { URL } = require("url");

// ------------------- Initialize store drivers
let drivers = {
    "sqlite": require("./sql/sqlite"),
    "sql": require("./sql/sqlite"),
    "mongodb": require("./doc/mongodb"),
    "doc": require("./doc/mongodb"),
    "level": require("./kv"),
    "kv": require("./kv"),
    "proxy": require("./proxy")
};

/**
 * NoSQL store basic constructor.
 * 
 * @param {string} url - The store url, in format "<driver>:[//<host>[:<port>]/]<db>"
 * @param {Object} [opts] - Optional store options
 * @param {Object} [opts.schema] - The store schema. If not provided, the database is supposed to exist
 * @param {string} [opts.schema.version] - The schema version
 * @param {Object} [opts.schema.collections] - Dictionary containing all collections in the store {<col-name>: <col-spec>}
 */
module.exports = async function(url, opts, cb) {

    if (!url) throw new Error("Unable to create store: url not specified");

    // Parse URL
    //let parsedUrl = new URL(url);

    // Get driver name
    let driverName;
    let [driverPath, dbPath] = url.split("//");
    if (dbPath) {
        driverName = "proxy";
    } else {
        driverName = driverPath.split(":")[0];
    }

    // Find driver
    let driver = drivers[driverName];
    if (!driver) throw new Error(`Unable to create store: unknown store type ${driverName}`);

    // Create store
    let store = await driver(url, opts, cb);
    return Q(store).nodeify(cb);

}