const _ = require("lodash");

/**
 * Component Service.
 * 
 * This service is responsible for managing the issuer components.
 * 
 * @author Javier Esparza-Peidro <jesparza@description.upv.es>
 */
class ComponentService {

    /**
     * Create Component Service.
     * 
     * @param {Object} services - The remainder services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(services, store, utils, opts) {
        if (!store) this._error("Unable to initialize ComponentService: missing store");
        if (!services) this._error("Unable to initialize ComponentService: missing services");
        if (!utils) this._error("Unable to initialize ComponentService: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.log = opts.log || utils.log || (msg => console.log(`[ComponentService] ${msg}`));
    }


    // ------------------ components ------------------
    /**
     * Add a new component.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} component - The component data
     * @param {string} component.model - The component model
     * @param {string} component.layout - The component layout
     * @return {Object} The created component data
     */
    async addComponent(issuer, component) {
        this.log(`addComponent(${issuer.id},${JSON.stringify(component)})`);

        // Check properties
        if (!issuer) this._error(`Unable to add component: missing issuer`);
        if (!component) this._error(`Unable to add component: missing component data`);
        if (!component.model) this._error(`Unable to add component: missing component model`);

        let _component = {
            id: this.utils.uuid(),
            ts: Date.now(),
            type: component.model.type,
            name: component.model.name,
            title: component.title || "Untitled",
            summary: component.summary || "No summary",
            desc: component.desc || "No description",
            labels: component.labels || [],
            model: component.model,
            layout: component.layout || {},
            pict: component.pict || "",
            perms: [
                `perm=0:o`, // root is owner
                `perm=${issuer.id}:o` // issuer iw owner
            ]
        }

        await this.store.insert("components", _component);

        return _component;

    }

    /**
     * Update the specified component with the specified data.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} componentId - The component id
     * @param {Object} data - The data to update
     */
    async updateComponent(issuer, componentId, data) {
        this.log(`updateComponent(${issuer.id},${componentId},${JSON.stringify(data)})`);

        if (!issuer) this._error(`Unable to update component: missing issuer`);
        if (!componentId) this._error(`Unable to update component: missing component id`);
        if (!data) this._error(`Unable to update component: missing component data`);

        // Check access
        let [component] = await this.store.search(
            "components", {
                id: componentId,
                perms: { $any: this.utils.perms.write(issuer) }
            });
        if (!component) this._error(`Unable to update component: access denied`);

        // Check data
        let _data = {};
        if (data.title) _data.title = data.title;
        if (data.summary) _data.summary = data.summary;
        if (data.desc) _data.desc = data.desc;
        if (data.labels) _data.labels = data.labels;
        if (data.layout) _data.layout = data.layout;
        if (data.model) {
            _data.model = data.model;
            _data.type = data.model.type;
            _data.name = data.model.name;
        }
        if (data.pict) _data.pict = data.pict;
        _data.ts = Date.now();

        // Update
        // [TODO versions???]
        await this.store.update(
            "components", { id: componentId },
            _data
        );

    }

    /**
     * Remove component.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} componentId - The component id
     */
    async removeComponent(issuer, componentId) {
        this.log(`removeComponent(${issuer.id},${componentId})`);

        if (!issuer) this._error(`Unable to remove component: missing issuer`);
        if (!componentId) this._error(`Unable to remove component: missing component id`);

        // Check access
        let [component] = await this.store.search(
            "components", {
                id: componentId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!component) this._error(`Unable to remove component: access denied`);

        // Delete
        // [TODO versions???]
        // [TODO deployments??]
        await this.store.delete(
            "components", { id: componentId }
        );

    }



    /**
     * List the specified components.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listComponents(issuer, query, opts) {
        this.log(`listComponents(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list components: missing issuer`);

        query = query || {};
        query.perms = { $any: this.utils.perms.read(issuer) }

        let result = await this.store.search("components", query, opts);        
        _.each(result, comp => {
            comp.perms = _.map(comp.perms, perm => {
                let [name, value] = perm.split("=");
                let [id, right] = value.split(":");
                return {role: id, type: right == "r"? "read": right == "w" && "write" || "owner"};
            });
        });
        return result;

    }


    // ------------------ permissions ------------------
    /**
     * Add the specified permission to the component.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} componentId- The component id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addComponentPerm(issuer, componentId, perm) {
        this.log(`addComponentPerm(${issuer.id},${componentId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to add permission: missing issuer`);
        if (!componentId) this._error(`Unable to add permission: missing component id`);
        if (!perm) this._error(`Unable to add permission: missing permission`);
        if (!perm.role) this._error(`Unable to add permission: missing permission role`);
        if (!perm.type) this._error(`Unable to add permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to add permission: unsupported permission type ${perm.type}`);

        // Check access
        let [component] = await this.store.search(
            "components", {
                id: componentId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!component) this._error(`Unable to add permission: access denied`);

        let perms = component.perms.concat(`perm=${perm.role}:${perm.type.charAt(0)}`);

        // Update
        await this.store.update(
            "components", { id: componentId }, { perms: perms, ts: Date.now() }
        );


    }

    /**
     * Remove the specified permission from the component.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} componentId- The component id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeComponentPerm(issuer, componentId, perm) {
        this.log(`removeComponentPerm(${issuer.id},${componentId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to remove permission: missing issuer`);
        if (!componentId) this._error(`Unable to remove permission: missing component id`);
        if (!perm) this._error(`Unable to remove permission: missing permission`);
        if (!perm.role) this._error(`Unable to remove permission: missing permission role`);
        if (!perm.type) this._error(`Unable to remove permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to remove permission: unsupported permission type ${perm.type}`);

        // Check access
        let [component] = await this.store.search(
            "components", {
                id: componentId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!component) this._error(`Unable to remove permission: access denied`);

        let perms = _.filter(
            component.perms,
            p => {
                let [name, value] = p.split("=");
                let [role, right] = value.split(":");
                if (role == perm.role && right == perm.type.charAt(0)) return false;
                return true;
            }
        );

        // Update
        await this.store.update(
            "components", { id: componentId }, { perms: perms, ts: Date.now() }
        );

    }

    _error(err) {
        if (_.isString(err)) {
            let err0 = new Error(err);
            err0.type = "ComponentError";
            throw err0;
        } else if (err.response) {
            let err0 = new Error();
            err0.type = err.response.data && err.response.data.type || "ComponentError";
            err0.message = err.response.data && err.response.data.message || err.message;
            err0.cause = err;
            err0.stack = err.response.data && err.response.data.stack || err.stack;
            throw err0;
        } else {
            throw err;
        }

    }


}

module.exports = (...opts) => {
    return new ComponentService(...opts);
}