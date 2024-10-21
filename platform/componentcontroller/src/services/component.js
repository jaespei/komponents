const fs = require("fs");
const vm = require("vm");

const _ = require("lodash");
_.eachAsync = async (col, fn) => {
    if (col) {
        if (_.isArray(col)) {
            for (let i = 0; i < col.length; i++) await fn(col[i], i);
        } else {
            for (let key in col) await fn(col[key], key);
        }
    }
};
const axios = require("axios");
const Q = require("q");
const YAML = require("yaml");

Q.longStackSupport = true;

Q.waitAll = function (promises) {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then(function (snapshots) {
        _.forEach(snapshots, function (snapshot) {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};


/**
 * Component Service.
 * 
 * Service responsible for managing component deployments.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class ComponentService {

    /**
     * Initializes the service. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} services - The remainder services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(services, store, utils) {
        if (!store) throw this.error("Unable to initialize ComponentService: missing store");
        if (!services) throw this.error("Unable to initialize ComponentService: missing services");
        if (!utils) throw this.error("Unable to initialize ComponentService: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.log = utils && utils.log || ((msg) => console.log("[ComponentService] " + msg));
    }

    // ------------------ instances ------------------

    /**
     * Add a new instance.
     * 
     * Three main use cases are considered:
     * 1.- Add a root composite: it represents a new composite deployment
     *     (.type is 'composite', .parent is null, .deployment and .model are specified)
     * 2.- Add a basic/composite to an already running deployment whose properties
     *     are specified in the parent model
     *     (.parent and .subcomponent/.connector are specified)
     * 3.- Add a basic/composite to an already running deployment whose properties
     *     are provided
     *     (.parent, .component and .model are specified)
     * 
     * Irrespective of the use case, labels may be specified. Labels allow to organize
     * instances and are inherited hierarchically.
     * 
     * @param {Object} spec - The instance specification
     * @param {string} [spec.parent] - The instance parent
     * @param {string} [spec.subcomponent] - The subcomponent name
     * @param {string} [spec.connector] - The connector name
     * @param {Array<string>} [spec.labels] - The instance labels
     * @param {Object} [spec.deployment] - The instance deployment data
     * @param {string} [spec.deployment.title] - The deployment title
     * @param {Object} [spec.deployment.variables] - The instance variables
     * @param {Object} [spec.deployment.entrypoints] - The instance entrypoints {name:{protocol,path?}}
     * @param {Array<string>} [spec.deployment.domains] - The instance target domains
     * @param {Array<string>} [spec.deployment.labels] - The instance labels
     * @param {Object} [spec.model] - The instance model
     */
    async addInstance(spec) {
        this.log(`addInstance(${JSON.stringify(spec)})`);

        if (!spec) throw this.error("Unable to add instance: missing instance spec");

        //spec.type = spec.type || spec.model && spec.model.type;

        /*if (!spec.type) throw this.error("Unable to add instance: missing instance type");
        if (spec.type == "basic" && !spec.parent) throw this.error("Unable to add instance: missing instance parent");
        if (spec.type == "basic" && !spec.subcomponent && !spec.connector) throw this.error("Unable to add instance: missing instance subcomponent/connector");*/
        if (!spec.model && !spec.parent) throw this.error("Unable to add instance: missing instance parent");
        if (!spec.model && !spec.subcomponent && !spec.connector) throw this.error("Unable to add instance: missing instance subcomponent/connector");

        spec.deployment = spec.deployment || {};

        let parent;
        if (spec.parent) {
            [parent] = await this.store.search("instances", { id: spec.parent });
            if (!parent) throw this.error("Unable to add instance: parent instance not found");
        }

        if (!spec.model) {
            // Obtain model from parent
            let subcomp = spec.subcomponent ? parent.model.subcomponents[spec.subcomponent] : parent.model.connectors[spec.connector];
            if (!subcomp) throw this.error(`Unable to add instance: subcomponent/connector ${spec.subcomponent || spec.connector} not found`);

            spec.model = parent.model.imports[subcomp.type];

            // Merge deployment (if any) and subcomponent/connector data
            spec.deployment = _.merge(subcomp, spec.deployment);
        }

        // Resolve model
        let model = await this._resolveModel(spec.deployment, spec.model);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_INSTANCE_ADD,
            data: JSON.stringify(spec)
        });

        // Start async operation
        let promise;
        if (spec.model.type == "basic") {
            promise = this._addBasic(parent, spec.subcomponent || spec.connector, model, { tx: tx });
        } else {
            promise = this._addComposite(parent, spec.subcomponent || spec.connector, model, { tx: tx });
        }

        promise
            .then(async inst => {
                await this.services.transaction.completeTransaction(tx.id, { target: inst.id });
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            });

        // return transaction id
        return tx.id;
    }

    /**
     * Update the specified instance.
     * 
     * @param {string} instanceId - The instace id
     * @param {Object} data - The data to update
     */
    async updateInstance(instanceId, data) {
        this.log(`updateInstance(${instanceId},${JSON.stringify(data)})`);

        if (!instanceId) throw this.error("Unable to update instance: missing instance id");
        if (!data) throw this.error("Unable to update instance: missing instance data");

        let [instance] = await this.store.search("instances", { id: instanceId });
        if (!instance) throw this.error(`Unable to update instance: instance not found`);
        if (instance.state == "destroy") throw this.error(`Unable to update instance: instance is being removed`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_INSTANCE_UPDATE,
            target: instanceId,
            data: JSON.stringify(data)
        });

        // Start async operation

        // For now, only labels and title can be updated
        let update = {};
        if (data.title) update.title = data.title;
        if (data.labels) {
            update.labels = (instance.labels || []).concat(data.labels);
            update.model = instance.model;
            update.model.labels = (update.model.labels || []).concat(data.labels);
        }

        // Update parent
        let promise = this.store.update(
            "instances",
            { id: instanceId },
            update
        );

        if (data.labels) {
            // Propagate labels all the way down
            promise = promise.then(async () => {
                let graph = await this._toGraph(instanceId, { basic: true, composite: true });
                let promises = [];
                _.each(graph.instances, inst => {
                    inst.labels = (inst.labels || []).concat(data.labels);
                    inst.model.labels = (inst.model.labels || []).concat(data.labels);
                    promises.push(
                        this.store.update(
                            "instances",
                            { inst: inst.id },
                            { labels: inst.labels, model: inst.model }
                        ));
                });
                return Q.waitAll(promises);
            });
        }
        // Labels are updated hierarchically ...
        /*let promise;
        if (data.labels) {
            promise = this._toGraph(instanceId, { basic: true, composite: true })
                .then(graph => {
                    let promises = [];
                    _.each(graph.instances, inst => {
                        inst.labels = (inst.labels || []).concat(data.labels);
                        inst.model.labels = (inst.model.labels || []).concat(data.labels);
                        promises.push(
                            this.store.update(
                                "instances",
                                { inst: inst.id },
                                { labels: inst.labels, model: inst.model }
                            ));
                    });
                    instance.labels = (instance.labels || []).concat(data.labels);
                    instance.model.labels = (instance.model.labels || []).concat(data.labels);
                    promises.push(
                        this.store.update(
                            "instances",
                            { id: instanceId },
                            { labels: instance.labels, model: instance.model }
                        ));
                    return Q.waitAll(promises);
                });
        } else {
            promise = Q(true);
        }*/
        promise
            .then(async () => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            });

        // return transaction id
        return tx.id;

    }

    /**
     * Remove the specified instance.
     * 
     * @param {string} instanceId - The instance identifier
     */
    async removeInstance(instanceId) {
        this.log(`removeInstance(${instanceId})`);

        if (!instanceId) throw this.error("Unable to remove instance: missing instance id");

        let [instance] = await this.store.search("instances", { id: instanceId });
        if (!instance) throw this.error(`Unable to remove instance: instance not found`);
        if (instance.state == "destroy") throw this.error(`Unable to remove instance: instance is being removed`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_INSTANCE_REMOVE,
            target: instanceId
        });

        // Start async operation
        let promise;
        if (instance.type == "basic") {
            promise = this._removeBasic(instance, { tx: tx });
        } else {
            promise = this._removeComposite(instance, { tx: tx });
        }

        promise
            .then(async () => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            });

        // return transaction id
        return tx.id;
    }


    /**
     * List the specified instances.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listInstances(query, opts) {
        this.log(`listInstances(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        query = query || {};
        opts = opts || opts;

        let result = await this.store.search("instances", query, opts);
        return result;
    }

    // ------------------ graphs ------------------

    /**
     * List the specified graphs.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listGraphs(query, opts) {
        this.log(`listInstances(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        query = query || {};
        opts = opts || opts;

        // Obtain instances
        let instances = await this.store.search("instances", query, opts);

        // Translate to graph
        let promises = [];
        _.each(instances, instance => {
            let promise = this._toGraph(instance, { basic: true, composite: true });
            promises.push(promise);
        });
        let result = await Q.waitAll(promises);

        return result;
    }


    // ------------------ collection ------------------

    /**
     * List the specified collections.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listCollections(query, opts) {
        this.log(`listCollections(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        query = query || {};
        opts = opts || opts;

        let result = await this.store.search("collections", query, opts);
        return result;
    }

    // ------------------ links ------------------

    /**
     * List the specified links.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listLinks(query, opts) {
        this.log(`listLinks(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        query = query || {};
        opts = opts || opts;

        let result = await this.store.search("links", query, opts);
        return result;
    }


    // ----------------------------------------------------


    /**
     * Add a composite instance.
     * 
     * @param {Object} parent - The parent instance, if any
     * @param {string} name - The subcomponent/connector name
     * @param {Object} model - The model
     */
    async _addComposite(parent, name, model) {
        this.log(`_addComposite(${parent && parent.id || parent},${name})`);

        // 1. Build parse tree including as nodes composite instances 
        //    and collections of basic instances 
        let tree = await this._buildTree(parent, name, model);

        // 2. Connect collections of the parse tree
        tree = await this._connectTree(tree);

        // 3. Populate collections of the parse tree with
        //    basic instances
        let instances = await this._populateTree(tree);

        // 4. Mark collections as initialized (daemons cannot
        //    touch them before)
        await this.store.update(
            "collections",
            { id: { $in: _.map(tree.collections, col => col.id) } },
            { state: "init", last: Date.now() }
        );

        // 5. Mark composite as ready
        await this.store.update(
            "instances",
            { id: tree.root.id },
            { state: "ready" }
        );

        return tree.root;
    }


    /**
     * Add a composite instance.
     * 
     * @param {Object} parent - The parent instance, if any
     * @param {string} name - The subcomponent/connector name
     * @param {Object} model - The model
     * @param {Object} ctxt - The operation context
     *
    async _addComposite(parent, name, model, ctxt) {
        this.log(`_addComposite(${parent && parent.id || parent},${name})`);


        let instance = {
            id: this.utils.uuid(),
            type: model.type,
            parent: parent && parent.id || "",
            subcomponent: parent && parent.subcomponents[name] && name || "",
            connector: parent && parent.connectors[name] && name || "",
            labels: model.labels || [],
            model: model,
            collection: "",
            domain: "",
            addr: "",
            data: {},
            state: "init",
            last: Date.now()
        };

        // Add instance to store
        await this.store.insert("instances", instance);

        // Apply topological order to graph
        let graph = this._toGraph(model);
        let sorted = this._sortGraph(graph);

        // Initialize subcomponents/connectors in a sorted way
        let collections = [];
        _.each(sorted, async node => {

            let subcomp = model.subcomponents[node.name];
            let con = model.connectors[node.name];
            let subcompType = model.imports[subcomp && subcomp.type || con.type];

            if (subcompType.type == "basic") {

                // Create collection
                let collection = {
                    id: this.utils.uuid(),
                    parent: instance.id,
                    name: node.name,
                    labels: [],
                    addr: node.type == "connector" ?
                        this.utils.randaddr(this.utils.constants.CONNECTOR_CIDR) : "",
                    data: {},
                    state: "init",
                    last: Date.now()
                };
                collections.push(collection);
                await this.store.insert("collections", collection);

                // Create links
                if (node.type == "subcomponent") {
                    _.each(
                        subcompType.endpoints,
                        async(ep, epName) => {

                            // Obtain adjacents
                            let adjacents = await this._findAdjacents({
                                parent: instance,
                                subcomponent: node.name,
                                endpoint: epName
                            });

                            // Add links
                            _.each(adjacents, async adjacent => {
                                await this.store.insert("links", {
                                    id: this.utils.uuid(),
                                    name: epName,
                                    protocol: ep.protocol,
                                    src: ep.type == "in" ? adjacent.id : collection.id,
                                    dst: ep.type == "in" ? collection.id : adjacent.id,
                                    data: {},
                                    state: "ready",
                                    last: Date.now()
                                });
                            });

                        });
                } else {

                    // - obtain protocol from output endpoint
                    let outType = model.imports[model.subcomponents[con.outputs[0].subcomponent].type];
                    let protocol = outType.endpoints[con.outputs[0].endpoint].protocol;

                    // Obtain in adjacents
                    let adjacents = await this._findAdjacents({
                        parent: instance,
                        connector: node.name,
                        direction: "in"
                    });
                    // Add links                    
                    _.each(adjacents, async adjacent => {
                        await this.store.insert("links", {
                            id: this.utils.uuid(),
                            protocol: protocol,
                            src: adjacent.id,
                            dst: collection.id,
                            data: {},
                            state: "ready",
                            last: Date.now()
                        });
                    });

                    // Obtain out adjacents
                    adjacents = await this._findAdjacents({
                        parent: instance,
                        connector: node.name,
                        direction: "out"
                    });
                    // Add links
                    _.each(adjacents, async adjacent => {
                        await this.store.insert("links", {
                            id: this.utils.uuid(),
                            protocol: protocol,
                            src: collection.id,
                            dst: adjacent.id,
                            data: {},
                            state: "ready",
                            last: Date.now()
                        });
                    });

                }


                // Schedule instances
                let scheduler = subcompType.schedule || "basic";
                let events = await this.schedulers[scheduler].schedule({
                    parent: instance,
                    subcomponent: node.type == "subcomponent" ? node.name : undefined,
                    connector: node.type == "connector" ? node.name : undefined
                });

                // Create instances
                let promises = [];
                _.each(events, event => {
                    if (event.type == "InstanceAdd") {
                        promises.push(this._addBasic(instance, node.name, subcompType));
                    }
                });
                await Q.waitAll(promises);

            } else if (subcompType.type == "composite") {

                // Schedule instances
                let scheduler = subcompType.schedule || "basic";
                let events = await this.schedulers[scheduler].schedule({
                    parent: instance,
                    subcomponent: node.type == "subcomponent" ? node.name : undefined,
                    connector: node.type == "connector" ? node.name : undefined
                });

                // Create instances
                let promises = [];
                _.each(events, event => {
                    if (event.type == "InstanceAdd") {
                        promises.push(this._addComposite(instance, node.name, subcompType));
                    }
                });
                await Q.waitAll(promises);
            }

        });

        return instance;
    }*/

    /**
     * Remove the specified composite.
     * 
     * @param {Object} instance - The instance to remove
     */
    async _removeComposite(instance) {
        this.log(`_removeComposite(${instance.id || instance})`);

        if (_.isString(instance)) {
            [instance] = await this.store.search(
                "instances",
                { id: instance }
            );
            if (!instance) throw this.error(`Unable to remove composite instance: instance not found`);
        }

        // Obtain graph
        let graph = await this._toGraph(instance, { composite: true, basic: true });

        // Mark all collections as destroyable (daemons will
        // do the rest)
        let ids = _.map(graph.collections, col => col.id);
        await this.store.update(
            "collections",
            { id: { $in: ids } },
            { state: "destroy", last: Date.now() }
        );

        // Mark all links as destroyable
        /*await this.store.update(
            "links",
            { src: { $in: ids }, state: "ready" },
            { state: "destroy", last: Date.now() }
        );
        await this.store.update(
            "links",
            { dst: { $in: ids }, state: "ready" },
            { state: "destroy", last: Date.now() }
        );*/

        // Delete all instances
        await this.store.delete(
            "instances",
            { id: { $in: _.map(graph.instances, inst => inst.id).concat(graph.root.id) } }
        );

    }


    /**
     * Remove the specified basic instance.
     * 
     * @param {string|Object} instance  - The instance to remove
     */
    async _removeBasic(instance) {
        this.log(`removeBasic(${instance.id || instance})`);

        if (_.isString(instance)) {
            [instance] = await this.store.search(
                "instances",
                { id: instance }
            );
            if (!instance) throw this.error(`Unable to remove basic instance: instance not found`);
        }


        // Here we mark the instance as destroyable (daemons
        // will do the rest)
        //
        await this.store.update(
            "instances",
            { id: instance.id },
            { state: "destroy", last: Date.now() }
        );

        /*// Update owner collection 

        // - Obtain lock on collection
        let lock = this.utils.uuid();
        let collection = await this._loop(async () => {
            let [collection] = await this.store.search(
                "collections", { id: instance.collection }, { lock: lock }
            );
            if (!collection) throw this.error(`Unable to remove basic instance: owner collection not found`);
            return collection;

        });

        // - Update members list 
        let index = collection.members.find(inst => inst.id == instance);
        if (index != -1) collection.members.splice(index, 1);

        // - Unlock collection
        await this.store.update(
            "collections",
            { id: collection.id },
            {
                members: collection.members,
                last: Date.now()
            },
            { unlock: lock }
        );*/

    }


    /**
     * Build parse tree, where nodes are either composite instances or
     * collections of basic instances.
     * 
     * @param {Object} parent - The parent instance, if any
     * @param {string} name - The subcomponent/connector name
     * @param {Object} model - The model
     * @return {Object} The parsed tree {root, collections}
     */
    async _buildTree(parent, name, model) {
        this.log(`_buildTree(${parent && parent.id},${name})`);

        let root = {
            id: this.utils.uuid(),
            type: model.type,
            title: model.title || "",
            parent: parent && parent.id || "",
            subcomponent: parent && parent.model.subcomponents[name] && name || "",
            connector: parent && parent.model.connectors[name] && name || "",
            labels: model.labels || [],
            model: model,
            collection: "",
            domain: "",
            addr: "",
            data: {},
            state: "init",
            last: Date.now()
        };

        // Add root instance to store
        await this.store.insert("instances", root);

        let collections = {};

        // Initialize subcomponents
        await _.eachAsync(model.subcomponents, async (subcomp, subcompName) => {
            let subcompType = model.imports[subcomp.type];
            if (subcompType.type == "basic") {

                let inputs = {}, outputs = {};
                _.each(subcompType.endpoints, (ep, epName) => {
                    if (ep.type == "in") inputs[epName] = ep.protocol;
                    else if (ep.type == "out") outputs[epName] = ep.protocol;
                });

                // Create collection
                let collection = {
                    id: this.utils.uuid(),
                    parent: root.id,
                    name: subcompName,
                    labels: [],
                    addr: "",
                    publish: false,
                    publishPaths: [],
                    publishInputs: {},
                    inputs: inputs,
                    outputs: outputs,
                    members: [],
                    domains: subcomp.domains || subcompType.domains || [],
                    data: {},
                    state: "preinit",
                    last: Date.now()
                };
                collections[collection.id] = collection;
                await this.store.insert("collections", collection);

            } else if (subcompType.type == "composite") {

                // Schedule instances
                let scheduler = subcomp.schedule || subcompType.schedule || "basic";
                let events = await this.schedulers[scheduler].schedule({
                    parent: root,
                    subcomponent: subcompName
                });

                // Build subtrees
                await _.eachAsync(events, async event => {
                    if (event.type == "InstanceAdd") {
                        let model = await this._resolveModel(subcomp, subcompType);
                        let result = await this._buildTree(root, subcompName, model);
                        Object.assign(collections, result.collections);
                    }
                });

            }
        });

        // Initialize connectors (other than "Link")
        await _.eachAsync(
            _.filter(model.connectors, con => con.type != "Link"),
            async con => {
                let conType = model.imports[con.type];
                if (conType.type == "basic") {

                    let inputs = {}, outputs = {};
                    _.each(conType.endpoints, (ep, epName) => {
                        if (ep.type == "in") inputs[epName] = ep.protocol;
                        else if (ep.type == "out") outputs[epName] = ep.protocol;
                    });

                    let publish = false, publishInputs = {}, publishPaths = [];
                    if (con.entrypoints) {
                        publish = true;
                        _.each(con.entrypoints, (ep, epName) => {
                            publishInputs[ep.mapping] = {
                                protocol: ep.protocol,
                                path: ep.path
                            };
                            publishPaths.push(`${ep.protocol}${ep.path || ""}`);
                        });
                    }

                    // Create collection
                    let collection = {
                        id: this.utils.uuid(),
                        parent: root.id,
                        name: con.name,
                        labels: [],
                        addr: this.utils.randaddr(this.utils.constants.CONNECTOR_CIDR),
                        publish: publish,
                        publishPaths: publishPaths,
                        publishInputs: publishInputs,
                        inputs: inputs,
                        outputs: outputs,
                        members: [],
                        domains: con.domains || conType.domains || [],
                        data: {},
                        state: "preinit",
                        last: Date.now()
                    };

                    collections[collection.id] = collection;
                    await this.store.insert("collections", collection);

                } else if (conType.type == "composite") {

                    // Schedule instances
                    let scheduler = con.schedule || conType.schedule || "basic";
                    let events = await this.schedulers[scheduler].schedule({
                        parent: root,
                        connector: conName
                    });

                    // Build subtrees
                    await _.eachAsync(events, async event => {
                        if (event.type == "InstanceAdd") {
                            let model = await this._resolveModel(con, conType);
                            let result = await this._buildTree(root, conName, model);
                            Object.assign(collections, result.collections);
                        }
                    });
                }
            });

        return { root: root, collections: collections };

    }

    /**
     * Connect collections with links within the parse tree.
     * 
     * @param {Object} tree - The tree
     * @param {Object} tree.root - The tree root
     * @param {Object} tree.collections - The tree collections
     * @return {Object} The tree {root, collections, links}
     */
    async _connectTree(tree) {
        this.log(`_connectTree(${JSON.stringify(tree)})`);

        let links = [];
        let insertUnrepeated = async (link) => {

            // 1. Look for links in inserte links
            if (_.find(
                links,
                l => l.src == link.src &&
                    l.srcName == link.srcName &&
                    l.dst == link.dst &&
                    l.dstName == link.dstName)) return;

            // 2. Look for links in store
            let results = await this.store.search(
                "links", {
                src: link.src,
                srcName: link.srcName,
                dst: link.dst,
                dstName: link.dstName
            }
            );
            if (results.length) return;

            // 3. Add link
            links.push(link);
            await this.store.insert("links", link);

            if (link.src == null || link.srcName == null || link.dst == null || link.dstName == null) throw this.error("NULL REFERENCE!!!!!!");

        };

        // Cache obtained instances
        let instancesById = {};
        instancesById[tree.root.id] = tree.root;

        // Connect collections with adjacents
        // - For each collection's endpoint obtain adjacent collections
        await _.eachAsync(tree.collections, async collection => {

            let root = instancesById[collection.parent];
            if (!root) {
                [root] = await this.store.search("instances", { id: collection.parent });
                instancesById[root.id] = root;
            }
            let subcomp = root.model.subcomponents[collection.name];
            let con = root.model.connectors[collection.name];
            let subcompType = root.model.imports[subcomp && subcomp.type || con.type];

            if (subcomp) {
                await _.eachAsync(subcompType.endpoints, async (ep, epName) => {

                    // Obtain adjacents
                    let adjacents = await this._findAdjacents({
                        parent: root,
                        subcomponent: collection.name,
                        endpoint: epName
                    });

                    // Add links
                    await _.eachAsync(adjacents, async adjacent => {
                        let link = {
                            id: this.utils.uuid(),
                            protocol: ep.protocol,
                            src: ep.type == "in" ? adjacent.collection.id : collection.id,
                            srcName: adjacent.src,
                            dst: ep.type == "in" ? collection.id : adjacent.collection.id,
                            dstName: adjacent.dst,
                            data: {},
                            state: "ready",
                            last: Date.now()
                        };
                        await insertUnrepeated(link);
                    });
                });
            } else {
                // - obtain protocol from output endpoint
                let outType = root.model.imports[root.model.subcomponents[con.outputs[0].subcomponent].type];
                let protocol = outType.endpoints[con.outputs[0].endpoint].protocol;

                // Obtain in adjacents
                let adjacents = await this._findAdjacents({
                    parent: root,
                    connector: con.name,
                    direction: "in"
                });
                // Add links                    
                await _.eachAsync(adjacents, async adjacent => {
                    let link = {
                        id: this.utils.uuid(),
                        protocol: protocol,
                        src: adjacent.collection.id,
                        srcName: adjacent.src,
                        dst: collection.id,
                        dstName: adjacent.dst,
                        data: {},
                        state: "ready",
                        last: Date.now()
                    };
                    await insertUnrepeated(link);
                });
                // Obtain out adjacents
                adjacents = await this._findAdjacents({
                    parent: root,
                    connector: con.name,
                    direction: "out"
                });
                // Add links
                await _.eachAsync(adjacents, async adjacent => {
                    let link = {
                        id: this.utils.uuid(),
                        protocol: protocol,
                        src: collection.id,
                        srcName: adjacent.src,
                        dst: adjacent.collection.id,
                        dstName: adjacent.dst,
                        data: {},
                        state: "ready",
                        last: Date.now()
                    };
                    await insertUnrepeated(link);
                });

            }

        });

        return {
            root: tree.root,
            collections: tree.collections,
            links: links
        };

    }

    /**
     * Connect collections with links within the parse tree.
     * 
     * @param {Object|string} root - The root instance 
     */
    /*async _connectTree(root) {
        this.log(`_connectTree(${JSON.stringify(root)})`);

        if (_.isString(root)) {
            [root] = await this.store.search("instances", { id: root });
        }

        // 1. Obtain all children collections
        let collections = await this.store.search(
            "collections",
            { parent: root.id }
        );
        this.log(`collections => ${JSON.stringify(collections)}`);

        let links = [];
        let insertUnrepeated = async (link) => {

            // 1. Look for links in inserte links
            if (_.find(
                links,
                l => l.src == link.src &&
                    l.srcName == link.srcName &&
                    l.dst == link.dst &&
                    l.dstName == link.dstName)
            ) return;

            // 2. Look for links in store
            let results = await this.store.search(
                "links",
                {
                    src: link.src, srcName: link.srcName,
                    dst: link.dst, dstName: link.dstName
                }
            );
            if (results.length) return;

            await this.store.insert("links", link);

        };

        // 2. Connect collections with adjacents
        // - For each collection's endpoint obtain adjacent collections
        await _.eachAsync(collections, async collection => {
            let subcomp = root.model.subcomponents[collection.name];
            let con = root.model.connectors[collection.name];
            let subcompType = root.model.imports[subcomp && subcomp.type || con.type];

            if (subcomp) {
                await _.eachAsync(subcompType.endpoints, async (ep, epName) => {

                    // Obtain adjacents
                    let adjacents = await this._findAdjacents({
                        parent: root,
                        subcomponent: collection.name,
                        endpoint: epName
                    });

                    // Add links
                    await _.eachAsync(adjacents, async adjacent => {
                        let link = {
                            id: this.utils.uuid(),
                            protocol: ep.protocol,
                            src: ep.type == "in" ? adjacent.collection.id : collection.id,
                            srcName: adjacent.src,
                            dst: ep.type == "in" ? collection.id : adjacent.collection.id,
                            dstName: adjacent.dst,
                            data: {},
                            state: "ready",
                            last: Date.now()
                        };
                        await insertUnrepeated(link);                        
                    });
                });
            } else {
                // - obtain protocol from output endpoint
                let outType = root.model.imports[root.model.subcomponents[con.outputs[0].subcomponent].type];
                let protocol = outType.endpoints[con.outputs[0].endpoint].protocol;

                // Obtain in adjacents
                let adjacents = await this._findAdjacents({
                    parent: root,
                    connector: con.name,
                    direction: "in"
                });
                // Add links                    
                await _.eachAsync(adjacents, async adjacent => {
                    let link = {
                        id: this.utils.uuid(),
                        protocol: protocol,
                        src: adjacent.collection.id,
                        srcName: adjacent.src,
                        dst: collection.id,
                        dstName: adjacent.dst,
                        data: {},
                        state: "ready",
                        last: Date.now()
                    };
                    await insertUnrepeated(link);
                });
                // Obtain out adjacents
                adjacents = await this._findAdjacents({
                    parent: root,
                    connector: con.name,
                    direction: "out"
                });
                // Add links
                await _.eachAsync(adjacents, async adjacent => {
                    let link = {
                        id: this.utils.uuid(),
                        protocol: protocol,
                        src: collection.id,
                        srcName: adjacent.src,
                        dst: adjacent.collection.id,
                        dstName: adjacent.dst,
                        data: {},
                        state: "ready",
                        last: Date.now()
                    };
                    await insertUnrepeated(link);
                });

            }

        });

        // 3. Obtain all children instances  and go down
        //    the tree
        let children = await this.store.search(
            "instances",
            { parent: root.id, type: "composite" }
        );
        await _.eachAsync(children, async child => {
            await this._connectTree(child);
        });

    }*/


    /**
     * Populate collections with basic instances within the parse 
     * tree.
     * 
     * @param {Object} tree - The tree
     * @param {Object} tree.root - The tree root
     * @param {Object} tree.collections - The tree collections
     * @param {Array<Object>} tree.links - The tree links
     * @return {Array<Object>} The instances created
     */
    async _populateTree(tree) {
        this.log(`_connectTree(${JSON.stringify(tree)})`);

        let instances = [];

        // Apply topological order to graph
        let collections = this._sortTree(tree);

        // Cache parent instances
        let parentsById = {};
        parentsById[tree.root.id] = tree.root;

        // Add basic instances in order
        await _.eachAsync(collections, async collection => {

            let parent = parentsById[collection.parent];
            if (!parent) {
                [parent] = await this.store.search("instances", { id: collection.parent });
                parentsById[parent.id] = parent;
            }

            let subcomp = parent.model.subcomponents[collection.name];
            let con = parent.model.connectors[collection.name];
            let subcompType = parent.model.imports[subcomp && subcomp.type || con.type];

            // Schedule instances
            let scheduler = (subcomp || con).schedule || subcompType.schedule || "basic";
            let events = await this.schedulers[scheduler].schedule({
                parent: parent,
                subcomponent: subcomp ? collection.name : undefined,
                connector: con ? collection.name : undefined
            });

            // Create instances
            await _.eachAsync(events, async event => {
                if (event.type == "InstanceAdd") {
                    let model = await this._resolveModel(subcomp || con, subcompType);
                    let instance = await this._addBasic(
                        parent,
                        collection.name,
                        model,
                        { domain: event.domain }
                    );
                    instances.push(instance);
                }
            });

        });

        return instances;
    }

    /**
     * Sort 
     * 
     * @param {Object} tree - The tree
     * @param {Object} tree.root - The tree root
     * @param {Object} tree.collections - The tree collections
     * @param {Array<Object>} tree.links - The tree links
     * @return {Array<Object>} The sorted collections
     */
    _sortTree(tree) {
        this.log(`_sortTree(${JSON.stringify(tree)})`);

        let sorted = [];
        _.each(tree.collections, collection => {
            collection.visited = false;
        });

        var visitCollection = (collection) => {
            collection.visited = true;
            let adjacents = _.filter(
                tree.links,
                link => link.src == collection.id
            );
            _.each(adjacents, adjacent => {
                if (tree.collections[adjacent.dst] && !tree.collections[adjacent.dst].visited)
                    visitCollection(tree.collections[adjacent.dst]);
            });
            sorted.push(collection);
        };

        _.each(tree.collections, collection => {
            if (!collection.visited) visitCollection(collection);
        });

        _.each(tree.collections, collection => {
            delete collection.visited;
        });

        this.log(`_sortTree() => ${JSON.stringify(sorted)}`);

        return sorted;

    }


    /**
     * Populate collections with basic instances within the parse 
     * tree.
     * 
     * @param {string|Object} root - The root
     *
    async _populateTree(root) {
        this.log(`_connectTree(${JSON.stringify(root)})`);

        if (_.isString(root)) {
            [root] = await this.store.search("instances", { id: root });
        }

        // Apply topological order to graph
        let graph = this._toGraph(root.model);
        let sorted = this._sortGraph(graph);

        // Add basic instances in order
        await _.eachAsync(sorted, async node => {

            let subcomp = root.model.subcomponents[node.name];
            let con = root.model.connectors[node.name];
            let subcompType = root.model.imports[subcomp && subcomp.type || con.type];

            if (subcompType.type == "basic") {

                // Schedule instances
                let scheduler = subcompType.schedule || "basic";
                let events = await this.schedulers[scheduler].schedule({
                    parent: root,
                    subcomponent: node.type == "subcomponent" ? node.name : undefined,
                    connector: node.type == "connector" ? node.name : undefined
                });

                // Create instances
                let promises = [];
                _.each(events, event => {
                    if (event.type == "InstanceAdd") {
                        promises.push(this._addBasic(parent, node.name, subcompType));
                    }
                });
                await Q.waitAll(promises);

            } else if (subcompType.type == "composite") {

                // Obtain composite instances
                let query = { parent: root.id, type: "composite" };
                if (subcomp) query.subcomponent = node.name;
                else query.connector = node.name;

                let composites = this.store.search("instances", query);
                await _.eachAsync(composites, composite => {

                });
            }

        });

    }*/

    /**
     * Add a basic instance.
     * 
     * @param {Object} parent - The parent instance
     * @param {string} name - The subcomponent/connector name
     * @param {Object} model - The instance model
     * @param {string} model.type - The instance type 'basic'
     * @param {string} model.name - The instance name
     * @param {Array<string>} model.labels - The instance labels
     * @param {string} model.durability - The instance durability
     * @param {string} model.cardinality - The instance cardinality
     * @param {string} model.runtime - The instance runtime
     * @param {string} model.source - The instance source
     * @param {Object} model.variables - The instance variables
     * @param {Object} model.volumes - The instance volumes
     * @param {Object} model.events - The instance events
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.domain] - The instance domain
     * @param {string} [opts.addr] - The instance address
     * @param {Array<string>} [opts.labels] - The instance labels
     */
    async _addBasic(parent, name, model, opts, ctxt) {
        this.log(`_addBasic(${parent && parent.id},${name})`);

        opts = opts || {};

        let subcomp = parent.model.subcomponents[name];
        let con = parent.model.connectors[name];

        // 1. Obtain collection
        let [collection] = await this.store.search(
            "collections", { parent: parent.id, name: name }
        );
        if (!collection) throw this.error(`Unable to add basic instance: collection ${name} not found`);

        // 2. Add instance
        let instance = {
            id: this.utils.uuid(),
            type: "basic",
            title: model.title || "",
            parent: parent.id,
            subcomponent: subcomp && name || "",
            connector: con && name || "",
            labels: (model.labels || []).concat(opts.labels || []),
            model: model,
            collection: collection.id,
            domain: opts.domain || "",
            addr: opts.addr || "",
            data: {},
            state: "init",
            last: Date.now()
        };

        await this.store.insert("instances", instance);

        // 3. Update owner collection 

        // - Obtain lock on collection
        let lock = this.utils.uuid();
        collection = await this._loop(async () => {
            try {
                let [_collection] = await this.store.search(
                    "collections", { id: collection.id }, { lock: lock }
                );
                return _collection;
            } catch (err) {
                return false;
            }
        });

        // - Update members list 
        collection.members.push(instance.id);

        // - Unlock collection
        await this.store.update(
            "collections",
            { id: collection.id },
            {
                members: collection.members,
                last: Date.now()
            },
            { unlock: lock }
        );

        return instance;

    }


    /**
     * Resolves the specified model. If the model is incorrect an exception is thrown.
     * 
     * This means:
     * - Propagating properties and variables down in the hierarchy.
     * 
     * @param {Object} deployment - The deployment data
     * @param {string} deployment.name
     * @param {Object} deployment.variables
     * @param {Object} deployment.volumes
     * @param {Object} deployment.entrypoints
     * @param {Array<string>} deployment.domains
     * @param {Object} model - The model
     * @param {string} model.type
     * @param {string} model.name
     * @param {Array<string>} model.labels
     * @param {string} model.cardinality
     * @param {string} model.durability
     * @param {string} model.runtime
     * @param {string} model.source     
     * @param {Object} model.variables
     * @param {Object} model.volumes
     * @param {Object} model.endpoints
     * @param {Object} model.imports
     * @param {Object} model.subcomponents
     * @param {Object} model.connectors
     */
    async _resolveModel(deployment, model) {
        this.log(`_resolveModel(${JSON.stringify(deployment)},${JSON.stringify(model)})`);

        if (_.isString(model)) model = YAML.parse(model);

        // Initialize shared properties
        model.labels = model.labels || [];
        model.variables = model.variables || {};
        model.volumes = model.volumes || {};
        model.endpoints = model.endpoints || {};
        model.domains = model.domains || [];

        // Overwrite model variables (everything else might depend on them)
        let modelVars = {};
        _.each(model.variables, (varVal, varName) => modelVars[varName] = String(varVal));
        let deployVars = {};
        _.each(deployment.variables, (varVal, varName) => deployVars[varName] = String(varVal));
        let variables = {};
        _.merge(variables, modelVars, deployVars);

        let resolved = {
            type: this._text(
                model.type, { eval: variables, att: "type" }
            ),
            title: this._text(
                deployment.title || model.title, { eval: variables, att: "title" }
            ),
            name: this._text(
                deployment.name || model.name, { eval: variables, att: "name" }
            ),
            labels: _.map(
                model.labels.concat(deployment.labels || []),
                label => this._text(
                    label, { eval: variables }
                )
            ),
            cardinality: this._text(
                deployment.cardinality || model.cardinality, { eval: variables, re: "\\[\\d*:\\d*\\]", att: "cardinality" }
            ),
            schedule: this._text(
                deployment.schedule || model.schedule, { eval: variables, att: "schedule" }
            ),
            domains: _.map(
                deployment.domains || model.domains,
                domain => this._text(
                    domain, { eval: variables }
                )
            ),
            variables: variables
        };

        if (resolved.type == "basic") {
            // Resolve basic
            resolved.durability = this._text(
                deployment.durability || model.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
            );
            resolved.runtime = this._text(
                deployment.runtime || model.runtime, { eval: variables, att: "runtime" }
            );
            resolved.source = this._text(
                deployment.source || model.source, { eval: variables, att: "source" }
            );

            resolved.variables = {};
            _.each(variables, (varVal, varName) => {
                resolved.variables[varName] = varVal;
            });

            resolved.events = {};
            _.each(model.events, (evCmd, evName) => {
                resolved.events[evName] = this._text(
                    evCmd, { eval: variables }
                );
            });

            resolved.volumes = {};
            _.each(model.volumes, (vol, volName) => {
                let _vol = {
                    name: volName, // embed name
                    type: this._text(
                        vol.type, { eval: variables, att: "type" }
                    ),
                    path: this._text(
                        vol.path, { eval: variables, att: "path" }
                    ),
                    scope: this._text(
                        vol.scope, { eval: variables, values: ["local", "global"], att: "scope" }
                    ),
                    durability: this._text(
                        vol.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                    ),
                    url: this._text(
                        vol.url, { eval: variables, att: "url" }
                    )
                };
                resolved.volumes[volName] = _vol;
            });

            resolved.endpoints = {};
            _.each(model.endpoints, (ep, epName) => {
                let _ep = {
                    name: epName, // embed name
                    type: this._text(
                        ep.type, { eval: variables, required: true, values: ["in", "out"], att: "type" }
                    ),
                    protocol: this._text(
                        ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                    ),
                    required: this._text(
                        ep.required, { eval: variables, att: "required" }
                    )
                };
                resolved.endpoints[epName] = _ep;
            });

            resolved.entrypoints = {};
            _.each(model.entrypoints, (ep, epName) => {
                let _ep = {
                    name: epName, // embed name                    
                    protocol: this._text(
                        ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                    ),
                    path: this._text(
                        ep.path, { eval: variables, re: "\\/.*", att: "path" }
                    ),
                    mapping: ep.mapping
                };
                resolved.entrypoints[epName] = _ep;
            });


        } else if (resolved.type == "composite") {
            // Resolve composite
            model.subcomponents = model.subcomponents || {};
            model.connectors = model.connectors || {};
            model.imports = model.imports || {};

            // ------------- Resolve imports -------------
            resolved.imports = {};
            let promises = [];

            _.each(model.imports, async (type, typeName) => {
                if (_.isString(type)) {
                    promises.push(this._fetchUrl(type).then(str => { resolved.imports[typeName] = YAML.parse(str); }));
                } else resolved.imports[typeName] = type;
            });

            await Q.waitAll(promises);

            // ------------- Resolve subcomponents -------------
            resolved.subcomponents = {};
            _.each(model.subcomponents, (subcomp, subcompName) => {
                subcomp = _.isString(subcomp) ? { type: subcomp } : subcomp;
                let subcompType = resolved.imports[subcomp.type];
                if (!subcompType) throw this.error(`Error in model: unknown subcomponent type ${subcomp.type}`);

                let _subcomp = {
                    name: subcompName, // embed name
                    type: subcomp.type,
                    labels: _.map(
                        (subcomp.labels || []).concat(resolved.labels || []),
                        label => this._text(
                            label, { eval: variables }
                        )
                    ),
                    cardinality: this._text(
                        subcomp.cardinality, { eval: variables, re: "\\[\\d*:\\d*\\]", att: "cardinality" }
                    ),
                    durability: this._text(
                        subcomp.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                    ),
                    schedule: this._text(  // propagate parent schedule
                        subcomp.schedule || resolved.schedule, { eval: variables, att: "schedule" }
                    ),
                    domains: subcomp.domains || resolved.domains                
                };

                // - Subcomponent variables
                _subcomp.variables = {};
                _.each(subcomp.variables, (varVal, varName) => {
                    if (!subcompType.variables || !(varName in subcompType.variables))
                        throw this.error(`Error in model: variable ${varName} not published by subcomponent ${subcompName}`);
                    _subcomp.variables[varName] = this._text(
                        varVal, { eval: variables }
                    );
                });

                // - Subcomponent volumes
                _subcomp.volumes = {};
                _.each(subcomp.volumes, (vol, volName) => {
                    if (!subcompType.volumes || !subcompType.volumes[volName])
                        throw this.error(`Error in model: volume ${volName} not published by subcomponent ${subcompName}`);
                    let _vol = {
                        name: volName, // embed name
                        type: this._text(
                            vol.type, { eval: variables, att: "type" }
                        ),
                        path: this._text(
                            vol.path, { eval: variables, att: "path" }
                        ),
                        scope: this._text(
                            vol.scope, { eval: variables, values: ["local", "global"], att: "scope" }
                        ),
                        durability: this._text(
                            vol.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                        ),
                        url: this._text(
                            vol.url, { eval: variables, att: "url" }
                        )
                    };
                    _subcomp.volumes[volName] = _vol;
                });
                resolved.subcomponents[subcompName] = _subcomp;
            });

            // ------------- Resolve connectors -------------
            resolved.connectors = {};
            _.each(model.connectors, (con, conName) => {
                if (!con.type) throw this.error(`Error in model: missing type for connector ${conName}`);
                if (con.type != "Link" && !resolved.imports[con.type]) throw this.error(`Error in model: unknown connector type ${con.type}`);
                let _con = {
                    name: conName, // embed name
                    type: con.type,
                    labels: _.map(
                        (con.labels || []).concat(resolved.labels || []),
                        label => this._text(
                            label, { eval: variables }
                        )
                    ),
                    schedule: this._text(  // propagate parent schedule
                        con.schedule || resolved.schedule, { eval: variables, att: "schedule" }
                    ),
                    domains: con.domains || resolved.domains
                };

                // - Validate outputs
                let outProtocol;
                _con.outputs = [];
                if (!con.outputs || !con.outputs.length) throw this.error(`Error in model: orphan connector ${conName} without outputs`);
                if (con.type == "Link" && con.outputs.length > 1) throw this.error(`Error in model: link connector ${conName} can only have one output`);
                _.each(con.outputs, output => {
                    if (_.isString(output)) {
                        let _output = {};
                        [_output.subcomponent, _output.endpoint] = output.split(".");
                        output = _output;
                    }
                    if (!output.subcomponent || !output.endpoint) throw this.error(`Error in model: unsupported endpoint reference ${JSON.stringify(output)} for connector ${conName}`);
                    let outSubcomp = resolved.subcomponents[output.subcomponent];
                    if (!outSubcomp) throw this.error(`Error in model: unresolved endpoint reference ${JSON.stringify(output)} for connector ${conName}`);
                    let outSubcompType = resolved.imports[outSubcomp.type];
                    if (!outSubcompType.endpoints || !outSubcompType.endpoints[output.endpoint]) throw this.error(`Error in model: unresolved endpoint referente ${JSON.stringify(output)} for connector ${conName}`);

                    // - Check output compatibility
                    let outSubcompVars = _.merge({}, outSubcompType.variables, outSubcomp.variables);
                    if (
                        this._text(
                            outSubcompType.endpoints[output.endpoint].type, { eval: outSubcompVars }
                        ) != "in"
                    ) throw this.error(`Error in model: the output of the connector ${conName} must connect to an in endpoint`);

                    if (outProtocol) {
                        if (this._text(
                            outSubcompType.endpoints[output.endpoint].protocol, { eval: outSubcompVars, ignoreCase: true }
                        ) != outProtocol) throw this.error(`Error in model: found incompatible protocols for outputs in connector ${conName}`);
                    } else {
                        outProtocol = this._text(
                            outSubcompType.endpoints[output.endpoint].protocol, { eval: outSubcompVars, ignoreCase: true }
                        );
                    }
                    // everything ok, add output to connector
                    _con.outputs.push({
                        subcomponent: output.subcomponent,
                        endpoint: output.endpoint
                    });

                });

                // - Validate inputs (empty inputs are alowed for composite entry connectors)
                _con.inputs = [];
                if (con.type == "Link" && (!con.inputs || con.inputs.length != 1)) throw this.error(`Error in model: link connector ${conName} can only have one input`);
                if (con.inputs && con.inputs.length) {
                    _.each(con.inputs, input => {
                        if (_.isString(input)) {
                            let _input = {};
                            [_input.subcomponent, _input.endpoint] = input.split(".");
                            input = _input;
                        }
                        if (!input.subcomponent) throw this.error(`Error in model: unsupported endpoint reference ${JSON.stringify(input)} for connector ${conName}`);
                        let inSubcomp = resolved.subcomponents[input.subcomponent];
                        if (!inSubcomp) throw this.error(`Error in model: unresolved endpoint reference ${JSON.stringify(input)} for connector ${conName}`);
                        let inSubcompType = resolved.imports[inSubcomp.type];
                        if (!inSubcompType.endpoints || !inSubcompType.endpoints[input.endpoint]) throw this.error(`Error in model: unresolved endpoint referente ${JSON.stringify(input)} for connector ${conName}`);

                        // - Check input compatibility
                        let inSubcompVars = _.merge({}, inSubcompType.variables, inSubcomp.variables);
                        if (
                            this._text(
                                inSubcompType.endpoints[input.endpoint].type, { eval: inSubcompVars }
                            ) != "out"
                        ) throw this.error(`Error in model: the inputs of the connector ${conName} must connect to an out endpoint`);

                        let inProtocol = this._text(
                            inSubcompType.endpoints[input.endpoint].protocol, { eval: inSubcompVars, ignoreCase: true }
                        );
                        if (outProtocol != inProtocol) throw this.error(`Error in model: found incompatible protocols for inputs/outputs in connector ${conName}`);

                        // everything ok, add input to connector
                        _con.inputs.push({
                            subcomponent: input.subcomponent,
                            endpoint: input.endpoint
                        });
                    });
                } else {
                    // If empty inputs we need to check whether it is a composite entry connector
                    let publishedEpName;
                    let publishedEp = _.find(model.endpoints, (ep, epName) => {
                        if (ep.mapping == conName) { publishedEpName = epName; return true; }
                        else return false;
                    });
                    // - If no defined inputs and not an entrypoint, then error
                    if (!publishedEp) throw this.error(`Error in model: orphan connector ${conName} without inputs`);
                    if (
                        this._text(
                            publishedEp.type, { eval: variables }
                        ) != "in"
                    ) throw this.error(`Error in model: connector ${conName} type does not match published endpoint ${publishedEpName}`);
                    if (
                        this._text(
                            publishedEp.protocol, { eval: variables }
                        ) != outProtocol
                    ) throw this.error(`Error in model: connector ${conName} protocol does not match published endpoint ${publishedEpName}`);

                }

                if (con.type != "Link") {

                    let conType = resolved.imports[con.type]

                    // - Connector variables
                    _con.variables = {};
                    _.each(con.variables, (varVal, varName) => {
                        if (!conType.variables || !conType.variables[varName])
                            throw this.error(`Error in model: variable ${varName} not published by connector ${conName}`);
                        _con.variables[varName] = this._text(
                            varVal, { eval: variables }
                        );
                    });

                    // - Connector volumes
                    _con.volumes = {};
                    _.each(con.volumes, (vol, volName) => {
                        if (!conType.volumes || !conType.volumes[volName])
                            throw this.error(`Error in model: volume ${volName} not published by connector ${conName}`);
                        let _vol = {
                            name: volName, // embed name
                            type: this._text(
                                vol.type, { eval: variables, att: "type" }
                            ),
                            path: this._text(
                                vol.path, { eval: variables, att: "path" }
                            ),
                            scope: this._text(
                                vol.scope, { eval: variables, values: ["local", "global"], att: "scope" }
                            ),
                            durability: this._text(
                                vol.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                            ),
                            url: this._text(
                                vol.url, { eval: variables, att: "url" }
                            )
                        };
                        _con.volumes[volName] = _vol;
                    });
                }

                // Append new connector to resolved model
                resolved.connectors[conName] = _con;

            });

            // ------------- Resolve endpoints -------------
            resolved.endpoints = {};
            _.each(model.endpoints, (ep, epName) => {
                if (!ep.mapping) throw this.error(`Error in model: missing mapping in endpoint ${epName}`);
                let _ep = {
                    name: epName, // embed name
                    type: this._text(
                        ep.type, { eval: variables, required: true, values: ["in", "out"], att: "type" }
                    ),
                    protocol: this._text(
                        ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                    ),
                    required: this._text(
                        ep.required, { eval: variables, att: "required" }
                    )
                };
                if (_ep.type == "in") {
                    _ep.mapping = ep.mapping;
                    let mappedCon = resolved.connectors[_ep.mapping];
                    if (!mappedCon) throw this.error(`Error in model: wrong mapping of published endpoint ${epName}`);
                    let mappedSubcomp = resolved.subcomponents[mappedCon.outputs[0].subcomponent];
                    let mappedSubcompType = resolved.imports[mappedSubcomp.type];
                    let subcompVars = _.merge({}, mappedSubcompType.variables, mappedSubcomp.variables);
                    if (!mappedSubcompType.endpoints[mappedCon.outputs[0].endpoint]) throw this.error(`Error in model: unresolved mapping of published endpoint ${epName}`);
                    if (this._text(
                        mappedSubcompType.endpoints[mappedCon.outputs[0].endpoint].protocol, { eval: subcompVars }
                    ) != _ep.protocol)
                        throw this.error(`Error in model: incompatible protocols of published endpoint ${epName} and mapped connector`);
                } else if (_ep.type == "out") {
                    _ep.mapping = [];
                    let mappings = _.isString(ep.mapping) && ep.mapping.split(",") || (_.isArray(ep.mapping) && ep.mapping) || [ep.mapping];
                    _.each(mappings, mapping => {
                        if (_.isString(mapping)) {
                            let [subcomp, endpoint] = mapping.split(".");
                            _ep.mapping.push({ subcomponent: subcomp, endpoint: endpoint });
                        } else {
                            _ep.mapping.push(mapping);
                        }
                    });
                    _.each(_ep.mappings, mapping => {
                        if (!mapping.subcomponent || !mapping.endpoint) throw this.error(`Error in model: unsupported mapping for endpoint ${epName}`);
                        let mappedSubcomp = resolved.subcomponents[mapping.subcomponent];
                        if (!mappedSubcomp) throw this.error(`Error in model: wrong mapping of published endpoint ${epName}`);
                        let mappedSubcompType = resolved.imports[mappedSubcomp.type];
                        let subcompVars = _.merge({}, mappedSubcompType.variables, mappedSubcomp.variables);
                        if (!mappedSubcompType.endpoints[mapping.endpoint]) throw this.error(`Error in model: wrong mapping of published endpoint ${epName}`);
                        if (this._text(
                            mappedSubcompType.endpoints[mapping.endpoint].protocol, { eval: subcompVars }
                        ) != _ep.protocol) throw this.error(`Error in model: incompatible protocols of published endpoint ${epName} and mapped endpoint`);
                    });

                } else throw this.error(`Error in model: unsupported endpoint type ${_ep.type} of published endpoint ${epName}`);
                resolved.endpoints[epName] = _ep;
            });

            // ------------- Resolve entrypoints -------------
            resolved.entrypoints = {};
            _.each(deployment.entrypoints, (ep, epName) => {
                if (!ep.mapping) throw this.error(`Error in model: missing mapping in entrypoint ${epName}`);

                let _ep = {
                    name: epName,
                    protocol: this._text(
                        ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                    ),
                    path: this._text(
                        ep.path, { eval: variables, re: "\\/.*", att: "path" }
                    )
                };

                if (["http", "https"].includes(_ep.protocol) && !_ep.path) throw this.error(`Error in model: missing path in entrypoint ${epName}`);
                let input = resolved.endpoints[ep.mapping];
                if (!input) throw this.error(`Error in model: unresolved mapping in entrypoint ${epName}`);

                let con = resolved.connectors[input.mapping];
                let conType = resolved.imports[con.type];

                // Propagate entrypoint down
                _ep.mapping = _.findKey(conType.endpoints, ep => ep.type == "in");
                con.entrypoints = con.entrypoints || {};
                con.entrypoints[epName] = _ep;

                let entrypoint = {
                    name: epName, // embed name                    
                    protocol: _ep.protocol,
                    path: _ep.path,
                    mapping: ep.mapping
                };
                resolved.entrypoints[epName] = _ep;
            });

            console.log(JSON.stringify(resolved, undefined, 3));


            /*// ------------- Resolve volumes -------------
            _.each(deployment.volumes, (vol, volName) => {
                if (!model.volumes[volName]) throw this.error(`Error in model: undefined volume ${volName}`);
                let [subcompName, subcompVol] = model.volumes[volName].mapping.split(".");
                if (!subcompVol) throw error(`Error in model: wrong volume mapping ${volName}`);
                resolved.subcomponents[subcompName].volumes[subcompVol].scope = vol.scope;
                resolved.subcomponents[subcompName].volumes[subcompVol].durability = vol.durability;
                resolved.subcomponents[subcompName].volumes[subcompVol].url = vol.url;
            });*/


        } else throw this.error(`Error in model: unsupported component type ${resolved.type}`);
        return resolved;


    }


    /**
     * Find the collections adjacent to a given one in the parse tree.
     * 
     * Next we summarize the rules for obtaining the adjacents of an output
     * endpoint
     * 
     * 
     * 
     * @param {Object} opts - The options
     * @param {Object|string} opts.parent - The parent instance
     * @param {string} [opts.subcomponent] - The subcomponent name
     * @param {string} [opts.connector] - The connector name
     * @param {string} [opts.endpoint] - The endpoint name (if subcomponent)
     * @param {string} [opts.direction] - The adjacency direction mode ('in', 'out', 'all')
     */
    async _findAdjacents(opts) {
        this.log(`_findAdjacents(${opts.parent.id || opts.parent},${opts.subcomponent || opts.connector},${opts.endpoint},${opts.direction})`);

        opts = opts || {};
        if (!opts.parent) throw this.error(`Unable to find adjacents: missing parent instance`);
        if (!opts.subcomponent && !opts.connector) throw this.error(`Unable to find adjacents: missing subcomponent/connector name`);;

        let parent = opts.parent;
        if (_.isString(opts.parent)) {
            [parent] = await this.store.search(
                "instances", { id: opts.parent }
            );
            if (!parent) throw this.error(`Unable to find adjacents: parent instance not found`);
        }

        let subcomp, con, subcompType, endpoint;
        if (opts.subcomponent) {
            // Find subcomponent
            subcomp = parent.model.subcomponents[opts.subcomponent];
            if (!subcomp) throw this.error(`Unable to find adjacents: subcomponent ${opts.subcomponent} not found`);
            subcompType = parent.model.imports[subcomp.type];
            // Find endpoint
            if (!opts.endpoint) throw this.error(`Unable to find adjacents: missing subcomponent endpoint`);
            endpoint = subcompType.endpoints[opts.endpoint];
            if (!endpoint) throw this.error(`Unable to find adjacents: endpoint ${opts.endpoint} not found`);
            opts.direction = endpoint.type;
        }
        if (opts.connector) {
            con = parent.model.connectors[opts.connector];
            if (!con) throw this.error(`Unable to find adjacents: connector ${opts.connector} not found`);
            subcompType = parent.model.imports[con.type];
            opts.direction = opts.direction || "out";
        }

        let results = [];
        if (opts.direction == "out") {

            // 1. Look for all adjacent components
            let adjacents = [];
            if (subcomp) {
                _.each(
                    _.filter( // look for all directly connected connectors
                        parent.model.connectors,
                        con => _.find(
                            con.inputs,
                            (input) => input.subcomponent == opts.subcomponent &&
                                input.endpoint == opts.endpoint
                        )
                    ),
                    con => {
                        if (con.type == "Link") {
                            let adjacent = {
                                name: con.outputs[0].subcomponent,
                                endpoint: con.outputs[0].endpoint,
                            };
                            adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                            adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                            adjacents.push(adjacent);
                        } else {
                            let adjacent = {
                                name: con.name,
                                connector: con
                            };
                            adjacent.type = parent.model.imports[con.type];
                            for (let epName in adjacent.type.endpoints) {
                                let ep = adjacent.type.endpoints[epName];
                                if (ep.type == "in") {
                                    adjacent.endpoint = epName;
                                    break;
                                }
                            }
                            if (!adjacent.endpoint) throw this.error(`Unable to find adjacents: input endpoint of connector ${con.name} not found`);
                            adjacents.push(adjacent);
                        }
                    }
                );
            } else {
                _.each(
                    con.outputs,
                    output => {
                        let adjacent = {
                            name: output.subcomponent,
                            endpoint: output.endpoint
                        };
                        adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                        adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                        adjacents.push(adjacent);
                    }
                );
            }

            // 2. Find collections attached to all adjacents
            await _.eachAsync(adjacents, async adjacent => {

                if (adjacent.type.type == "basic") {
                    // case subcomponent 1,2 - connector 1
                    // (adjacent is basic)
                    let [collection] = await this.store.search(
                        "collections", {
                        parent: parent.id,
                        name: adjacent.name
                    }
                    );
                    //if (collection) results.push(collection);

                    if (collection) {
                        let result = {
                            collection: collection,
                            dst: adjacent.endpoint
                        };
                        if (subcomp) result.src = opts.endpoint;
                        else {
                            for (let epName in subcompType.endpoints) {
                                let ep = subcompType.endpoints[epName];
                                if (ep.type == "out") {
                                    result.src = epName;
                                    break;
                                }
                            }
                        }
                        results.push(result);
                    }

                } else if (adjacent.type.type == "composite") {
                    // case subcomponent 3,2 - connector 2
                    // (adjacent is composite)
                    let query = { parent: parent.id };
                    if (adjacent.subcomponent) query.subcomponent = adjacent.name;
                    else query.connector = adjacent.name;
                    let composites = await this.store.search("instances", query);
                    await _.eachAsync(composites, async composite => {
                        // look for composite entrypoint
                        let conName = adjacent.type.endpoints[adjacent.endpoint].mapping;
                        let [collection] = await this.store.search(
                            "collections", {
                            parent: composite.id,
                            name: conName
                        }
                        );
                        //if (collection) results.push(collection);
                        if (collection) {
                            let result = {
                                collection: collection,
                                dst: adjacent.endpoint
                            };
                            if (subcomp) {
                                result.src = opts.endpoint;
                            } else {
                                for (let epName in subcompType.endpoints) {
                                    let ep = subcompType.endpoints[epName];
                                    if (ep.type == "out") {
                                        result.src = epName;
                                        break;
                                    }
                                }
                            }
                            results.push(result);
                        }

                    });
                }

            });

            // 3. Look for composite mappings
            //   case subcomponent 4
            if (parent.parent) {
                let mappedEP = _.find(
                    parent.model.endpoints,
                    ep => ep.type == "out" &&
                        _.find(
                            ep.mapping,
                            mapping => mapping.subcomponent == opts.subcomponent &&
                                mapping.endpoint == opts.endpoint
                        )
                );
                if (mappedEP) {
                    let collections = await this._findAdjacents({
                        parent: parent.parent,
                        subcomponent: parent.subcomponent,
                        connector: parent.connector,
                        direction: "out",
                        endpoint: mappedEP.name
                    });
                    _.each(collections, collection => {
                        collection.src = opts.endpoint;
                    });
                    Array.prototype.push.apply(results, collections);
                }
            }

        } else if (opts.direction == "in") {

            // 1. Look for all adjacent components
            let adjacents = [];
            if (subcomp) {
                _.each(
                    _.filter( // look for all directly connected connectors
                        parent.model.connectors,
                        con => _.find(
                            con.outputs,
                            (output) => output.subcomponent == opts.subcomponent &&
                                output.endpoint == opts.endpoint
                        )
                    ),
                    con => {
                        if (con.type == "Link") {
                            let adjacent = {
                                parent: parent,
                                name: con.inputs[0].subcomponent,
                                endpoint: con.inputs[0].endpoint,
                            };
                            adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                            adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                            adjacents.push(adjacent);
                        } else {
                            let adjacent = {
                                parent: parent,
                                name: con.name,
                                connector: con
                            };
                            adjacent.type = parent.model.imports[con.type];
                            for (let epName in adjacent.type.endpoints) {
                                let ep = adjacent.type.endpoints[epName];
                                if (ep.type == "out") {
                                    adjacent.endpoint = epName;
                                    break;
                                }
                            }
                            if (!adjacent.endpoint) throw this.error(`Unable to find adjacents: output endpoint of connector ${con.name} not found`);
                            adjacents.push(adjacent);
                        }
                    }
                );
            } else {
                _.each(
                    con.inputs,
                    input => {
                        let adjacent = {
                            parent: parent,
                            name: input.subcomponent,
                            endpoint: input.endpoint
                        };
                        adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                        adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                        adjacents.push(adjacent);
                    }
                );
            }

            // 2. Find collections attached to all adjacents
            while (adjacents.length) {

                // Get next adjacent
                let adjacent = adjacents.shift();

                this.log(` --> PROCESSING adjacent: parent=${adjacent.parent.id},name=${adjacent.name},endpoint=${adjacent.endpoint},type=${adjacent.type.name}`);

                if (adjacent.type.type == "basic") {
                    // case subcomponent 1,2 - connector 1
                    // (adjacent is basic)
                    let [collection] = await this.store.search(
                        "collections", {
                        parent: adjacent.parent.id,
                        name: adjacent.name
                    }
                    );
                    //if (collection) results.push(collection);
                    if (collection) {
                        let result = {
                            collection: collection,
                            src: adjacent.endpoint
                        };
                        for (let epName in subcompType.endpoints) {
                            let ep = subcompType.endpoints[epName];
                            if (ep.type == "in") {
                                result.dst = epName;
                                break;
                            }
                        }
                        results.push(result);
                    }

                } else if (adjacent.type.type == "composite") {
                    // case subcomponent 3,2 - connector 2
                    // (adjacent is composite)

                    // Obtain all composite instances
                    let query = { parent: parent.id, type: "composite" };
                    if (adjacent.subcomponent) query.subcomponent = adjacent.name;
                    else query.connector = adjacent.name;
                    let composites = await this.store.search("instances", query);

                    _.each(composites, composite => {
                        this.log(`------> Processing composite ${composite.subcomponent} -> ${JSON.stringify(composite.model)}`);

                        _.each(
                            composite.model.endpoints[adjacent.endpoint].mapping,
                            mapping => {
                                this.log(`----------> Processing mapping ${JSON.stringify(mapping)}`);
                                let _adjacent = {
                                    parent: composite.id,
                                    name: mapping.subcomponent,
                                    endpoint: mapping.endpoint,
                                    type: composite.model.imports[composite.model.subcomponents[mapping.subcomponent].type]
                                };
                                adjacents.push(_adjacent);
                            }
                        );

                    });

                }

            }
            // 3. Look for composite mappings
            //   case connector 3
            if (opts.connector && parent.parent) {
                let mappedEP = _.find(
                    parent.model.endpoints,
                    ep => ep.type == "in" && ep.mapping == opts.connector
                );
                if (mappedEP) {
                    let collections = await this._findAdjacents({
                        parent: parent.parent,
                        subcomponent: parent.subcomponent,
                        connector: parent.connector,
                        direction: "in",
                        endpoint: mappedEP.name
                    });
                    _.each(collections, collection => {
                        for (let epName in subcompType.endpoints) {
                            let ep = subcompType.endpoints[epName];
                            if (ep.type == "in") {
                                collection.dst = epName;
                                break;
                            }
                        }
                    });
                    Array.prototype.push.apply(results, collections);
                }
            }

        }
        this.log(`_findAdjacents() => ${JSON.stringify(results)}`);

        return results;

    }

    /**
     * Find the collections adjacent to a given one in the parse tree.
     * 
     * Next we summarize the rules for obtaining the adjacents of an output
     * endpoint
     * 
     * 
     * 
     * @param {Object} opts - The options
     * @param {Object|string} opts.parent - The parent instance
     * @param {string} [opts.subcomponent] - The subcomponent name
     * @param {string} [opts.connector] - The connector name
     * @param {string} [opts.endpoint] - The endpoint name (if subcomponent)
     * @param {string} [opts.direction] - The adjacency direction mode ('in', 'out', 'all')
     *
    async _findAdjacents(opts) {
        this.log(`_findAdjacents(${opts.parent.id || opts.parent},${opts.subcomponent || opts.connector},${opts.endpoint})`);

        opts = opts || {};
        if (!opts.parent) throw this.error(`Unable to find adjacents: missing parent instance`);
        if (!opts.subcomponent && !opts.connector) throw this.error(`Unable to find adjacents: missing subcomponent/connector name`);;

        let parent = opts.parent;
        if (_.isString(opts.parent)) {
            [parent] = await this.store.search(
                "instances", { id: opts.parent }
            );
            if (!parent) throw this.error(`Unable to find adjacents: parent instance not found`);
        }

        let subcomp, con, subcompType, endpoint;
        if (opts.subcomponent) {
            // Find subcomponent
            subcomp = parent.model.subcomponents[opts.subcomponent];
            if (!subcomp) throw this.error(`Unable to find adjacents: subcomponent ${opts.subcomponent} not found`);
            subcompType = parent.model.imports[subcomp.type];
            // Find endpoint
            if (!opts.endpoint) throw this.error(`Unable to find adjacents: missing subcomponent endpoint`);
            endpoint = subcompType.endpoints[opts.endpoint];
            if (!endpoint) throw this.error(`Unable to find adjacents: endpoint ${opts.endpoint} not found`);
            opts.direction = endpoint.type;
        }
        if (opts.connector) {
            con = parent.model.connectors[opts.connector];
            if (!con) throw this.error(`Unable to find adjacents: connector ${opts.connector} not found`);
            subcompType = parent.model.imports[con.type];
            opts.direction = opts.direction || "out";
        }

        let results = [];
        if (opts.direction == "out") {

            // 1. Look for all adjacents
            let adjacents = [];
            if (subcomp) {
                _.each(
                    _.filter( // look for all directly connected connectors
                        parent.model.connectors,
                        con => _.find(
                            con.inputs,
                            (input) => input.subcomponent == opts.subcomponent &&
                            input.endpoint == opts.endpoint
                        )
                    ),
                    con => {
                        if (con.type == "Link") {
                            let adjacent = {
                                name: con.outputs[0].subcomponent,
                                endpoint: con.outputs[0].endpoint,
                            };
                            adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                            adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                            adjacents.push(adjacent);
                        } else {
                            let adjacent = {
                                name: con.name,
                                connector: con
                            };
                            adjacent.type = parent.model.imports[con.type];
                            adjacent.endpoint = _.find(
                                adjacent.type.endpoints,
                                ep => ep.type == "in"
                            );
                            if (!adjacent.endpoint) throw this.error(`Unable to find adjacents: input endpoint of connector ${con.name} not found`);
                            adjacent.endpoint = adjacent.endpoint.name;
                            adjacents.push(adjacent);
                        }
                    }
                );
            } else {
                _.each(
                    con.outputs,
                    output => {
                        let adjacent = {
                            name: output.subcomponent,
                            endpoint: output.endpoint
                        };
                        adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                        adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                        adjacents.push(adjacent);
                    }
                );
            }

            // 2. Find collections attached to all adjacents
            _.each(adjacents, async adjacent => {

                if (adjacent.type.type == "basic") {
                    // case subcomponent 1,2 - connector 1
                    // (adjacent is basic)
                    let [collection] = await this.store.search(
                        "collections", {
                            parent: parent.id,
                            name: adjacent.name
                        }
                    );
                    if (collection) results.push(collection);

                } else if (adjacent.type.type == "composite") {
                    // case subcomponent 3,2 - connector 2
                    // (adjacent is composite)
                    let query = { parent: parent.id };
                    if (adjacent.subcomponent) query.subcomponent = adjacent.subcomponent;
                    else query.connector = adjacent.connector;
                    let [composite] = await this.store.search("instances", query);
                    if (composite) {
                        // look for composite entrypoint
                        let conName = adjacent.type.endpoints[adjacent.endpoint].mapping;
                        let [collection] = await this.store.search(
                            "collections", {
                                parent: composite.id,
                                name: conName
                            }
                        );
                        if (collection) adjacents.push(collection);
                    }
                }

            });

            // 3. Look for composite mappings
            //   case subcomponent 4
            if (parent.parent) {
                let mappedEP = _.find(
                    parent.model.endpoints,
                    ep => ep.type == "out" &&
                    _.find(
                        ep.mapping,
                        mapping => mapping.subcomponent == opts.subcomponent &&
                        mapping.endpoint == opts.endpoint
                    )
                );
                if (mappedEP) {
                    let collections = await this._findAdjacents({
                        parent: parent.parent,
                        subcomponent: parent.subcomponent,
                        connector: parent.connector,
                        direction: "out",
                        endpoint: mappedEP.name
                    });
                    Array.prototype.push.apply(results, collections);
                }
            }

        } else if (opts.direction == "in") {

            // 1. Look for all adjacents
            let adjacents = [];
            if (subcomp) {
                _.each(
                    _.filter( // look for all directly connected connectors
                        parent.model.connectors,
                        con => _.find(
                            con.outputs,
                            (output) => output.subcomponent == opts.subcomponent &&
                            output.endpoint == opts.endpoint
                        )
                    ),
                    con => {
                        if (con.type == "Link") {
                            let adjacent = {
                                parent: parent,
                                name: con.inputs[0].subcomponent,
                                endpoint: con.inputs[0].endpoint,
                            };
                            adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                            adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                            adjacents.push(adjacent);
                        } else {
                            let adjacent = {
                                parent: parent,
                                name: con.name,
                                connector: con
                            };
                            adjacent.type = parent.model.imports[con.type];
                            adjacent.endpoint = _.find(
                                adjacent.type.endpoints,
                                ep => ep.type == "out"
                            );
                            if (!adjacent.endpoint) throw this.error(`Unable to find adjacents: output endpoint of connector ${con.name} not found`);
                            adjacent.endpoint = adjacent.endpoint.name;
                            adjacents.push(adjacent);
                        }
                    }
                );
            } else {
                _.each(
                    con.inputs,
                    input => {
                        let adjacent = {
                            parent: parent,
                            name: input.subcomponent,
                            endpoint: input.endpoint
                        };
                        adjacent.subcomponent = parent.model.subcomponents[adjacent.name];
                        adjacent.type = parent.model.imports[adjacent.subcomponent.type];
                        adjacents.push(adjacent);
                    }
                );
            }

            // 2. Find collections attached to all adjacents
            while (adjacents.length) {

                // Get next adjacent
                let adjacent = adjacents.shift();

                if (adjacent.type.type == "basic") {
                    // case subcomponent 1,2 - connector 1
                    // (adjacent is basic)
                    let [collection] = await this.store.search(
                        "collections", {
                            parent: adjacent.parent.id,
                            name: adjacent.name
                        }
                    );
                    if (collection) results.push(collection);

                } else if (adjacent.type.type == "composite") {
                    // case subcomponent 3,2 - connector 2
                    // (adjacent is composite)
                    _.each(
                        adjacent.type.endpoints[adjacent.type.endpoint].mapping,
                        async mapping => {
                            let _adjacent = {
                                name: mapping.subcomponent,
                                endpoint: mapping.endpoint
                            };
                            let query = { parent: parent.id };
                            if (adjacent.subcomponent) query.subcomponent = adjacent.subcomponent;
                            else query.connector = adjacent.connector;
                            [_adjacent.parent] = await this.search(
                                "instances", { parent: parent.id, name: adjacent.name }
                            );
                            if (_adjacent.parent) {
                                _adjacent.type = _adjacent.parent.model.imports[_adjacent.parent.model.subcomponents[mapping.subcomponent].type];
                            }
                            adjacents.push(_adjacent);
                        }
                    );
                }

            }
            // 3. Look for composite mappings
            //   case connector 3
            if (opts.connector && parent.parent) {
                let mappedEP = _.find(
                    parent.model.endpoints,
                    ep => ep.type == "in" && ep.mapping == opts.connector
                );
                if (mappedEP) {
                    let collections = await this._findAdjacents({
                        parent: parent.parent,
                        subcomponent: parent.subcomponent,
                        connector: parent.connector,
                        direction: "in",
                        endpoint: mappedEP.name
                    });
                    Array.prototype.push.apply(results, collections);
                }
            }

        }
        this.log(`_findAdjacents() => ${JSON.stringify(results)}`);

        return results;

    }*/

    /**
     * Evaluates all the properties of the specified model.
     * 
     * @param {Object} deployment - The deployment data
     * @param {Object} model - The model
     * @param {Object} ctxt - Additional context to evaluate
     */
    _evalModel(deployment, model, ctxt) {
        this._evalModel(`_evalModel(${JSON.stringify(model)},${JSON.stringify(ctxt)})`);

    }

    /**
     * Obtain resource from url.
     * 
     * @param {string} url - The file URL
     */
    async _fetchUrl(url) {
        this.log(`_fetchUrl(${url})`);

        let [schema, path] = url.split("://");
        if (!path) throw error(`Unable to fetch url ${url}: unsupported url`);

        let deferred = Q.defer();
        switch (schema) {
            case "file":
                fs.readFile(path, (err, data) => {
                    if (err) deferred.reject(this.error(`Error fetching url ${url}`, err));
                    else deferred.resolve(data.toString());
                });
                break;
            case "http":
            case "https":
                axios(url)
                    .then(resp => deferred.resolve(resp.data))
                    .catch(err => deferred.reject(this.error(`Error fetching url ${url}`, err)));
                break;
            default:
                throw this.error(`Unable to fetch: url ${url}: unsupported schema ${schema}`);

        }

        return deferred.promise;
    }


    /**
     * Obtains the graph of collections starting from
     * the given root instance.
     * 
     * @param {string|Object} root - The starting root instance
     * @param {Object} [opts] - Additional options
     * @param {boolean} [opts.basic] - Include basic instances
     * @param {boolean} [opts.composite] - Include composite instances
     * @return {Object} The graph {root, collections, links, instances}
     */
    async _toGraph(root, opts) {
        this.log(`_toGraph(${root.id || root},${JSON.stringify(opts)})`);

        opts = opts || {};

        if (_.isString(root)) {
            [root] = await this.store.search("instances", { id: root });
            if (!root) throw this.error(`Unable to transform to graph: root instance not found`);
        }

        let graph = { root: root, collections: {}, links: [], instances: {} };

        let queue = [root];
        while (queue.length) {
            root = queue.shift();
            let collections = await this.store.search("collections", { parent: root.id });
            await _.eachAsync(
                collections,
                async collection => {
                    graph.collections[collection.id] = collection;
                    let links = await this.store.search("links", { src: collection.id });
                    Array.prototype.push.apply(
                        graph.links,
                        links
                    );
                    links = await this.store.search("links", { dst: collection.id });
                    Array.prototype.push.apply(
                        graph.links,
                        links
                    ); _
                });

            // search children
            let query = { parent: root.id };
            if (!opts.basic) query.type = "composite";

            let children = await this.store.search("instances", query);
            _.each(children, child => {
                if (child.type == "composite") queue.push(child);
                if (opts.basic && child.type == "basic") graph.instances[child.id] = child;
                if (opts.composite && child.type == "basic") graph.instances[child.id] = child;
            });
        }

        graph.links = _.uniqBy(graph.links, link => link.id);
        return graph;
    }



    /**
     * Convert model to simple graph of nodes.
     * 
     * @param {Object} model 
     *
    _toGraph(model) {
        this.log(`_toGraph()`);
        let graph = { nodes: {}, edges: [] };
        _.each(model.subcomponents, (subcomp, subcompName) => {
            graph.nodes[subcompName] = { type: "subcomponent", name: subcompName };
        })
        _.each(model.connectors, (con, conName) => {
            if (con.type == "Link") {
                graph.edges.push({
                    src: con.inputs[0].subcomponent,
                    dst: con.outputs[0].subcomponent
                });
            } else {
                graph.nodes[conName] = { type: "connector", name: conName };
                _.each(con.inputs, input => {
                    graph.edges.push({
                        src: input.subcomponent,
                        dst: conName
                    });
                });
                _.each(con.outputs, output => {
                    graph.edges.push({
                        src: conName,
                        dst: output.subcomponent
                    });
                });
            }
        });
        return graph;
    }*/

    /**
     * Sort the specified graph (using topological order), obtaining a sorted 
     * list of nodes.
     *
     * @param {Object} graph - The graph to sort
     * @return {Array<Object>} The sorted nodes
     *
    _sortGraph(graph) {
        this.log(`_sortGraph()`);

        let sorted = [];

        _.each(graph.nodes, node => {
            node.visited = false;
        });

        var visitNode = (node) => {
            node.visited = true;
            let adjacents = _.filter(graph.edges, edge => edge.src == node.name);
            _.each(adjacents, adjacent => {
                if (!graph.nodes[adjacent.dst].visited) visitNode(graph.nodes[adjacent.dst]);
            });
            sorted.push(node);
        };

        _.each(graph.nodes, node => {
            if (!node.visited) visitNode(node);
        });

        _.each(graph.nodes, node => {
            delete node.visited;
        });

        this.log(`_sortGraph() => ${JSON.stringify(sorted)}`);

        return sorted;
    }*/

    /**
     * Check value is valid.
     * 
     * @param {string} val - Value to check
     * @param {Object} opts - Additional options
     * @param {string} opts.att - Attribute name (for error message)
     * @param {boolean} opts.required - Force value
     * @param {Array<string>} opts.values - Valid values
     * @param {RegExp} opts.re - Regular expression to check against
     * @param {boolean} opts.ignoreCase - Case insensitive
     *
    _value(val, opts) {  
        opts = opts || {};
        if (opts.required && !val) throw new Error("Value required" + (opts.att? ` for attribute ${att}`: ""));
        if (opts.values) {
            if (opts.values.find(v => (opts.ignoreCase? v.toLowerCase() == val.toLowerCase(): v == val)))
                return opts.ignoreCase? val.toLowerCase(): val;
            else throw this.error(`Unsupported value ${val}` + (opts.att? ` for attribute ${att}`: ""));
        }  else if (opts.re) {
            opts.re = _.isRegExp(opts.re)? opts.re: new RegExp(opts.re, "g");
            if (opts.re.test(val)) return opts.ignoreCase? val.toLowerCase(): val;
            else throw new Error(`Unsupported format ${val}` + (opts.att? ` for attribute ${att}`: ""));
        }  
        else return opts.ignoreCase? val.toLowerCase(): val;
    }*/

    /**
     * Obtain validated text.
     * 
     * @param {string} val - Value to check
     * @param {Object} opts - Additional options
     * @param {string} opts.att - Attribute name (for error message)
     * @param {boolean} opts.required - Force value
     * @param {Array<string>} opts.values - Valid values
     * @param {RegExp} opts.re - Regular expression to check against
     * @param {boolean} opts.ignoreCase - Case insensitive
     * @param {Object} opts.vars - Expand variables
     * @param {Object} opts.eval - Evaluate expressions
     */
    _text(val, opts) {
        this.log(`_text(${val},${JSON.stringify(opts)})`);
        opts = opts || {};
        if (opts.required && !val) throw new Error("Value required" + (opts.att ? ` for attribute ${opts.att}` : ""));
        if (!val) return val;

        // Expand variables
        if (opts.vars) {
            let re = /\{\{([^\}]*)\}\}/g;
            let reResult;
            let str = val;
            while ((reResult = re.exec(val)) !== null) {
                let paramName = reResult[1].trim();
                paramName = opts.ignoreCase ? paramName.toLowerCase() : paramName;
                if (opts.vars[paramName]) {
                    let repl = new RegExp('{{' + reResult[1] + '}}', (opts.ignoreCase ? 'ig' : 'g'));
                    str = str.replace(repl, opts.vars[paramName]);
                }
            }
            val = _.replace(str, /\{\{([^\}]*)\}\}/g, ""); // replace unresolved vars by empty string
        } else if (opts.eval) {
            let re = /\{\{([^\}]*)\}\}/g;
            let reResult;
            let str = val;
            while ((reResult = re.exec(val)) !== null) {
                let expression = reResult[1];
                this.log(`evaluating '${expression}' with context ${JSON.stringify(opts.eval)}`);
                let result = vm.runInNewContext(expression, opts.eval);
                this.log(`result is '${result}'`);

                //let repl = new RegExp('{{' + expression + '}}', 'g');
                str = str.replace(`{{${expression}}}`, result);
            }
            val = str;
        }

        // Check values (only if no variables are present)
        let re = /\{\{([^\}]*)\}\}/g;
        if (opts.values && !re.test(val)) {
            if (opts.values.find(v => (opts.ignoreCase ? v.toLowerCase() == val.toLowerCase() : v == val)))
                return opts.ignoreCase ? val.toLowerCase() : val;
            else throw this.error(`Unsupported value ${val}` + (opts.att ? ` for attribute ${opts.att}` : ""));
        } else if (opts.re && !re.test(val)) {
            opts.re = _.isRegExp(opts.re) ? opts.re : new RegExp(opts.re, "g");
            if (opts.re.test(val)) return opts.ignoreCase ? val.toLowerCase() : val;
            else throw new Error(`Unsupported format ${val}` + (opts.att ? ` for attribute ${opts.att}` : ""));
        } else return opts.ignoreCase ? val.toLowerCase() : val;
    }

    /**
     * Execute the provided function a number of times
     * 
     * @param {Function} fn - The function to execute
     * @param {Object} [opts] - Additional options
     * @param {number} [opts.retry] - The retry timeout (default 5s)
     * @param {number} [opts.count] - Max number of retries
     * @param {number} [opts.timeout] - Max waiting time (default 5m)
     */
    _loop(fn, opts) {
        this.log(`loop(${JSON.stringify(opts)})`);
        opts = opts || {};
        opts.retry = opts.retry || 5000;
        opts.timeout = opts.timeout || 300000;

        let deferred = Q.defer();
        let count = 0,
            ts = Date.now();
        let wrappedFn = async () => {
            let result;
            try {
                result = await fn();
            } catch (err) {
                deferred.reject(err);
                return;
            }
            if (result) deferred.resolve(result);
            else {
                if (opts.count) {
                    count++;
                    if (count == opts.count) {
                        deferred.reject(new Error("Loop operation exceeded maximum number of retries"));
                        return;
                    }
                }
                if (opts.timeout && Date.now() - ts > opts.timeout) {
                    deferred.reject(new Error("Loop operation expired timeout"));
                    return;
                }
                setTimeout(wrappedFn, opts.retry);
            }
        }
        wrappedFn();
        return deferred.promise;
    }

    async _tree(rootId) {

        let query = {};
        if (rootId) query.id = rootId;
        else query.parent = "";
        let [root] = await this.store.search("instances", query);
        if (!root) throw this.error(`Unable to print tree: root not found`);

        let str = `[${root.subcomponent || root.connector}]`;
        let queue = [{ prefix: "", instance: root }];

        let collectionsById = {};

        while (queue.length) {
            let node = queue.shift();
            if (node.collection) {
                let instances = await this.store.search("instances", { collection: node.collection.id });
                let i = 0;
                _.each(instances, instance => {
                    str += `<${node.prefix}.${i++}>`;
                });
            } else {
                let collections = await this.store.search("collections", { parent: node.instance.id });
                _.each(collections, collection => {
                    collectionsById[collection.id] = collection;
                    collectionsById[collection.id].prefix = node.prefix;
                    str += `(${node.prefix}.${collection.name})`;
                    queue.push({ prefix: `${node.prefix}.${collection.name}`, collection: collection });
                });
                let instances = await this.store.search("instances", { parent: node.instance.id, type: "composite" });
                _.each(instances, instance => {
                    str += `[${node.prefix}.${instance.subcomponent || instance.connector}]`;
                    queue.push({ prefix: `${node.prefix}.${instance.subcomponent || instance.connector}`, instance: instance });
                });
            }
        }

        let str2 = "";
        let links = await this.store.search("links");
        _.each(links, link => {
            str2 += `(${collectionsById[link.src].prefix}.${collectionsById[link.src].name}->${collectionsById[link.dst].prefix}.${collectionsById[link.dst].name}})`;
        });

        return `nodes = ${str}, edges=${str2}`;

    }


}


module.exports = (...opts) => {
    return new ComponentService(...opts);
}