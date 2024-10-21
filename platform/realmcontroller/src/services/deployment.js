const axios = require("axios");
const _ = require("lodash");

/**
 * Deployment Service.
 * 
 * This service is responsible for managing the user deployments. 
 * To that end it implements a lightweight label-based
 * access control system and it forwards all granted operations 
 * to the ComponentController.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class DeploymentService {

    /**
     * Create Instance Service.
     * 
     * @param {Object} services - The remainder services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     * @param {Object} opts - Additional options
     * @param {stirng} opts.host - The server host in format <addr>:<port>
     * @param {string} opts.addr - The server address
     * @param {number} opts.port - The server port
     */
    constructor(services, store, utils, opts) {
        if (!store) this._error("Unable to initialize DeploymentService: missing store");
        if (!services) this._error("Unable to initialize DeploymentService: missing services");
        if (!utils) this._error("Unable to initialize DeploymentService: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.opts = opts;
        this.opts.host = this.opts.host || `${this.opts.addr}:${this.opts.port}`;
        [this.opts.addr, this.opts.port] = this.opts.host.split(":");
        this.log = opts.log || utils.log || (msg => console.log(`[DeploymentService] ${msg}`));
    }

    // ------------------ deployments ------------------
    /**
     * Add new deployment.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} componentId - The component id
     * @param {Object} [deployment] - The deployment data
     * @param {Object} [deployment.labels] - The deployment user labels
     * @param {Object} [deployment.variables] - The deployment variables {name: value}
     * @param {Object} [deployment.entrypoints] - The deployment entrypoints {name: {protocol, path?}}
     * @param {Array<string>} [deployment.domains] - The deployment target domains
     * @return {string} The operation identifier
     */
    async addDeployment(issuer, componentId, deployment) {
        this.log(`addDeployment(${issuer.id},${componentId},${JSON.stringify(deployment)})`);

        if (!issuer) this._error(`Unable to deploy component: missing issuer`);
        if (!componentId) this._error(`Unable to deploy component: missing component id`);

        // Get component (this already check permissions)
        let [component] = await this.services.component.listComponents(issuer, { id: componentId });
        if (!component) this._error(`Unable to deploy component: component not found`);

        // Initialize data
        deployment = deployment || {};
        deployment.variables = deployment.variables || {};
        deployment.entrypoints = deployment.entrypoints || {};

        // Check model
        if (component.model.type != "composite") this._error(`Unable to deploy component: unsupported component type ${model.type}`);

        _.each(deployment.variables, (varVal, varName) => {
            if (!component.model.variables || !component.model.variables[varName]) this._error(`Unable to deploy component: unsupported variable ${varName}`);
        });
        _.each(deployment.entrypoint, (epVal, epName) => {
            if (!component.model.endpoints || !component.model.endpoints[epVal.mapping]) this._error(`Unable to deploy component: unresolved entrypoint mapping ${epName}`);
        });

        let _deployment = {};
        _deployment.title = deployment.title || "";
        _deployment.variables = deployment.variables;
        _deployment.entrypoints = deployment.entrypoints;
        _deployment.domains = deployment.domains || [];
        _deployment.labels = (deployment.labels || []).concat([
            `perm=0:o`, // root is owner
            `perm=${issuer.id}:o`, // issuer is owner
            `component=${componentId}`
        ]);

        // Add instance to ComponentController
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    deployment: _deployment,
                    model: component.model
                }
            );
            return `component:${result}`;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified deployment.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} instanceId - The instance id
     */
    async removeDeployment(issuer, instanceId) {
        this.log(`removeDeployment(${issuer.id},${instanceId})`);

        if (!issuer) this._error(`Unable to remove deployment: missing issuer`);
        if (!instanceId) this._error(`Unable to remove deployment: missing instance id`);

        // Check permissions
        let instance, query = {
            id: instanceId,
            parent: "",
            labels: { $any: this.utils.perms.write(issuer) }
        };
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error(`Unable to remove deployment: access denied`);
            instance = result[0];
        } catch (err) {
            this._error(err);
        }

        // Forward op
        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/instances/${instanceId}`);
            return `component:${result}`;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * List the specified deployments.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listDeployments(issuer, query, opts) {
        this.log(`listDeployments(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list deployments: missing issuer`);

        query = query || {};
        query.parent = ""; // obtain only root instances (deployments)
        query.labels = query.labels || {};
        query.labels.$any = (query.labels.$any || []).concat(this.utils.perms.read(issuer));

        // Forward op
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            );
            _.each(result, inst => {
                let perms = _.filter(inst.labels, label => label.startsWith("perm="));
                inst.perms = _.map(perms, perm => {
                    let [name, value] = perm.split("=");
                    let [id, right] = value.split(":");
                    return {role: id, type: right == "r"? "read": right == "w" && "write" || "owner"};
                });
            });
            return result;
        } catch (err) {
            this._error(err);
        }

    }



    // ------------------ permissions ------------------
    /**
     * Add the specified permission to the deployment.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} instanceId- The instance id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addDeploymentPerm(issuer, instanceId, perm) {
        this.log(`addDeploymentPerm(${issuer.id},${instanceId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to add permission: missing issuer`);
        if (!instanceId) this._error(`Unable to add permission: missing instance id`);
        if (!perm) this._error(`Unable to add permission: missing permission`);
        if (!perm.role) this._error(`Unable to add permission: missing permission role`);
        if (!perm.type) this._error(`Unable to add permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to add permission: unsupported permission type ${perm.type}`);

        // Check access
        let instance, query = {
            id: instanceId,
            labels: { $any: this.utils.perms.write(issuer) }
        };
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error("Unable to add permission: access denied");
            instance = result[0];
        } catch (err) {
            this._error(err);
        }

        let labels = (instance.labels || []).concat(`perm=${perm.role}:${perm.type.charAt(0)}`);

        // Forward op
        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/instances/${instanceId}`, { labels: labels }
            );
            return `component:${result}`;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified permission from the instance.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} instanceId- The instance id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeDeploymentPerm(issuer, domainId, perm) {
        this.log(`removeDeploymentPerm(${issuer.id},${instanceId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to remove permission: missing issuer`);
        if (!instanceId) this._error(`Unable to remove permission: missing instance id`);
        if (!perm) this._error(`Unable to remove permission: missing permission`);
        if (!perm.role) this._error(`Unable to remove permission: missing permission role`);
        if (!perm.type) this._error(`Unable to remove permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to remove permission: unsupported permission type ${perm.type}`);

        // Check access
        let instance, query = {
            id: instanceId,
            labels: { $any: this.utils.perms.write(issuer) }
        };
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error("Unable to remove permission: access denied");
            instance = result[0];
        } catch (err) {
            this._error(err);
        }

        let labels = _.filter(
            instance.labels || [],
            label => {
                let [name, value] = label.split("=");
                if (name != "perm") return true;
                let [role, right] = value.split(":");
                if (role == perm.role && right == perm.type.charAt(0)) return false;
                return true;
            }
        );

        // Forward op
        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/instances/${instanceId}`, { labels: labels }
            );
            return `component:${result}`;
        } catch (err) {
            this._error(err);
        }

    }


    // ------------------ instances ------------------

    /**
     * Add new instance. 
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} spec - The instance specification
     * @param {string} [spec.parent] - The instance parent
     * @param {string} [spec.subcomponent] - The subcomponent name
     * @param {string} [spec.connector] - The connector name
     * @param {Object} [spec.deployment] - The instance deployment data
     * @param {Object} [spec.deployment.variables] - The instance variables
     * @param {Object} [spec.deployment.entrypoints] - The instance entrypoints
     * @param {Array<string>} [spec.deployment.domains] - The instance target domains
     * @param {Array<string>} [spec.deployment.labels] - The instance labels
     * @param {Object} [spec.model] - The instance model
     */
    async addInstance(issuer, spec) {
        this.log(`addInstance(${issuer.id},${JSON.stringify(spec)})`);

        if (!issuer) this._error(`Unable to add instance: missing issuer`);
        if (!spec) this._error(`Unable to add instance: missing instance spec`);

        let parent;
        if (spec.parent) {
            // Check permissions
            let query = {
                id: spec.parent,
                labels: { $any: this.utils.perms.write(issuer) }
            };
            try {
                let { data: result } = await axios.get(
                    `http://${this.opts.addr}:${this.opts.port}/instances`, {
                        params: {
                            query: JSON.stringify(query)
                        }
                    }
                );
                if (!result.length) this._error(`Unable to add instance: access denied`);
                parent = result[0];
            } catch (err) {
                this._error(err);
            }
        }

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/instances`,
                spec
            );
            return `component:${result}`;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified instance.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} instanceId - The instance
     */
    async removeInstance(issuer, instanceId) {
        this.log(`removeInstance(${issuer.id},${instanceId})`);

        if (!issuer) this._error(`Unable to remove instance: missing issuer`);
        if (!instanceId) this._error(`Unable to remove instance: missing instance id`);

        // Check permissions
        let instance, query = {
            id: instanceId,
            labels: { $any: this.utils.perms.write(issuer) }
        };
        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query)
                    }
                }
            );
            if (!result.length) this._error(`Unable to remove instance: access denied`);
            instance = result[0];
        } catch (err) {
            this._error(err);
        }

        // Forward op
        try {
            let { data: result } = await axios.delete(`http://${this.opts.addr}:${this.opts.port}/instances/${instanceId}`);
            return `component:${result}`;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified instances.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listInstances(issuer, query, opts) {
        this.log(`listInstances(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list instances: missing issuer`);

        query = query || {};
        query.labels = query.labels || {};
        query.labels.$any = (query.labels.$any || []).concat(this.utils.perms.read(issuer));

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            );
            _.each(result, inst => {
                let perms = _.filter(inst.labels, label => label.startsWith("perm="));
                inst.perms = _.map(perms, perm => {
                    let [name, value] = perm.split("=");
                    let [id, right] = value.split(":");
                    return {role: id, type: right == "r"? "read": right == "w" && "write" || "owner"};
                });
            });
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    // ------------------ graphs ------------------
    /**
     * List the specified graphs.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listGraphs(issuer, query, opts) {
        this.log(`listGraphs(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list graphs: missing issuer`);

        query = query || {};
        query.labels = query.labels || {};
        query.labels.$any = (query.labels.$any || []).concat(this.utils.perms.read(issuer));

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/graphs`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    }
                }
            );
            _.each(result, inst => {
                let perms = _.filter(inst.labels, label => label.startsWith("perm="));
                inst.perms = _.map(perms, perm => {
                    let [name, value] = perm.split("=");
                    let [id, right] = value.split(":");
                    return {role: id, type: right == "r"? "read": right == "w" && "write" || "owner"};
                });
            });
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    _error(err) {
        if (_.isString(err)) {
            let err0 = new Error(err);
            err0.type = "DeploymentError";
            throw err0;
        } else if (err.response) {
            let err0 = new Error();
            err0.type = err.response.data && err.response.data.type || "DeploymentError";
            err0.message = err.response.data && err.response.data.message || err.message;
            err0.cause = err;
            err0.stack = err.response.data && err.response.data.stack || err.stack;
            throw err0;
        } else {
            throw err;
        }

    }


}

module.exports = (services, store, utils, opts) => {
    let _opts = Object.assign({}, opts || {});
    _opts.addr = opts.componentAddr || opts.addr;
    _opts.port = opts.componentPort || opts.port;
    if (!_opts.addr) _opts.host = process.env.COMPONENT_HOST || "127.0.0.1:9000";
    else _opts.host = `${_opts.addr}:${_opts.port}`;
    return new DeploymentService(services, store, utils, _opts);
}