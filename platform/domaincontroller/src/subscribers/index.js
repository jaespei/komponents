/**
 * Registers all application event subscribers.
 * 
 * @param {*} opts 
 */
module.exports = (...opts) => {
    ["domain"].forEach(moduleName => {
        require(moduleName)(...opts);
    });
}