const schema = require("./schema");
const store = require("store");

/**
 * Initialize the store.
 * 
 * @param {string} [url] - The store URL
 * @return {Object} - The store properly configured
 */
module.exports = async (url) => {
    url = url || "level:store";
    let opts = { schema: schema };
    let st = await store(url, opts);
    return st;
}