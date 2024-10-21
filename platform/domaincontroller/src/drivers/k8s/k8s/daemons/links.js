const _ = require("lodash");
const k8s = require('@kubernetes/client-node');
const streams = require("memory-streams");
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

/**
 * Daemon responsible for detecting changes in collection outputs
 * and notifying all involved peers.
 * 
 * To that end the daemon gets activated periodically and
 * looks for recent significant updates on collections
 * and links.
 * 
 * For each updated collection:
 * - All source collections are obtained. 
 * - For each source collection the set of targets is calculated.
 * - The targets of the source collections' instance members are synced
 *   
 * For each updated link:
 * - If the link has been added/removed, the source collections are synced
 * 
 */
class LinksDaemon {

    /**
     * Initialize daemon.
     * 
     * @param {Object} store - The store
     * @param {Object} utils - Utilities
     * @param {Object} opts - Additional options
     */
    constructor(store, utils, opts) {
        if (!store) throw new Error("Unable to initialize LinksDaemon: missing store");
        if (!utils) throw new Error("Unable to initialize LinksDaemon: missing utilities");
        this.store = store;
        this.utils = utils;
        this.opts = opts;
        this.error = utils.error;
        this.log = utils.log || ((msg) => console.log("[LinksDaemon] " + msg));
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

        /*if (this.intervalID) return;

        this.intervalID = setInterval(
            this.run.bind(this),
            this.opts.interval
        );*/
        setTimeout(this.run.bind(this), this.opts.interval);

    }

