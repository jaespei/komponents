const _ = require("lodash");
const Q = require("q");

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

_.eachAsync = async (col, fn) => {
    if (col) {
        if (_.isArray(col)) {
            for (let i = 0; i < col.length; i++) await fn(col[i], i);
        } else {
            for (let key in col) await fn(col[key], key);
        }
    }
};

/**
 * Daemon responsible for syncing the main graph and its
 * projections on all available domains.
 * 
 * To that end the daemon gets activated periodically and 
 * looks for recent significant updates on collections and
 * links.
 * 
 * For each updated collection:
 * - 
 * 
 * This daemon runs periodically and has the following 
 * responsibilities:
 * - Check the component controller graph matches the 
 *   projections on all domains.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class ProjectionDaemon {

    /**
     * Initializes the daemon. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} services - The available services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     * @param {Object} opts - Additional options
     */
    constructor(services, store, utils, opts) {
        if (!store) throw this.error("Unable to initialize ProjectionDaemon: missing store");
        if (!services) throw this.error("Unable to initialize ProjectionDaemon: missing services");
        if (!utils) throw this.error("Unable to initialize ProjectionDaemon: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.log = utils && utils.log || ((msg) => console.log("[ProjectionDaemon] " + msg));
        this.opts = opts || {};
        this.opts.interval = this.opts.interval || this.utils.constants.DAEMON_INTERVAL;
        this.opts.timeFrame = this.opts.timeFrame || this.utils.constants.DAEMON_TIMEFRAME;
    }

    /**
     * Start the daemon.
     */
    start() {
        this.log("start()");

        if (this.running) return;
        this.running = true;

        setTimeout(this.run.bind(this), this.opts.interval);

        /*if (this.intervalID) return;

        this.intervalID = setInterval(
            this.run.bind(this),
            this.opts.interval
        );*/

    }

    /**
     * Execute all tests.
     */
    async run() {
        this.log("run()");

        // 0. Create common context, to share domains/collections
        try {

            // 1. Sync all collections
            let ctxt = {
                domains: {},
                collections: {}
            };
            await this._syncCollections({}, ctxt);

            // 2. Sync domain instances
            ctxt = {
                domains: {},
                collections: {}
            };
            await this._syncInstances({}, ctxt);

        } catch (err) {
            this.log(err.stack);
        } finally {
            // program next run
            if (this.running) setTimeout(this.run.bind(this), this.opts.interval);
        }

    }

    /**
     * Stop de daemon.
     */
    stop() {
        this.log("stop()");

        this.running = false;

        /*if (!this.intervalID) return;

        cancelInterval(this.intervalID);
        delete this.intervalID;*/

    }


    /**
     * Synchronizes the specified collection.
     * 
     * If the collection has been added, add it to all domains
     * If the collection has been removed, remove it from all domains
     * If the collection has been updated, keep it synced with all domains 
     * 
     * @param {Object} [opts] - Additional options
     * @param {number} [opts.timeFrame] 
     * @param {Array<string>|Array<Object>} [opts.collections] - The collections to sync
     */
    async _syncCollections(opts, ctxt) {
        this.log(`_syncCollections(${JSON.stringify(opts)})`);

        opts = opts || {};
        ctxt = ctxt || {};
        ctxt.collections = ctxt.collections || {};

        // Obtain collections to sync
        let collections = [];
        if (opts.collections) {
            if (_.isString(opts.collections)) {
                opts.collections = opts.collections.split(",");
            } else if (!_.isArray(opts.collections)) opts.collections = [opts.collections];
            if (_.isString(opts.collections[0])) {
                collections = await this._findInCollection("collections", opts.collections, ctxt);
            } else collections = opts.collections;
        } else {
            // Obtain recently updated collections ...
            let query = {};
            if (opts.timeFrame) query.last = { $gte: Date.now() - opts.timeFrame };
            collections = await this._findInCollection("collections", query, ctxt);
        }

        // 1. Remove collections
        let toRemove = _.filter(
            collections,
            col => col.state == "destroy"
        );
        let promises = [];
        for (let col of toRemove) {
            let promise = this._removeCollection(col, ctxt);
            promises.push(promise);
        }
        await Q.waitAll(promises);

        // 2. Add collections
        let toAdd = _.filter(
            collections,
            col => col.state == "init"
        );
        promises = [];
        for (let col of toAdd) {
            let promise = this._addCollection(col, ctxt);
            promises.push(promise);
        }
        await Q.waitAll(promises);

        // 3. Add links
        // - First source links
        promises = [];
        for (let col of toAdd) {
            let promise = this._addLinks(col, "src", ctxt);
            promises.push(promise);
        }
        await Q.waitAll(promises);
        // - Later destination links
        promises = [];
        for (let col of toAdd) {
            let promise = this._addLinks(col, "dst", ctxt);
            promises.push(promise);
        }
        await Q.waitAll(promises);

        // 4. Update collections
        let toUpdate = _.filter(
            collections,
            col => col.state == "ready"
        ).concat(toAdd);
        promises = [];
        for (let col of toUpdate) {
            let promise = this._updateCollection(col, ctxt);
            promises.push(promise);
        }
        await Q.waitAll(promises);

    }

    /**
     * Syncs all aspects of the specified collection. It is a 
     * last resource operation.
     * 
     * @param {Object} collection - The collection to sync
     * @param {Object} ctxt - The operation context
     */
    async syncCollection(collection, ctxt) {
        this.log(`syncCollection(${JSON.stringify(collection)})`);

        await this._addCollection(collection, ctxt);

        await this._addLinks(collection, "src", ctxt);
        await this._addLinks(collection, "dst", ctxt);

        await this._updateCollection(collectio, ctxt);

    }

    /**
     * Add the specified collection to the domains.
     * 
     * @param {string|Object} collection - The collection
     * @param {Object} ctxt - The operation context
     */
    async _addCollection(collection, ctxt) {
        this.log(`addCollection(${JSON.stringify(collection)})`);

        ctxt = ctxt || {};
        ctxt.domains = ctxt.domains || {};

        if (_.isString(collection)) {
            [collection] = await this._findInCollection("collections", [collection], ctxt);
            if (!collection) throw this.error(`Unable to add collection: collection ${collection} not found`);
        }

        // Obtain target domains
        let domains;
        if (collection.domains.length) {
            let ids = _.difference(
                collection.domains,
                _.keys(ctxt.domains)
            );
            if (ids.length) {
                domains = await this.services.domain.listDomains({ id: { $in: ids }, state: "ready" });
                Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
            }
            domains = _.map(collection.domains, id => ctxt.domains[id]);
        } else {
            domains = await this.services.domain.listDomains({ state: "ready" });
            Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
        }

        // Obtain domain collections
        let domCollections = await this.services.domain.listCollections(
            { labels: { $any: [`id=${collection.id}`] } }
        );
        domCollections = _.keyBy(
            domCollections,
            col => col.domain
        );

        // Add the collection to those domains where it is missing
        let toAdd = _.difference(
            _.map(domains, dom => dom.id),
            _.keys(domCollections)
        );
        /*let promises = []
        for (let id of toAdd) {
            // - Create collection in each domain
            let promise = this._execTransaction(async () => {
                let tx = await this.services.domain.addCollection(
                    id,
                    {
                        labels: [`id=${collection.id}`],
                        proxy: collection.addr ? true : false,
                        proxyAddr: collection.addr || "",
                        publish: collection.publish && collection.publishInputs || undefined,
                        inputs: collection.inputs,
                        outputs: collection.outputs,
                        name: collection.name
                    }
                );
                return tx;
            });
            promises.push(promise);
        }
        await Q.waitAll(promises);*/
        let added = [];
        try {
            for (let id of toAdd) {
                // - Create collection in each domain
                await this._execTransaction(async () => {
                    let tx = await this.services.domain.addCollection(
                        id,
                        {
                            labels: [`id=${collection.id}`],
                            proxy: collection.addr ? true : false,
                            proxyAddr: collection.addr || "",
                            publish: collection.publish && collection.publishInputs || undefined,
                            inputs: collection.inputs,
                            outputs: collection.outputs,
                            name: collection.name
                        }
                    );
                    return tx;
                });
                added.push(id);
            }

            // - Mark collection as "ready"
            if (collection.state == "init") {
                await this.store.update(
                    "collections",
                    { id: collection.id },
                    { state: "ready", last: Date.now() }
                );
            }
        } catch (err) {
            this.log(err.stack);
            // undo added ??
            throw err;
        }

    }

    /**
     * Add all links connected to the specified collection
     * to all involved domains.
     * 
     * @param {Object} collection - The collection
     * @param {string} direction - "src" or "dst"
     * @param {Object} ctxt - The operation context
     */
    async _addLinks(collection, direction, ctxt) {
        this.log(`_addLinks(${JSON.stringify(collection)},${direction})`);

        ctxt = ctxt || {};
        ctxt.domains = ctxt.domains || {};

        if (_.isString(collection)) {
            [collection] = await this._findInCollection("collections", [collection], ctxt);
            if (!collection) throw this.error(`Unable to add collection: collection ${collection} not found`);
        }

        // Obtain collection links
        let query = {};
        if (direction == "src") query.src = collection.id;
        else if (direction == "dst") query.dst = collection.id;

        let links = await this.store.search("links", query);
        if (!links.length) return;

        // index by id
        links = _.keyBy(
            links,
            link => link.id
        );

        // Obtain target domains
        let domains;
        if (collection.domains.length) {
            let ids = _.difference(
                collection.domains,
                _.keys(ctxt.domains)
            );
            if (ids.length) {
                domains = await this.services.domain.listDomains({ id: { $in: ids }, state: "ready" });
                Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
            }
            domains = _.map(collection.domains, id => ctxt.domains[id]);
        } else {
            domains = await this.services.domain.listDomains({ state: "ready" });
            Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
        }

        /*let promises = [];
        for (let dom of domains) {

            // Cache domain collections
            let ids = _.reduce(links, (ids, link) => {
                if (!ids.includes(link.src)) ids.push(link.src);
                if (!ids.includes(link.dst)) ids.push(link.dst);
                return ids;
            }, []);
            let domCollections = await this.services.domain.listCollections(
                { domain: dom.id, labels: { $any: _.map(ids, id => `id=${id}`) } }
            );
            domCollections = _.keyBy(
                domCollections,
                col => _.find(col.labels, label => label.startsWith("id=")).slice("id=".length)
            );

            // Obtain domain links
            let domLinks = await this.services.domain.listLinks(
                { domain: dom.id, labels: { $any: _.map(links, link => `id=${link.id}`) } }
            );
            domLinks = _.keyBy(
                domLinks,
                link => _.find(link.labels, label => label.startsWith("id=")).slice("id=".length)
            );
            let toAdd = _.difference(
                _.keys(links),
                _.keys(domLinks)
            );
            for (let id of toAdd) {

                let promise = this._execTransaction(async () => {
                    // - add link
                    let tx = await this.services.domain.addLink({
                        labels: [`id=${id}`],
                        src: {
                            collection: domCollections[links[id].src].id,
                            name: links[id].srcName
                        },
                        dst: {
                            collection: domCollections[links[id].dst].id,
                            name: links[id].dstName
                        }
                    });
                    return tx;
                });
                promises.push(promise);
            }

        }
        await Q.waitAll(promises);*/
        try {
            for (let dom of domains) {

                try {

                // Cache domain collections
                let ids = _.reduce(links, (ids, link) => {
                    if (!ids.includes(link.src)) ids.push(link.src);
                    if (!ids.includes(link.dst)) ids.push(link.dst);
                    return ids;
                }, []);
                let domCollections = await this.services.domain.listCollections(
                    { domain: dom.id, labels: { $any: _.map(ids, id => `id=${id}`) } }
                );
                domCollections = _.keyBy(
                    domCollections,
                    col => _.find(col.labels, label => label.startsWith("id=")).slice("id=".length)
                );

                // Obtain domain links
                let domLinks = await this.services.domain.listLinks(
                    { domain: dom.id, labels: { $any: _.map(links, link => `id=${link.id}`) } }
                );
                domLinks = _.keyBy(
                    domLinks,
                    link => _.find(link.labels, label => label.startsWith("id=")).slice("id=".length)
                );
                let toAdd = _.difference(
                    _.keys(links),
                    _.keys(domLinks)
                );
                for (let id of toAdd) {

                    await this._execTransaction(async () => {
                        // - add link
                        let tx = await this.services.domain.addLink({
                            labels: [`id=${id}`],
                            src: {
                                collection: domCollections[links[id].src].id,
                                name: links[id].srcName
                            },
                            dst: {
                                collection: domCollections[links[id].dst].id,
                                name: links[id].dstName
                            }
                        });
                        return tx;
                    });

                }

                } catch(err) {
                    this.log(err.stack);
                    // throw err; ¿? undo??
                }

            }
        } catch (err) {
            this.log(err.stack);
            // undo??
            throw err;
        }

    }


    /**
     * Update the specified collection in the domains.
     * The following strategy is followed:
     * - For instance added to the deployment model, it is added to the main projection
     * - For every instance failed/destroyed in the deployment model, it is removed from the main projection
     * - All secondary projections are synced 
     * 
     * @param {Object} collection - The collection
     * @param {Object} ctxt - The operation context
     */
    async _updateCollection(collection, ctxt) {
        this.log(`_updateCollection(${JSON.stringify(collection)})`);

        ctxt = ctxt || {};
        ctxt.domains = ctxt.domains || {};

        if (_.isString(collection)) {
            [collection] = await this._findInCollection("collections", [collection], ctxt);
            if (!collection) throw this.error(`Unable to add collection: collection ${collection} not found`);
        }

        // Obtain collection members
        let instances = await this._findInCollection("instances", collection.members, ctxt);
        instances = _.keyBy(
            instances,
            inst => inst.id
        );

        // 1. ---- Add new instances (instances need addr) -----------
        let toAdd = _.filter(
            instances,
            inst => inst.state == "init"
        );

        this.log(` --------> adding instances ${_.map(toAdd, inst => inst.id)}`);

        /* ------ async version
        let domInstances = {}, promises = [];
        for (let inst of toAdd) {

            // - check instance domain
            let dom;
            if (!inst.domain) {
                let candidates = await this.services.domain.listDomains(
                    {
                        runtimes: { $any: [inst.model.runtime] },
                        state: "ready"
                    }
                );
                if (!candidates.length) continue;  // no available domain

                // - select domain randomly
                let index = Math.floor(candidates.length * Math.random());
                inst.domain = candidates[index].id;
            }

            // - obtain domain collection
            let [domCol] = await this.services.domain.listCollections(
                {
                    domain: inst.domain,
                    labels: { $any: [`id=${collection.id}`] }
                }
            );
            if (!domCol) throw this.error(`Unable to update collection: collection ${collection.id} not found in domain ${inst.domain}`);

            // - add instance to domain collection
            let promise = this._execTransaction(async () => {
                // - add instance
                let tx = await this.services.domain.addInstance(
                    domCol.id,
                    {
                        labels: [`id=${inst.id}`, `collection=${collection.id}`],
                        proxy: false,
                        runtime: inst.model.runtime,
                        source: inst.model.source,
                        durability: inst.model.durability || "ephemeral",
                        events: inst.model.events || {}
                    }
                );
                return tx;
            }).then(async tx => {

                // - obtain instance addr
                let [domInst] = await this.services.domain.listInstances({
                    labels: { $any: [`id=${inst.id}`] }
                });
                domInstances[inst.id] = domInst;

                // - update instance addr/state
                inst.addr = domInst.addr;
                inst.proxyAddr = domInst.proxyAddr;
                await this.store.update(
                    "instances",
                    { id: inst.id },
                    {
                        domain: inst.domain,
                        addr: inst.addr,
                        proxyAddr: inst.proxyAddr,
                        state: "ready",
                        last: Date.now()
                    }
                );

            }).catch(async err => {

                this.log(err.stack);

                // - update instance state
                await this.store.update(
                    "instances",
                    { id: inst.id },
                    { state: "failed", last: Date.now() }
                );

            })
            promises.push(promise);
        }
        await Q.waitAll(promises);*/

        let domInstances = {};
        for (let inst of toAdd) {

            // - check instance domain
            let dom;
            if (!inst.domain) {
                let query = {runtimes: { $any: [inst.model.runtime] }, state: "ready" };
                if (inst.model.domains && inst.model.domains.length) {
                    query.id = { $in: inst.model.domains };
                }
                let candidates = await this.services.domain.listDomains(query);
                if (!candidates.length) continue;  // no available domain

                // - select domain randomly
                let index = Math.floor(candidates.length * Math.random());
                inst.domain = candidates[index].id;
            }

            // - obtain domain collection
            let [domCol] = await this.services.domain.listCollections(
                {
                    domain: inst.domain,
                    labels: { $any: [`id=${collection.id}`] }
                }
            );
            if (!domCol) throw this.error(`Unable to update collection: collection ${collection.id} not found in domain ${inst.domain}`);

            try {
                // - add instance to domain collection
                await this._execTransaction(async () => {
                    // - add instance
                    let tx = await this.services.domain.addInstance(
                        domCol.id,
                        {
                            labels: [`id=${inst.id}`, `collection=${collection.id}`],
                            proxy: false,
                            runtime: inst.model.runtime,
                            source: inst.model.source,
                            durability: inst.model.durability || "ephemeral",
                            variables: inst.model.variables || {},
                            events: inst.model.events || {}
                        }
                    );
                    return tx;
                });

                // - obtain instance addr
                let [domInst] = await this.services.domain.listInstances({
                    labels: { $any: [`id=${inst.id}`] }
                });
                domInstances[inst.id] = domInst;

                // - update instance addr/state
                inst.addr = domInst.addr;
                inst.proxyAddr = domInst.proxyAddr;
                await this.store.update(
                    "instances",
                    { id: inst.id },
                    {
                        domain: inst.domain,
                        addr: inst.addr,
                        proxyAddr: inst.proxyAddr,
                        state: "ready",
                        last: Date.now()
                    }
                );

            } catch (err) {

                this.log(err.stack);

                // - update instance state
                await this.store.update(
                    "instances",
                    { id: inst.id },
                    { state: "failed", last: Date.now() }
                );

                inst.state = "failed";
            }
        }


        // 2. ---- Remove failed/destroyed instances -----------
        let toRemove = _.filter(
            instances,
            inst => inst.state == "failed" || inst.state == "destroy"
        );

        this.log(` --------> removing instances ${_.map(toRemove, inst => inst.id)}`);

        /* -------- async version
        promises = [];
        for (let inst of toRemove) {

            // - obtain domain instance
            let [domInst] = await this.services.domain.listInstances(
                {
                    domain: inst.domain,
                    labels: { $any: [`id=${inst.id}`] }
                }
            );
            if (!domInst) throw this.error(`Unable to update collection: instance ${inst.id} not found in domain ${inst.domain}`);

            // - remove native instance from domain collection
            let promise = this._execTransaction(async () => {
                // - add instance
                let tx = await this.services.domain.removeInstance(domInst.id);
                return tx;
            }).then(async tx => {

                // - update collection
                // - obtain lock on collection
                let lock = this.utils.uuid();
                collection = await this._loop(async () => {
                    let [collection] = await this.store.search(
                        "collections", { id: inst.collection }, { lock: lock }
                    );
                    if (!collection) throw this.error(`Unable to remove instance: owner collection not found`);
                    return collection;
                });

                // - Update members list 
                let index = collection.members.indexOf(inst.id);
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
                );

                // - delete instance
                await this.store.delete("instances", { id: inst.id });

            }).catch(err => {
                this.log(`message=${err.message},stack=${err.stack}`);

            });
            promises.push(promise);
        }
        await Q.waitAll(promises);*/

        for (let inst of toRemove) {

            // - obtain domain instance
            let [domInst] = await this.services.domain.listInstances(
                {
                    domain: inst.domain,
                    labels: { $any: [`id=${inst.id}`] }
                }
            );
            if (!domInst) throw this.error(`Unable to update collection: instance ${inst.id} not found in domain ${inst.domain}`);

            try {
                // - remove native instance from domain collection
                await this._execTransaction(async () => {
                    // - add instance
                    let tx = await this.services.domain.removeInstance(domInst.id);
                    return tx;
                });

                // - update collection
                // - obtain lock on collection
                let lock = this.utils.uuid();
                collection = await this._loop(async () => {
                    let [collection] = await this.store.search(
                        "collections", { id: inst.collection }, { lock: lock }
                    );
                    if (!collection) throw this.error(`Unable to remove instance: owner collection not found`);
                    return collection;
                });

                // - Update members list 
                let index = collection.members.indexOf(inst.id);
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
                );

                // - delete instance
                await this.store.delete("instances", { id: inst.id });

            } catch (err) {
                this.log(`message=${err.message},stack=${err.stack}`);

            };
        }

        // 3. ---- Sync members -----------
        // Obtain target domains
        let domains;
        if (collection.domains.length) {
            let ids = _.difference(
                collection.domains,
                _.keys(ctxt.domains)
            );
            if (ids.length) {
                domains = await this.services.domain.listDomains({ id: { $in: ids }, state: "ready" });
                Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
            }
            domains = _.map(collection.domains, id => ctxt.domains[id]);
        } else {
            domains = await this.services.domain.listDomains({ state: "ready" });
            Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
        }

        let promises = [];
        for (let dom of domains) {

            // - Obtain domain collection
            let [domCol] = await this.services.domain.listCollections(
                {
                    domain: dom.id,
                    labels: { $any: [`id=${collection.id}`] }
                }
            );

            if (!domCol) continue;

            // - Obtain domain instances
            let domInstances = await this.services.domain.listInstances(
                { id: { $in: domCol.members } }
            );

            // - Index by id
            domInstances = _.keyBy(
                domInstances,
                inst => _.find(inst.labels, label => label.startsWith("id=")).slice("id=".length)
            );
            // - remove useless and failed proxies
            let toRemove = _.difference(
                _.keys(domInstances),
                collection.members
            ).concat(
                _.filter(
                    _.keys(domInstances),
                    id => { domInstances[id].state == "failed" }
                )
            );
            // - add new and previously failed proxies
            let toAdd = _.difference(
                collection.members,
                _.keys(domInstances)
            ).concat(
                _.filter(
                    _.filter(
                        _.keys(domInstances),
                        id => { domInstances[id].state == "failed" }
                    )
                )
            );

            this.log(` --------> [domain ${dom.id}] removing proxies ${toRemove}`);
            let removePromises = [];
            for (let id of toRemove) {
                let promise = this._execTransaction(async () => {
                    // - add proxy instance
                    let tx = await this.services.domain.removeInstance(
                        domInstances[id].id
                    );
                    return tx;
                });
                removePromises.push(promise);
            }

            promises.push(
                Q.waitAll(removePromises)
                    .then(res => {
                        this.log(` --------> [domain ${dom.id}] adding proxies ${toAdd}`);
                        let addPromises = [];
                        for (let id of toAdd) {
                            let promise = this._execTransaction(async () => {
                                // - add proxy instance
                                let tx = await this.services.domain.addInstance(
                                    domCol.id,
                                    {
                                        addr: instances[id].addr,
                                        labels: [`id=${id}`, `collection=${instances[id].collection}`],
                                        proxy: true,
                                        proxyTarget: instances[id].proxyAddr
                                    }
                                );
                                return tx;
                            });
                            addPromises.push(promise);
                        }
                        return Q.waitAll(addPromises);
                    })
            );

        }
        await Q.waitAll(promises);

    }

    /**
     * Remove the specified collection from the domains.
     * 
     * @param {Object} collection - The collection
     * @param {Object} ctxt - The operation context
     */
    async _removeCollection(collection, ctxt) {
        this.log(`_removeCollection(${JSON.stringify(collection)})`);

        if (_.isString(collection)) {
            [collection] = await this._findInCollection("collections", [collection], ctxt);
            if (!collection) throw this.error(`Unable to add collection: collection ${collection} not found`);
        }

        ctxt = ctxt || {};
        ctxt.domains = ctxt.domains || {};

        // Obtain all domain collections
        let domCollections = await this.services.domain.listCollections(
            { labels: { $any: [`id=${collection.id}`] } }
        );

        // Remove all domain collections
        let promises = [];
        for (let domCol of domCollections) {
            let promise = this._execTransaction(async () => {
                let tx = await this.services.domain.removeCollection(domCol.id);
                return tx;
            });
            promises.push(promise);
        }
        await Q.waitAll(promises);


        // Delete collection from store
        await this.store.delete("collections", { id: collection.id });

        // Delete all links from store
        await this.store.delete("links", { src: collection.id });
        await this.store.delete("links", { dst: collection.id });

    }

    /**
     * Detect domain instances which require sync.
     * 
     * The following strategy is followed:
     * - Instances failed in the main projection are marked as failed in the deployment model
     * - Proxies failed in secondary projections are removed
     * - The involved collections are synced (this involves creating/destroying proxies)
     * 
     * @param {Object} opts - Additional options
     * @param {Object} ctxt - The operation context
     */
    async _syncInstances(opts, ctxt) {
        this.log(`_syncInstances(${JSON.stringify(opts)})`);

        ctxt = ctxt || {};

        // Obtain failed instances in projections
        let domInstances = await this.services.domain.listInstances(
            { state: "failed" }
        );
        if (!domInstances.length) return;

        // Obtain instances to remove
        let toRemove = _.map(
            _.filter(
                domInstances,
                domInst => !domInst.proxy
            ),
            domInst => _.find(domInst.labels, label => label.startsWith(`id=`)).slice("id=".length)
        );
        if (toRemove.length) {
            await this.store.update(
                "instances",
                { id: { $in: toRemove } },
                { state: "failed" }
            );
        }

        // Obtain proxies to remove
        toRemove = _.filter(
            domInstances,
            domInst => domInst.proxy
        );
        let promises = [];
        for (let domInst of toRemove) {
            let promise = this._execTransaction(async () => {
                let tx = await this.services.domain.removeInstance(domInst.id);
                return tx;
            });
            promises.push(promise);
        }
        await Q.waitAll(promises);

        // Sync all involved collections
        let ids = _.uniq(
            _.map(
                domInstances,
                domInst => _.find(domInst.labels, label => label.startsWith(`collection=`)).slice("collection=".length)
            )
        );
        if (ids.length) {
            let toUpdate = await this._findInCollection(
                "collections",
                ids,
                ctxt
            );
            promises = [];
            for (let col of toUpdate) {
                let promise = this._updateCollection(col, ctxt);
                promises.push(promise);
            }
            await Q.waitAll(promises);
        }

    }


    /**
     * Search elements in a collection, considering previously cached 
     * results.
     * 
     * @param {string} collection - The collection
     * @param {Array<string>|Object} query - List of ids or query
     * @param {Object} ctxt - The operation context
     * @return {Array<Object>} The operation results
     */
    async _findInCollection(collection, query, ctxt) {
        this.log(`_findInCollection(${JSON.stringify(collection)},${JSON.stringify(query)})`);

        if (!collection) throw this.error(`Unable to find in collection: missing collection`);
        query = query || {};
        ctxt = ctxt || {};
        ctxt[collection] = ctxt[collection] || {};

        let results;
        if (_.isArray(query)) {
            let ids = query;
            ids = _.difference(ids, _.keys(ctxt[collection]));
            if (ids.length) {
                results = await this.store.search(collection, { id: { $in: ids } });
                Object.assign(ctxt[collection], _.keyBy(results, result => result.id));
            }
            results = _.map(query, id => ctxt[collection][id]);
        } else {
            results = await this.store.search(collection, query);
            Object.assign(ctxt[collection], _.keyBy(results, result => result.id));
        }
        return results;
    }

    /**
     * Execute and wait for the specified transaction completion.
     * 
     * @param {Funcion|string} tx - The transaction operation or identifier
     * @param {Object} [opts] - Additional options
     * 
     */
    async _execTransaction(tx, opts) {
        if (!tx) throw this.error(`Unable to execute transaction: missing transaction`);
        opts = opts || {};

        if (_.isFunction(tx)) {
            tx = await tx();
        }

        let result = await this._loop(async () => {
            let [result] = await this.services.domain.listTransactions({ id: tx });
            if (!result) this.throw(`Unable to wait for transaction: transaction ${tx} not found`);
            if (result.state == this.utils.constants.TRANSACTION_STATE_COMPLETED) return result;
            else if (result.state == this.utils.constants.TRANSACTION_STATE_ABORTED) throw this.error(JSON.parse(result.err));
        });
    }

    /**
     * Execute the provided function a number of times
     * 
     * @param {Function} fn - The function to execute
     * @param {Object} [opts] - Additional options
     * @param {number} [opts.retry] - The retry timeout (default 5s)
     * @param {number} [opts.count] - Max number of retries
     * @param {number} [opts.timeout] - Max waiting time (default 15m)
     */
    _loop(fn, opts) {
        this.log(`loop(${JSON.stringify(opts)})`);
        opts = opts || {};
        opts.retry = opts.retry || 5000;
        opts.timeout = opts.timeout || 900000;

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




}


module.exports = (...opts) => {
    return new ProjectionDaemon(...opts);
}