    async run() {

        // 0. Create common context, to share collections/instances
        let ctxt = {
            domains: {},
            collections: {},
            instances: {}
        };

        try {
            // 1. Get instances to sync from updated collections
            let sync = await this._syncCollections({}, ctxt);

            // 2. Get instances to sync from updated links
            _.merge(
                sync,
                await this._syncLinks({}, ctxt)
            );

            // 3. Sync instances
            await this._syncInstances(sync, ctxt);

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
     * Sync  
     * 
     * @param {Object} [opts] - Additional options
     * @param {number} [opts.timeFrame] 
     * @param {Array<string>|Array<Object>} [opts.collections] - The collections to sync
     * @param {Array<string>|Array<Object>} [opts.domains] - The domains to sync
     * @param {Object} ctxt - Operation context
     */
    async _syncCollections(opts, ctxt) {
        this.log(`_syncCollections(${JSON.stringify(opts)})`);

        opts = opts || {};
        ctxt = ctxt || {};
        ctxt.domains = ctxt.domains || {};
        ctxt.collections = ctxt.collections || {};
        ctxt.instances = ctxt.instances || {};

        // Obtain collections to sync
        let collections = [];
        if (opts.collections) {
            if (_.isString(opts.collections)) {
                opts.collections = opts.collections.split(",");
            } else if (!_.isArray(opts.collections)) opts.collections = [opts.collections];
            if (_.isString(opts.collections[0])) {
                collections = await this._findInCollection("collections", opts.collection, ctxt);
            } else collections = opts.collections;
        } else {

            // Obtain domains to sync
            let domains = [];
            if (opts.domains) {
                if (_.isString(opts.domains)) {
                    opts.domains = opts.domains.split(",");
                } else if (!_.isArray(opts.domains)) opts.domains = [opts.domains];
                if (_.isString(opts.domains[0])) {
                    domains = await this._findInCollection("domains", opts.domains, ctxt);
                } else domains = opts.domains;
            } else {
                domains = _.filter(
                    await this._findInCollection("domains", { state: "ready" }, ctxt),
                    dom => dom.type.includes("k8s")
                );
            }

            // No k8s domains, exit
            if (!domains.length) return;

            let query = {
                //proxy: false,
                domain: { $in: _.map(domains, dom => dom.id) }
            };
            if (opts.timeFrame) query.last = { $gte: Date.now() - opts.timeFrame };
            collections = await this._findInCollection("collections", query, ctxt);
        }

        // Cache all instances to sync (together with the output)
        let sync = {};

        // Analyze collection
        for (let col of collections) {

            // 1. Obtain source links
            let links = await this.store.search(
                "links", { dst: col.id }
            );

            // (cache source collections in just one go)
            let sources = await this._findInCollection(
                "collections",
                _.map(links, link => link.src),
                ctxt
            );

            // 2. Sync links
            _.merge(
                sync,
                await this._syncLinks(
                    {
                        links: _.filter(
                            links,
                            link => ctxt.collections[link.src] && ctxt.collections[link.src].state != "destroy")
                    },
                    ctxt
                )
            );

        }

        await this.store.delete("collections",
            {
                id: {
                    $in: _.map(
                        _.filter(collections, col => col.state == "destroy"),
                        col => col.id
                    )
                }
            }
        );

        // Remove all collections in "destroying mode"
        /*let promises = [];
        for (let col of _.filter(collections, col => col.state == "destroy")) {
            promises.push(this.store.delete("collections", { id: col.id }));
        }
        await Q.waitAll(promises);*/

        return sync;

    }


    /**
     * Sync the specified links
     * @param {Object} opts - Additional options
     * @param {number} [opts.timeFrame]
     * @param {Array<string>|Array<Objec>} [opts.links] - The links to sync
     *  @param {Array<string>|Array<Objec>} [opts.domains] - The domains to sync
     * @param {Object} ctxt - Operation context
     */
    async _syncLinks(opts, ctxt) {
        this.log(`_syncLinks(${JSON.stringify(opts)})`);

        opts = opts || {};
        ctxt = ctxt || {};
        ctxt.domains = ctxt.domains || {};
        ctxt.collections = ctxt.collections || {};
        ctxt.instances = ctxt.instances || {};

        // Obtain links to sync
        let links = [];
        if (opts.links) {
            if (_.isString(opts.links)) {
                opts.links = opts.links.split(",");
            } else if (!_.isArray(opts.links)) opts.links = [opts.links];
            if (_.isString(opts.links[0])) {
                links = await this.store.search(
                    "links", { id: { $in: _opts.links } }
                );
            } else links = opts.links;
        } else {

            // Obtain domains to sync
            let domains = [];
            if (opts.domains) {
                if (_.isString(opts.domains)) {
                    opts.domains = opts.domains.split(",");
                } else if (!_.isArray(opts.domains)) opts.domains = [opts.domains];
                if (_.isString(opts.domains[0])) {
                    domains = await this._findInCollection("domains", opts.domains, ctxt);
                } else domains = opts.domains;
            } else {
                domains = _.filter(
                    await this._findInCollection("domains", { state: "ready" }, ctxt),
                    dom => dom.type.includes("k8s")
                );
            }

            // No k8s domains, exit
            if (!domains.length) return;

            let query = {
                domain: { $in: _.map(domains, dom => dom.id) }
            };
            if (opts.timeFrame) query.last = { $gte: Date.now() - opts.timeFrame };
            links = await this.store.search("links", query);
        }

        // (cache source collections in just one go)
        await this._findInCollection(
            "collections",
            _.map(links, link => link.src),
            ctxt
        );

        // remove links where source collection has been deleted
        let linksToSync = _.filter(
            links,
            link => ctxt.collections[link.src] && ctxt.collections[link.src].state != "destroy"
        );

        let sync = {};
        for (let link of linksToSync) {

            // Get collection output
            let outputs = await this._findOutputs(
                { collection: link.src, output: link.srcName },
                ctxt
            );

            // Get collection instances
            if (ctxt.collections[link.src].members && ctxt.collections[link.src].members.length) {
                let instances = await this._findInCollection(
                    "instances",
                    ctxt.collections[link.src].members,
                    ctxt
                );
            }

            // Check instance outputs match collection output
            for (let instId of ctxt.collections[link.src].members) {
                let inst = ctxt.instances[instId];
                if (inst.proxy) continue; // omit proxy instances
                let equals = _.isEqual(
                    _.sortBy(inst.outputs[link.srcName]),
                    _.sortBy(
                        _.map(outputs[link.srcName].peers, peer => peer.collection || peer.instances)
                    )
                );
                if (!equals) {
                    if (!sync[inst.id]) sync[inst.id] = {};
                    sync[inst.id][link.srcName] = outputs[link.srcName];
                }
            }
        }

        // Remove all links in "destroying mode"
        await this.store.delete("links",
            {
                id: {
                    $in: _.map(
                        _.filter(links, link => link.state == "destroy"),
                        link => link.id
                    )
                }
            }
        );

        /*let promises = [];
        for (let link of _.filter(links, link => link.state == "destroy")) {
            promises.push(this.store.delete("links", { id: link.id }));
        }
        await Q.waitAll(promises);*/

        return sync;

    }

    /**
     * Sync the specified instances.
     * 
     * @param {*} sync 
     * @param {*} ctxt 
     */
    async _syncInstances(sync, ctxt) {
        this.log(`_syncInstances(${JSON.stringify(sync)})`);

        let promises = [];
        // for each instance to sync
        for (let id in sync) {
            let instance = ctxt.instances[id];
            let sidecar = "",
                event = "";
            let outputs = sync[id];

            // for each output to sync
            for (let output in outputs) {

                instance.outputs[output] = _.map(
                    outputs[output].peers,
                    peer => peer.collection || peer.instances
                );

                let _sidecar = "", _event = "";
                let [srcSchema, srcPort] = outputs[output].protocol.split(":");
                if (srcSchema == "http") {
                    srcSchema = "tcp"; srcPort = srcPort || "80";
                }
                if (srcSchema == "https") {
                    srcSchema = "tcp"; srcPort = srcPort || "443";
                }
                let peers = outputs[output].peers;
                for (let peer of peers) {
                    if (peer.collection) {  // if destination is reverse proxy
                        let collection = ctxt.collections[peer.collection];
                        let srcAddr = `${srcSchema}://${collection.proxyAddr}${srcPort ? ":" + srcPort : ""}`;
                        let [dstSchema, dstPort] = peer.protocol.split(":");
                        if (dstSchema == "http") {
                            dstSchema = "tcp"; dstPort = dstPort || "80";
                        }
                        if (dstSchema == "https") {
                            dstSchema = "tcp"; dstPort = dstPort || "443";
                        }
                        let dstAddr = `${dstSchema}://${collection.cfg.privateAddr}${dstPort ? ":" + dstPort : ""}`;
                        _sidecar += (_sidecar ? "," : "") + `${srcAddr}->${dstAddr}`;
                        _event += (_event ? "," : "") + collection.proxyAddr;
                    } else if (peer.instances) {
                        for (let instId of peer.instances) {
                            let inst = ctxt.instances[instId];
                            let srcAddr = `${srcSchema}://${inst.addr}${srcPort ? ":" + srcPort : ""}`;
                            let [dstSchema, dstPort] = peer.protocol.split(":");
                            if (dstSchema == "http") {
                                dstSchema = "tcp"; dstPort = dstPort || "80";
                            }
                            if (dstSchema == "https") {
                                dstSchema = "tcp"; dstPort = dstPort || "443";
                            }

                            if (inst.proxy) {
                                let dstAddr = `${dstSchema}://${inst.cfg.privateAddr}${dstPort ? ":" + dstPort : ""}`;
                                _sidecar += (_sidecar ? "," : "") + `${srcAddr}->${dstAddr}`;
                            } else if (srcPort != dstPort) {
                                let dstAddr = `${dstSchema}://${inst.addr}${dstPort ? ":" + dstPort : ""}`;
                                _sidecar += (_sidecar ? "," : "") + `${srcAddr}->${dstAddr}`;
                            } else {
                                _sidecar += (_sidecar ? "," : "") + srcAddr;
                            }
                            _event += (_event ? "," : "") + inst.addr;
                        }
                    }
                }
                sidecar += (sidecar ? ";" : "") + `${output}=${_sidecar}`;
                event += (event ? ";" : "") + `${output}=${_event}`;
            }

            promises.push(
                this.store.update(
                    "instances", { id: instance.id }, { outputs: instance.outputs }
                )
            );

            // Notify sidecar first
            let cmd = ["node", "/komponents/sidecar.js", "cfg", sidecar];
            let promise = this._execInPod(ctxt.domains[instance.domain], `ks-${instance.id}`, "sidecar", cmd);
            if (instance.cfg.events.cfg) {
                // Notify instance later
                cmd = _.filter(instance.cfg.events.init.split(" "), arg => arg.trim().length > 0);
                cmd.push(event);
                promises.push(
                    this._execInPod(ctxt.domains[instance.domain], `ks-${instance.id}`, "main", cmd)
                );
            } else promises.push(promise);

        }
        await Q.waitAll(promises);

    }

    /**
     * Obtain all peers of the specified collection.
     * 
     * @param {Object} opts - Additional options
     * @param {string|Object} opts.collection - The collection
     * @param {string} [opts.output] - The output name
     * @param {Object} ctxt - Operation context
     * @param {Object} ctxt.collections - Cached collections
     * @param {Object} ctxt.instances - Cached instances
     * @return {Object} A dictionary of peers by output name. 
     *                  String peer represents a proxied collection id.
     *                  An array of string represents collection members' ids.
     */
    async _findOutputs(opts, ctxt) {
        this.log(`_findOutputs(${JSON.stringify(opts)})`);

        ctxt = ctxt || {};
        ctxt.collections = ctxt.collections || {};
        ctxt.instances = ctxt.instances || {};

        let outputs = {};
        let collection = opts.collection;
        if (_.isString(opts.collection)) {
            [collection] = await this.store.search("collections", { id: opts.collection });
            if (!collection) throw this.error(`Unable to find outputs: collection ${opts.collection} not found`);
        }

        if (opts.output) {
            outputs[opts.output] = {
                name: opts.output,
                protocol: collection.outputs[opts.output],
                peers: []
            };
        } else {
            for (let output in collection.outputs) {
                outputs[output] = {
                    name: output,
                    protocol: collection.outputs[output],
                    peers: []
                };
            }
        }

        // Obtain all target collections
        let query = { src: collection.id, state: "ready" };
        if (opts.output) query.srcName = opts.output;
        let links = await this.store.search("links", query);
        if (!links.length) return outputs;

        // - Sort links (order of endpoints is important in order to 
        //   detect changes)
        links = _.sortBy(links, link => link.id);

        // - Obtain destination collections
        this._findInCollection(
            "collections",
            _.map(links, link => link.dst),
            ctxt
        );

        // - Obtain all connected peers
        let ids = [];
        _.each(
            _.map(links, link => ctxt.collections[link.dst]),
            (dst) => {
                if (!dst.proxy) ids.push.apply(ids, dst.members);
            }
        );
        this._findInCollection(
            "instances",
            ids,
            ctxt
        );

        // - Fill outputs dictionary
        for (let link of links) {
            let dst = ctxt.collections[link.dst];
            if (!dst) continue;

            if (dst.proxy) {

                // If collection with reverse proxy then add 
                // connection redirect

                // Append new peer
                //outputs[link.srcName].peers.push(dst.id);
                outputs[link.srcName].peers.push({
                    protocol: dst.inputs[link.dstName],
                    collection: dst.id
                });

            } else {

                // If collection without reverse proxy then 
                // obtain all instances and add connections

                // Append new peers from collection snapshot
                //outputs[link.srcName].peers.push(dst.members);
                outputs[link.srcName].peers.push({
                    protocol: dst.inputs[link.dstName],
                    instances: dst.members
                });

            }
        }

        return outputs;

    }

    /**
     * Send the specified event type to the specified instance.
     * 
     * @param {Object} domain - The domain
     * @param {Object} instance - The instance
     * @param {string} type - The event type
     * @param {Array<string>} args - The event arguments
     *
    async _event(domain, instance, type, args) {
        this.log(`_event(${instance.id},${type},${JSON.stringify(args)})`);
    
        // Check whether "cfg" event has been defined
        if (instance.events[type]) {
    
            // Create k8sCon
            let k8sCon = this._connect(domain);
    
            let cmd = [
                //"/komponents/sidecar.sh",
                instance.events[type],
                type
            ];
            cmd.push.apply(cmd, args);
    
            await this._execInPod(k8sCon, instance.id, "main", cmd);
    
        }
    
    }*/

    /**
     * Execute command in pod.
     * 
     * @param {Object} domain - The domain
     * @param {string} podName - The pod name
     * @param {string} containerName - The container name
     * @param {string|Array<string>} cmd - The command
     */
    async _execInPod(domain, podName, containerName, cmd) {
        this.log(`_execInPod(${podName},${JSON.stringify(cmd)})`);

        try {
            let kc = new k8s.KubeConfig();
            kc.loadFromString(domain.kubeconfig || domain.cfg.kubeconfig);

            // Break input command in words
            cmd = _.isArray(cmd) ? cmd : [cmd];
            let _cmd = [];
            for (let c of cmd) {
                _cmd.push.apply(_cmd, c.split(" "));
            }
            cmd = _cmd;

            // Create Exec object (this is an undocumented feature of the lib)
            let out = new streams.WritableStream();
            let exec = new k8s.Exec(kc);

            let deferred = Q.defer();
            await exec.exec(
                domain.cfg.namespace, // namespace
                podName, // pod name
                containerName, // container name
                cmd, // command (str) or commands (str[])
                out, // stdout stream (Writable)
                undefined, // stderr stream
                undefined, // stdin stream
                false, // tty enabled session?
                (status) => { // receive status (exit code)
                    deferred.resolve(status);
                }
            );

            let ret = await deferred.promise;
            if (ret.status != "Success")
                throw this.error(`Unable to exec in pod: ${ret.message}`, ret.code, ret.reason);

            return out.toString();
        } catch (err) {
            throw this.error(err);
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

}

module.exports = (store, utils, opts) => {
    opts = opts || {};
    return new LinksDaemon(store, utils, opts);
}