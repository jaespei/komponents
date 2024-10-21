const k8s = require('@kubernetes/client-node');
const streams = require("memory-streams");
const _ = require("lodash");
const Q = require("q");

Q.longStackSupport = true;

Q.waitAll = function(promises) {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then(function(snapshots) {
        _.forEach(snapshots, function(snapshot) {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};

/**
 * Driver for managing a k8s cluster.
 * 
 * This driver assumes the existence of two configuration 
 * options in the domain:
 * - The kubeconfig info used for connecting against the k8s cluster
 * - The namespace used for creating all k8s resources
 *  
 * This driver is reponsible for creating the following
 * elements:
 * - Collections
 * - Instances
 * - Links between collections
 * 
 * Regarding collections, they might be directly accessible or
 * they might be reached through a reverse proxy instead. In 
 * the first case nothing is done. In the second case it is
 * necessary to create a Service with a stable address whose 
 * endpoints refer to the collection members.
 * 
 * Regarding instances, they are implemented through pods. 
 * In the case of "proxy" instances, each pod includes a 
 * single "special" container which forwards all connections
 * to the corresponding gateway.
 * In the case of "regular" instances, each pod includes 
 * two containers:
 * - The main container includes the user bits.
 * - A sidecar container in "privileged" mode responsible
 *   for intercepting all outbound connections and 
 *   redirecting to the appropriate targets.
 * 
 * When an instance is added to a collection, it is initialized and 
 * connected with all the peer collections. To that end, the 
 * next steps are followed:
 * 1. The pod is created in k8s
 * 2. The instance output endpoints are enabled
 * 3. The instance init event gets triggered
 * 4. The instance input endpoints are enabled
 * 
 * Links ??
 * 
 */
exports.K8sDriver = class K8sDriver {

    /**
     * Initializes the driver. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(store, utils) {
        if (!store) throw new Error("Unable to initialize K8sDriver: missing store");
        if (!utils) throw new Error("Unable to initialize K8sDriver: missing utilities");
        this.store = store;
        this.utils = utils;
        this.error = utils.error;
        this.log = utils.log || ((msg) => console.log("[K8sDriver] " + msg));
        this.daemons = require("./daemons")(store, utils);
    }

    // ----------------------------------------------------------
    //            Domains 
    // ----------------------------------------------------------

    /**
     * Add a new domain.
     * 
     * @param {Object} domain - The domain data
     * @param {string} domain.kubeconfig - The domain configuration
     * @param {string} domain.namespace - The domain namespace
     * @param {string} domain.gateway - The domain gateway
     * @param {Object} ctxt - The operation context
     * @return {Object} The created domain
     */
    async addDomain(domain, ctxt) {
        this.log(`addDomain(${JSON.stringify(domain)})`);

        // Add gateway pod as ReplicaSet
        let rs = await this._addReplicaSet(
            domain, {
                name: `ks-${domain.id}`,
                labels: {
                    type: "replicaset",
                    domain: domain.id
                }
            }, {
                selector: {
                    matchLabels: {
                        type: "gateway",
                        domain: domain.id
                    }
                },
                template: {
                    metadata: {
                        labels: {
                            type: "gateway",
                            domain: domain.id
                        }
                    },
                    spec: {
                        containers: [{
                            name: "main",
                            image: this.utils.constants.DOMAIN_K8S_IMAGE_GATEWAY
                        }]
                    }
                },
                //replicas: 2
            }
        );



        try {

            // Publish gateway as a LoadBalancer/NodePort service
            let [gwAddr, gwPort] = domain.gateway.split(":");
            let svc = await this._addService(
                domain, {
                    name: `ks-${domain.id}`,
                    labels: {
                        type: "nodeport",
                        domain: domain.id
                    }
                }, {
                    type: "NodePort",
                    selector: {
                        type: "gateway",
                        domain: domain.id
                    },
                    ports: [{
                        port: Number(gwPort),
                        nodePort: Number(gwPort),
                        targetPort: domain.cfg.gwPrivatePort || this.utils.constants.DOMAIN_K8S_GATEWAY_PORT
                    }]
                }
            );

            //domain.cfg.gwPort = svc.ports[0].nodePort;
            domain.cfg.gwPrivateAddr = svc.addr;
            domain.cfg.gwPrivatePort = domain.cfg.gwPrivatePort || this.utils.constants.DOMAIN_K8S_GATEWAY_PORT;

            await this.store.update(
                "domains", { id: domain.id }, { cfg: domain.cfg, last: Date.now() }
            );

            return domain;

        } catch (err) {
            await this._removeReplicaSet(domain, `ks-${domain.id}`);
            throw err;
        }

    }

    /**
     * Update the specified domain.
     * 
     * @param {string} domain - The domain
     * @param {Object} data - The data to update
     * @param {Object} ctxt - The operation context
     */
    async updateDomain(domain, data, ctxt) {
        this.log(`removeDomain(${JSON.stringify(domain)})`);

        // For now only labels can be modified
        let keys = _.filter(_.keys(data), key => key != "labels");
        if (keys.length) throw new Error(`Unable to update domain: properties ${keys} are read-only`);
        if (data.labels) {
            await this.store.update(
                "domains", { id: domain.id }, { labels: data.labels }
            )
        }

    }


    /**
     * Remove the specified domain.
     * 
     * @param {string} domain - The domain
     * @param {Object} ctxt - The operation context
     */
    async removeDomain(domain, ctxt) {
        this.log(`removeDomain(${JSON.stringify(domain)})`);

        // Removing a domain involves many cleanup ops
        // 

        // 1. Remove all collections (and all instances recursively)
        let collections = await this.store.search("collections", { domain: domain.id, state: "ready" });

        let promises = [];
        for (let col of collections) {
            promises.push(this.removeCollection(domain, col, ctxt));
        }

        await Q.waitAll(promises);

        // 2. Remove gateway

        await this._removeService(domain, `ks-${domain.id}`);
        await this._removeReplicaSet(domain, `ks-${domain.id}`);

    }



    // ----------------------------------------------------------
    //            Collections 
    // ----------------------------------------------------------

    /**
     * Add new collection to the domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} collection - The collection
     * @param {Array<string>} [collection.labels] - The collection labels
     * @param {string} [collection.name] - The collection name
     * @param {boolean} [collection.proxy] - Collection with reverse proxy
     * @param {string} [collection.proxyAddr] - Reverse proxy addr
     * @param {Object} [collection.publish] - Published inputs {input: {protocol, path}}
     * @param {Object} [collection.inputs] - Dictionary with collection inputs {name: protocol}
     * @param {Object} [collection.outputs] - Dictionary with collection outputs {name: protocol}
     * @param {Object} ctxt - The operation context
     * @return {Object} The added collection
     */
    async addCollection(domain, collection, ctxt) {
        this.log(`addCollection(${domain.id},${JSON.stringify(collection)})`);

        collection = collection || {};

        let _collection = {
            id: this.utils.uuid(),
            domain: domain.id,
            labels: collection.labels || [],
            name: collection.name || '',
            proxy: collection.proxy || false,
            proxyAddr: collection.proxyAddr || '',
            publish: collection.publish ? true : false,
            publishPaths: [],
            publishInputs: {},
            inputs: collection.inputs || {},
            outputs: collection.outputs || {},
            members: [],
            cfg: {},
            data: {}
        };

        try {

            if (collection.proxy && Object.keys(collection.inputs).length) {

                // Reverse proxy required: create service pointing 
                // to collection members
                //
                let ports = [];
                _.each(_collection.inputs, (protocol, name) => {
                    let [schema, port] = protocol.split(":");
                    if (schema == "http") ports.push({ protocol: "TCP", port: port ? Number(port) : 80, targetPort: port ? Number(port) : 80 });
                    else if (schema == "https") ports.push({ protocol: "TCP", port: port ? Number(port) : 443, targetPort: port ? Number(port) : 443 });
                    else ports.push({ protocol: schema.toUpperCase(), port: Number(port), targetPort: Number(port) });
                });
                let result = await this._addService(
                    domain, {
                        name: `ks-${_collection.id}`,
                        labels: {
                            domain: domain.id,
                            collection: _collection.id
                        }
                    }, { ports: ports }
                );
                // Set private configuration
                //
                _collection.proxyAddr = _collection.proxyAddr || result.addr;
                _collection.cfg.privateAddr = result.addr;
                //_collection.cfg.endpoints = [];
            }

            if (collection.publish) {
                let http = [],
                    https = [],
                    other = [];
                for (let input in collection.publish) {
                    if (collection.publish[input].protocol == "http") {
                        let [schema, port] = collection.inputs[input].split(":");
                        /*if (schema == "http") {
                            schema = "tcp"; port = port || "80";
                        }
                        if (schema == "https") {
                            schema = "tcp"; port = port || "443";
                        }*/
                        http.push({
                            path: collection.publish[input].path,
                            pathType: "Prefix",
                            backend: {
                                service: {
                                    name: `ks-${_collection.id}`,
                                    port: {
                                        number: port ? Number(port) : 80
                                    }
                                }
                            }
                        });
                        _collection.publishPaths.push(`http${collection.publish[input].path}`);
                        _collection.publishInputs[input] = `http${collection.publish[input].path}`;
                    } else if (collection.publish[input].protocol == "https") {
                        let [schema, port] = collection.inputs[input].split(":");
                        https.push({
                            path: collection.publish[input].path,
                            pathType: "Prefix",
                            backend: {
                                service: {
                                    name: `ks-${_collection.id}`,
                                    port: {
                                        number: port ? Number(port) : 443
                                    }
                                }
                            }
                        });
                        _collection.publishPaths.push(`https${collection.publish[input].path}`);
                        _collection.publishInputs[input] = `https${collection.publish[input].path}`;
                    } else {
                        let [publishSchema, publishPort] = collection.publish[input].protocol.split(":");
                        let [schema, port] = collection.inputs[input.split(":")];
                        other.push({
                            port: Number(port),
                            targetPort: Number(port),
                            nodePort: Number(publishPort),
                            protocol: publishSchema.toUpperCase()
                        });
                        _collection.publishPaths.push(collection.publish[input].protocol);
                        _collection.publishInputs[input] = collection.publish[input].protocol;
                    }
                }
                if (http.length || https.length) {
                    // Create Ingress
                    let spec = { rules: [] };
                    if (http.length) spec.rules.push({
                        http: {
                            paths: http
                        }
                    });
                    if (https.length) spec.rules.push({
                        https: {
                            paths: https
                        }
                    });
                    let result = await this._addIngress(
                        domain, {
                            name: `ks-${_collection.id}`,
                            labels: {
                                domain: domain.id,
                                collection: _collection.id
                            }
                        },
                        spec
                    );
                }

                // [TODO] NodePort!!!
                /*if (other.length) {
                    // Create LoadBalancer/NodePort
    
    
                }*/
            }

            _collection.state = "ready";
            _collection.last = Date.now();

            await this.store.insert("collections", _collection);

            return _collection;

        } catch (err) {
            this.log(err.stack);
            if (_collection.cfg.privateAddr) await this._removeService(domain, `ks-${_collection.id}`);
            if (_collection.publish) await this._removeIngress(domain, `ks-${_collection.id}`);
            // [TODO] NodePort!!
            throw err;
        }
    }

    /**
     * Remove the specified collections and all its members.
     * 
     * @param {Object} domain - The domain
     * @param {string} collection - The collection
     * @param {Object} ctxt - The operation context
     */
    async removeCollection(domain, collection, ctxt) {
        this.log(`removeCollection(${domain.id},${collection.id})`);

        // Remove all the included instances
        let instances = await this.store.search("instances", { collection: collection.id });

        let promises = [];
        for (let instance of instances) {
            promises.push(this.removeInstance(domain, instance, ctxt));
        }

        await Q.waitAll(promises);

        // Remove all links
        let srcLinks = await this.store.search("links", { src: collection.id });
        let dstLinks = await this.store.search("links", { dst: collection.id });

        promises = [];
        for (let link of srcLinks) promises.push(this.removeLink(domain, link, ctxt));
        for (let link of dstLinks) promises.push(this.removeLink(domain, link, ctxt));

        await Q.waitAll(promises);

        if (collection.proxy && Object.keys(collection.inputs).length) {

            // If reverse proxy then remove service
            await this._removeService(
                domain,
                `ks-${collection.id}`
            );

        }

        if (collection.publish) {
            if (_.find(collection.publishPaths, path => path.startsWith("http"))) {
                // Remove ingress
                await this._removeIngress(
                    domain,
                    `ks-${collection.id}`
                );
            }

            /* [TODO] -----------
            _.each(
                _.filter(collection.publishPaths, path => !path.startsWith("http")),
                path => {
                    // Remove LoadBalancer/NodePort
                }
            );*/

        }

        // Remove collection
        await this.store.update(
            "collections", { id: collection.id }, { state: "destroy", last: Date.now() }
        );
        //await this.store.delete("collections", { id: collection.id });

    }

    /**
     * Notifies an event to all the members of the specified collection.
     * 
     * @param {Object} domain - The domain
     * @param {Object} collection - The collection
     * @param {string} event - The event
     * @param {object} [event.target] - The event target, as a query
     * @param {string|Array<string>} event.cmd - The event command
     * @param {Object} ctxt - The operation context
     */
    async eventCollection(domain, collection, event, ctxt) {
        this.log(`eventCollection(${domain.id},${collection.id},${JSON.stringify(event)})`);

        // Get all instances
        let instances = await this.store.search("instances", { collection: collection.id });

        let promises = [];
        for (let instance of instances) {
            let matches = true;
            if (event.target) {
                // check whether the instance matches the query
                for (let prop in event.target) {
                    if (!instance[prop] || instance[prop] != event.target[prop]) matches = false;
                    if (!matches) break;
                }
            }
            if (matches) promises.push(this.eventInstance(domain, instance, event, ctxt));
        }

        await Q.waitAll(promises);

    }

    // ----------------------------------------------------------
    //            Instances 
    // ----------------------------------------------------------


    /**
     * Add new instance to the domain.
     * 
     * @param {Object} domain - The domain
     * @param {Object} collection - The collection
     * @param {Object} instance - The instance
     * @param {Array<string>} [instance.labels] - The instance labels
     * @param {string} [instance.addr] - The instance address
     * @param {string} [instance.proxy] - Proxy?
     * @param {string} [instance.proxyTarget] - Proxy target route
     * @param {string} [instance.source] - The instance source
     * @param {string} [instance.runtime] - The instance runtime
     * @param {string} [instance.durability] - The instance durability     * 
     * @param {Object} [instance.variables] - The instance variables
     * @param {Object} [instance.events] - The instance event handlers
     * @param {Object} ctxt - The operation context
     */
    async addInstance(domain, collection, instance, ctxt) {
        this.log(`addInstance(${domain.id},${collection.id},${JSON.stringify(instance)})`);

        instance.events = instance.events || {};

        // Store instance "initializing" 
        let lock;
        let _instance = {
            id: this.utils.uuid(),
            domain: domain.id,
            collection: collection.id,
            labels: instance.labels || [],
            addr: instance.addr || "",
            proxy: instance.proxy || false,
            proxyTarget: instance.proxyTarget || "",
            proxyAddr: "",
            inputs: {},
            outputs: {},
            cfg: {
                source: instance.source || "",
                runtime: instance.runtime || "",
                durability: instance.durability || "",
                variables: instance.variables || {},
                events: instance.events || {}
            },
            state: "init",
            last: Date.now()
        };

        await this.store.insert("instances", _instance);

        try {

            // ----------- 1. Add instance to k8s ----------- 
            let pod;
            if (_instance.proxy) {

                // Add proxy instance
                //

                // Process route to proxy target

                // - Obtain proxy target domain
                /*let [proxyTargetDomain] = this.store.search("domains", { id: proxyTarget.domain });

                // - Obtain proxy target collection
                let [proxyTargetCollection] = this.store.search("collections", { id: proxyTarget.collection });*/

                // - Obtain proxy address and ports
                let [gw, dstAddr] = _instance.proxyTarget.split(",");
                //let [gwAddr, gwPort] = gw.split(":");
                let dstPorts = [];
                for (let input in collection.inputs) {
                    let [schema, port] = collection.inputs[input].split(":");
                    if (schema == "http") {
                        schema = "tcp";
                        port = port || "80";
                    } else if (schema == "https") {
                        schema = "tcp";
                        port = port || "443";
                    }
                    if (!port) { port = schema;
                        schema = "tcp"; }
                    dstPorts.push(port);
                }

                pod = await this._addPod(
                    domain, {
                        name: `ks-${_instance.id}`,
                        labels: {
                            instance: _instance.id,
                            domain: domain.id,
                            collection: collection.id
                        }
                    }, {
                        // ---- special proxy container
                        containers: [{
                            name: "main",
                            image: this.utils.constants.DOMAIN_K8S_IMAGE_PROXY,
                            env: [
                                { name: "GATEWAY", value: gw },
                                { name: "DEST", value: dstAddr },
                                { name: "PORTS", value: dstPorts.join(",") }
                            ]
                        }]
                    }
                );

            } else {

                // Add regular instance
                //

                pod = await this._addPod(
                    domain, {
                        name: `ks-${_instance.id}`,
                        labels: {
                            instance: _instance.id,
                            domain: domain.id,
                            collection: collection.id
                        }
                    }, {
                        containers: [{
                                name: "main",
                                image: instance.source,
                                env: _.map(
                                    _instance.cfg.variables,
                                    (value, name) => {
                                        return {
                                            name: name,
                                            value: value
                                        };
                                    }
                                )
                            },
                            // ---- privileged sidecar container 
                            {
                                name: "sidecar",
                                image: "sidecar:1.0",
                                securityContext: {
                                    privileged: true
                                }
                            }
                        ]
                    }
                );

            }

            // ----------- 2. Wait until instance is successfully running ----------- 
            pod = await this._loop(async() => {
                let pods = await this._listPods(
                    domain, { instance: _instance.id }
                );
                if (!pods.length) throw new Error(`Unable to find pod ${_instance.id}`);

                if (pods[0].state == "Running") return pods[0];
                if (pods[0].state == "Failed") throw new Error(`Pod ${_instance.id} failed`);
                // Otherwise check again
            });
            if (!_instance.proxy) _instance.addr = pod.podAddr;
            _instance.cfg.privateAddr = pod.podAddr;
            _instance.proxyAddr = `${domain.gateway},${pod.podAddr}`;


            // ----------- 3. Set up instance output endpoints ----------- 
            //
            let outputs = {};
            for (let output in collection.outputs) {
                //_instance.outputs[output] = [];
                outputs[output] = {
                    name: output,
                    protocol: collection.outputs[output],
                    peers: []
                };
            }
            let sidecar = "",
                event = "";
            let instancesById = {},
                collectionsById = {};
            if (!_instance.proxy) {

                // - Obtain links where this instance is source
                let links = await this.store.search("links", { src: collection.id });

                // - Sort links (order of endpoints is important in order to 
                //   detect changes)
                links = _.sortBy(links, link => link.id);

                if (links.length) {

                    // - Obtain destination collections (as dict)
                    let collectionIds = _.map(links, link => link.dst);
                    collectionsById = _.keyBy(
                        await this.store.search("collections", { id: { $in: collectionIds } }),
                        col => col.id
                    );

                    // - Obtain all connected peers
                    let instanceIds = [];
                    _.each(collectionsById, (collection) => {
                        if (!collection.proxy) instanceIds.push.apply(instanceIds, collection.members);
                    });
                    instancesById = _.keyBy(
                        await this.store.search(
                            "instances", { id: { $in: instanceIds } }
                        ),
                        inst => inst.id
                    );

                    // Trick!!! For recursive links, append current instance as peer!
                    if (collectionsById[collection.id]) {
                        collectionsById[collection.id].members.push(_instance.id);
                        instancesById[_instance.id] = _instance;
                    }

                    // - Fill outputs dictionary
                    for (let link of links) {
                        let collection = collectionsById[link.dst];
                        if (!collection) continue;

                        if (collection.proxy) {

                            // If collection with reverse proxy then add 
                            // connection redirect

                            // Append new peer
                            //_instance.outputs[link.srcName].push(collection.id);
                            outputs[link.srcName].peers.push({
                                protocol: collection.inputs[link.dstName],
                                collection: collection.id
                            });

                        } else {

                            // If collection without reverse proxy then 
                            // obtain all instances and add connections

                            // Append new peers from collection snapshot
                            //_instance.outputs[link.srcName].push(collection.members);
                            outputs[link.srcName].peers.push({
                                protocol: collection.inputs[link.dstName],
                                instances: collection.members
                            });
                        }
                    }

                    // - Compose sidecar/event string
                    for (let output in outputs) {

                        _instance.outputs[output] = _.map(
                            outputs[output].peers,
                            peer => peer.collection || peer.instances
                        );

                        let _sidecar = "",
                            _event = "";
                        let [srcSchema, srcPort] = outputs[output].protocol.split(":");
                        if (srcSchema == "http") {
                            srcSchema = "tcp";
                            srcPort = srcPort || "80";
                        } else if (srcSchema == "https") {
                            srcSchema = "tcp";
                            srcPort = srcPort || "443";
                        }

                        let peers = outputs[output].peers;
                        for (let peer of peers) {
                            if (peer.collection) {
                                let collection = collectionsById[peer.collection];
                                let srcAddr = `${srcSchema}://${collection.proxyAddr}${srcPort ? ":" + srcPort : ""}`;
                                let [dstSchema, dstPort] = peer.protocol.split(":");
                                if (dstSchema == "http") {
                                    dstSchema = "tcp";
                                    dstPort = dstPort || "80";
                                }
                                if (dstSchema == "https") {
                                    dstSchema = "tcp";
                                    dstPort = dstPort || "443";
                                }
                                let dstAddr = `${dstSchema}://${collection.cfg.privateAddr}${dstPort ? ":" + dstPort : ""}`;
                                _sidecar += (_sidecar ? "," : "") + `${srcAddr}->${dstAddr}`;
                                _event += (_event ? "," : "") + collection.proxyAddr;
                            } else if (peer.instances) {
                                for (let instId of peer.instances) {
                                    let inst = instancesById[instId];
                                    let srcAddr = `${srcSchema}://${inst.addr}${srcPort ? ":" + srcPort : ""}`;
                                    let [dstSchema, dstPort] = peer.protocol.split(":");
                                    if (dstSchema == "http") {
                                        dstSchema = "tcp";
                                        dstPort = dstPort || "80";
                                    }
                                    if (dstSchema == "https") {
                                        dstSchema = "tcp";
                                        dstPort = dstPort || "443";
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

                    /*// - Compose sidecar/event string
                    for (let link of links) {
                        let collection = collectionsById[link.dst];
                        if (collection.proxy) {

                            // If collection with reverse proxy then add 
                            // connection redirect

                            // Set instance outputs as collection id
                             if (_instance.outputs[link.name]) _instance.outputs[link.name].push(collection.id);
                             else _instance.outputs[link.name] = [collection.id];

                            /*cons.push({ dst: col.cfg.vaddr, redirect: col.cfg.addr });
                            arg += (arg ? ";" : "") + `${link.name}=${col.cfg.vaddr}`;*
                            let [schema, port] = link.protocol.split(":");
                            let addr = `${schema}://${collection.proxy}${port ? ":" + port : ""}`;
                            sidecar +=
                                (sidecar ? ";" : "") +
                                `${link.name}=${addr}->${collection.cfg.addr}`;
                            event += (event ? ";" : "") + `${link.name}=${addr}`;

                        } else {

                            // If collection without reverse proxy then 
                            // obtain all instances and add connections

                            // Set instance outputs from collection snapshot
                            if (_instance.outputs[link.name]) Array.prototype.push.apply(instance.outputs[link.name], collection.members);
                            else _instance.outputs[link.name] = collection.members;

                            let [schema, port] = link.protocol.split(":");
                            let subsidecar = "",
                                subevent = "";
                            for (let instId of collection.members) {
                                let inst = instancesById[instId];
                                let addr = `${schema}://${inst.addr}${port ? ":" + port : ""}`;
                                if (inst.proxy) {
                                    subsidecar += (subsidecar ? "," : "") + `${addr}->${inst.proxy}`;
                                } else {
                                    subsidecar += (subsidecar ? "," : "") + addr;
                                }
                                subevent += (subevent ? "," : "") + addr;
                            }
                            sidecar += (sidecar ? ";" : "") + `${link.name}=${subsidecar}`;
                            event += (event ? ";" : "") + `${link.name}=${subevent}`;

                            /*let subarg = "";
                            for (let inst of instances) {
                                if (inst.type == "proxy") {
                                    cons.push({ dst: inst.vaddr, redirect: inst.addr });
                                    subarg += (subarg ? "," : "") + inst.vaddr;
                                } else {
                                    cons.push({ dst: inst.addr });
                                    subarg += (subarg ? "," : "") + inst.addr;
                                }
                            }
                            arg += (arg ? ";" : "") + `${link.name}=${subarg}`;*
                        }
                    }*/
                }
            }

            // - Update instance data
            await this.store.update(
                "instances", { id: _instance.id }, {
                    addr: _instance.addr,
                    proxyAddr: _instance.proxyAddr,
                    outputs: _instance.outputs,
                    cfg: _instance.cfg,
                    state: "ready",
                    last: Date.now()

                }
            );


            // ----------- 4. Trigger init event in new instance ----------- 

            if (!_instance.proxy) {

                // Notify sidecar first
                let cmd = ["node", "/komponents/sidecar.js", "init", sidecar];
                await this._execInPod(domain, `ks-${_instance.id}`, "sidecar", cmd);

                // Notify instance later
                if (_instance.cfg.events.init) {
                    cmd = _.filter(_instance.cfg.events.init.split(" "), arg => arg.trim().length > 0);
                    cmd.push(event);
                    await this._execInPod(domain, `ks-${_instance.id}`, "main", cmd);
                }
            }

            // ----------- 5. Add new member to collection --------------

            // Update list of collection members. Eventually, daemons will 
            // detect the addition and notify the involved instances

            // - Obtain lock on collection
            lock = this.utils.uuid();
            collection = await this._loop(async() => {
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
            collection.members.push(_instance.id);

            // - Update service endpoints
            if (collection.proxy) {


                // - Get collection members
                instancesById = _.keyBy(
                    await this.store.search(
                        "instances", { id: { $in: collection.members } }
                    ),
                    inst => inst.id
                );

                // - Update endpoints
                //collection.cfg.endpoints = collection.members;

                await this._updateEndpoints(
                    domain,
                    `ks-${collection.id}`, {
                        name: `ks-${collection.id}`,
                        labels: {
                            domain: domain.id,
                            collection: collection.id
                        }
                    }, {
                        addresses: _.map(
                            collection.members,
                            instId => {
                                return { ip: instancesById[instId].cfg.privateAddr };
                            }
                        ),
                        ports: _.map(
                            collection.inputs,
                            (protocol, name) => {
                                let [schema, port] = protocol.split(":");
                                if (schema == "http") {
                                    schema = "tcp";
                                    port = port || "80";
                                } else if (schema == "https") {
                                    schema = "tcp";
                                    port = port || "443";
                                }
                                return {
                                    protocol: schema.toUpperCase(),
                                    port: Number(port)
                                };
                            }
                        )
                    }
                );

            }

            // - Unlock collection
            await this.store.update(
                "collections", { id: collection.id }, {
                    members: collection.members,
                    cfg: collection.cfg,
                    last: Date.now()
                }, { unlock: lock }
            );

            /*
            // ----------- 5. Enable input endpoints --------------

            // - Obtain links where this instance is destination
            let dstLinks = await this.store.search("links", { dst: collection.id });

            // - Obtain source collections (as dict)
            let srcIds = srcLinks.map(link => link.src);
            let srcCollections = _.keyBy(
                await this.store.search("collections", { id: { $in: srcIds } }),
                col => col.id
            );*/

            return _instance;

        } catch (err) {

            // Update instance state in store. Eventually a daemon will
            // remove this info.
            await this.store.update(
                "instances", { id: _instance.id }, { state: "failed" },
                lock ? { unlock: lock } : {}
            );

            // Free resources from k8s cluster
            //
            try {
                await this._removePod(domain, `ks-${_instance.id}`);
            } catch (err2) {}

            throw err;
        }


    }

    /**
     * Remove the specified instance.
     * 
     * @param {Object} domain - The domain
     * @param {Object} instance - The instance
     * @param {Object} ctxt - The operation context
     */
    async removeInstance(domain, instance, ctxt) {
        this.log(`removeInstance(${domain.id},${JSON.stringify(instance.id)})`);

        // Update instance data
        await this.store.update("instances", { id: instance.id }, {
            state: "destroy",
            last: Date.now()
        });


        // Update list of collection members. Eventually, daemons will 
        // detect the addition and notify the involved instances

        // - Obtain lock on collection
        let lock = this.utils.uuid();
        let collection = await this._loop(async() => {
            try {
                let [_collection] = await this.store.search(
                    "collections", { id: instance.collection }, { lock: lock }
                );
                return _collection;
            } catch (err) {
                return false;
            }
        });

        // - Update members list and unlock collection
        let index = collection.members.indexOf(instance.id);
        if (index != -1) collection.members.splice(index, 1);
        //collection.cfg.endpoints = collection.members;
        await this.store.update(
            "collections", { id: collection.id }, {
                members: collection.members,
                cfg: collection.cfg,
                last: Date.now()
            }, { unlock: lock }
        );

        if (collection.proxy) {

            // - Update endpoints
            // - Get collection members
            let instancesById = _.keyBy(
                await this.store.search(
                    "instances", { id: { $in: collection.members } }
                ),
                inst => inst.id
            );
            await this._updateEndpoints(
                domain,
                `ks-${collection.id}`, {
                    name: `ks-${collection.id}`,
                    labels: {
                        domain: domain.id,
                        collection: collection.id
                    }
                }, {
                    addresses: _.map(
                        collection.members,
                        instId => {
                            return { ip: instancesById[instId].cfg.privateAddr };
                        }
                    ),
                    ports: _.map(
                        collection.inputs,
                        (protocol, name) => {
                            let [schema, port] = protocol.split(":");
                            if (schema == "http") {
                                schema = "tcp";
                                port = port || "80";
                            }
                            if (schema == "https") {
                                schema = "tcp";
                                port = port || "443";
                            }
                            return {
                                protocol: schema.toUpperCase(),
                                port: Number(port)
                            };
                        }
                    )
                }
            );
        }

        // Delete instance from k8s
        try {
            await this._removePod(domain, `ks-${instance.id}`);
        } catch (err) {

        }

        // Delete from store
        await this.store.delete("instances", { id: instance.id });

    }

    /**
     * Notifies an event to the specified instance.
     * 
     * @param {Object} domain - The domain
     * @param {Object} instance - The instance
     * @param {Object} event - The event
     * @param {string|Array<string>} event.cmd - The event command
     * @param {Object} ctxt  - The operation context
     */
    async eventInstance(domain, instance, event, ctxt) {
        this.log(`eventInstance(${domain.id},${instance.id},${JSON.stringify(event)})`);

        event.cmd = _.isArray(event.cmd) ? event.cmd : [event.cmd];

        // Load k8s config
        let kc = new k8s.KubeConfig();
        kc.loadFromString(domain.cfg.kubeconfig);

        // Create Exec object (this is an undocumented feature of the lib)
        let out = new streams.WritableStream();
        let cmd = new k8s.Exec(kc);

        let deferred = Q.defer();
        await cmd.exec(
            domain.cfg.namespace, // namespace
            instance.id, // pod name
            "main", // container name
            event.cmd, // command (str) or commands (str[])
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
            throw this.error(`Unable to trigger event: ${ret.message}`, ret.code, ret.reason);

    }

    /**
     * Update the specified instance.
     * 
     * @param {Object} domain - The domain
     * @param {Object} instance - The instance
     * @param {Object} data - The data to update
     * @param {Object} ctxt - The operation context
     *
    async updateInstance(domain, instance, data, ctxt) {
    
    }*/


    // ----------------------------------------------------------
    //            Links 
    // ----------------------------------------------------------

    /**
     * Add new link between two collections.
     * 
     * @param {Object} domain - The domain
     * @param {Object} link - The link
     * @param {Object} src - The source collection
     * @param {Object} dst - The destination collection
     * @param {Object} ctxt - The operation context
     */
    async addLink(domain, link, src, dst, ctxt) {
        this.log(`addLink(${domain.id},${JSON.stringify(link)},${src.id},${dst.id})`);

        // In k8s nothing must be done since all the instances
        // are directly reachable ...
        let _link = {
            id: this.utils.uuid(),
            domain: domain.id,
            labels: [],
            labels: link.labels || [],
            //name: link.name,
            protocol: dst.inputs[link.dst.name],
            src: src.id,
            srcName: link.src.name,
            dst: dst.id,
            dstName: link.dst.name,
            cfg: {},
            data: {},
            state: "ready",
            last: Date.now()
        };

        await this.store.insert("links", _link);

        return _link;
    }

    /**
     * Remove the specified link.
     * 
     * @param {Object} domain - The domain
     * @param {Object} link - The link
     * @param {Object} ctxt - The operation context
     */
    async removeLink(domain, link, ctxt) {
        this.log(`removeLink(${domain.id},${link.id})`);

        // Remove link
        await this.store.update(
            "links", { id: link.id }, { state: "destroy", last: Date.now() }
        );

        //await this.store.delete("links", { id: link.id, domain: domain.id });

    }

    // ----------------------------------------------------------
    //                   Private methods
    // ----------------------------------------------------------


    /**
     * Open connection against the specified domain.
     */
    _connect(domain, api) {
        this.log(`_connect(${domain.id})`);
        let kc = new k8s.KubeConfig();
        kc.loadFromString(domain.kubeconfig || domain.cfg.kubeconfig);
        let k8sCon = kc.makeApiClient(api ? k8s[api] : k8s.CoreV1Api);
        return k8sCon;
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
        let wrappedFn = async() => {
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

    /**
     * Add the specified pod.
     * 
     * @param {Object} domain - The k8s connection
     * @param {Object} metadata 
     * @param {Object} spec 
     */
    async _addPod(domain, metadata, spec) {
        this.log(`_addPod(${JSON.stringify(metadata)},${JSON.stringify(spec)})`);

        let k8sCon = this._connect(domain);

        try {
            let { body: res } = await k8sCon.createNamespacedPod(
                domain.cfg.namespace, {
                    apiVersion: "v1",
                    kind: "Pod",
                    metadata: metadata,
                    spec: spec
                }
            );

            return { uid: res.metadata.uid };

        } catch (err) {
            throw this.error(err);
        }

    }

    /**
     * Delete the specified pod.
     * 
     * @param {Object} k8sCon - The k8s connection
     * @param {string} podName - The pod name
     */
    async _removePod(domain, podName) {
        this.log(`_removePod(${podName})`);

        try {
            let k8sCon = this._connect(domain);

            let { body: res } = await k8sCon.deleteNamespacedPod(podName, domain.cfg.namespace);
        } catch (err) {
            throw this.error(err);
        }
    }

    /**
     * Lists the specified pods. The query consults labels.
     * 
     * @param {Object} domain - The k8s connection
     * @param {Object} query 
     */
    async _listPods(domain, query) {
        this.log(`_listPods(${JSON.stringify(query)})`);

        try {
            let k8sCon = this._connect(domain);

            let labelQuery = "";
            for (let key in query) labelQuery += (labelQuery ? "," : "") + `${key}=${query[key]}`;

            let { body: res } = await k8sCon.listNamespacedPod(
                domain.cfg.namespace,
                undefined, // pretty
                undefined, // allowWatchBookmarks
                undefined, // _continue
                undefined, // fieldSelector
                labelQuery
            );

            let pods = [];
            for (let item of res.items) {
                pods.push({
                    namespace: item.namespace,
                    labels: item.metadata.labels,
                    name: item.name,
                    uid: item.uid,
                    hostAddr: item.status.hostIP,
                    podAddr: item.status.podIP,
                    state: item.status.phase
                });
            }
            return pods;
        } catch (err) {
            throw this.error(err);
        }

    }

    /**
     * Adds the specified pod connections.
     * 
     * @param {Object} k8sCon - The k8s connection
     * @param {string} podName - The pod name
     * @param {Array<Object>} cons - Connections {dst, redirect?}
     *
    async _addPodConnections(k8sCon, podName, cons) {
        this.log(`_addPodConnections(${JSON.stringify(podName)},${JSON.stringify(cons)})`);

        let str = "";
        for (let con of cons) {
            str += (str ? "," : "") + `${con.dst}` + (con.redirect ? `->${con.redirect}` : "");
        }
        let cmd = ["/komponents/sidecar.sh", "addConnections", str];
        //await this._execInPod(k8sCon, podName, "sidecar", cmd);

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
     * Add service.
     * 
     * @param {*} domain 
     * @param {*} metadata 
     * @param {*} spec 
     */
    async _addService(domain, metadata, spec) {
        this.log(`_addService(${JSON.stringify(metadata)},${JSON.stringify(spec)})`);

        try {
            let k8sCon = this._connect(domain);

            let { body: res } = await k8sCon.createNamespacedService(
                domain.cfg.namespace, {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: metadata,
                    spec: spec
                }
            );

            return {
                addr: res.spec.clusterIP,
                ports: res.spec.ports,
                sessionAffinity: res.spec.sessionAffinity,
                type: res.spec.type
            };
        } catch (err) {
            throw this.error(err);
        }

    }

    /**
     * Remove service.
     * 
     * @param {*} domain 
     * @param {*} serviceName , "AppsV1Api"
     */
    async _removeService(domain, serviceName) {
        this.log(`_removeService(${serviceName})`);

        try {
            let k8sCon = this._connect(domain);
            let { body: res } = await k8sCon.deleteNamespacedService(serviceName, domain.cfg.namespace);
        } catch (err) {
            throw this.error(err);
        }
    }

    /**
     * 
     * @param {*} domain 
     * @param {*} metadata 
     * @param {*} spec 
     */
    async _updateEndpoints(domain, serviceName, metadata, endpoints) {
        this.log(`_updateEndpoints(${serviceName},${JSON.stringify(metadata)},${JSON.stringify(endpoints)})`);


        try {
            let k8sCon = this._connect(domain);

            if (endpoints.addresses.length) {
                // If there are endpoints update them
                let { body: res } = await k8sCon.replaceNamespacedEndpoints(
                    serviceName,
                    domain.cfg.namespace, {
                        apiVersion: "v1",
                        kind: "Endpoints",
                        metadata: metadata,
                        subsets: [endpoints]
                    }
                );

                return { uid: res.metadata.uid };

            } else {
                // Otherwise delete resource
                let { body: res } = await k8sCon.deleteNamespacedEndpoints(
                    serviceName,
                    domain.cfg.namespace,
                );
            }
        } catch (err) {
            throw this.error(err);
        }

    }

    /**
     * Add ReplicaSet.
     * 
     * @param {*} domain 
     * @param {*} metadata 
     * @param {*} spec 
     */
    async _addReplicaSet(domain, metadata, spec) {
        this.log(`_addReplicaSet(${JSON.stringify(metadata)},${JSON.stringify(spec)})`);

        try {
            let k8sCon = this._connect(domain, "AppsV1Api");

            let { body: res } = await k8sCon.createNamespacedReplicaSet(
                domain.cfg.namespace, {
                    apiVersion: "apps/v1",
                    kind: "ReplicaSet",
                    metadata: metadata,
                    spec: spec
                }
            );

            return {};
        } catch (err) {
            throw this.error(err);
        }
    }


    /**
     * Remove ReplicaSet.
     * 
     * @param {*} domain 
     * @param {*} name 
     */
    async _removeReplicaSet(domain, name) {
        this.log(`_removeReplicaSet(${name})`);

        try {
            let k8sCon = this._connect(domain, "AppsV1Api");
            let { body: res } = await k8sCon.deleteNamespacedReplicaSet(name, domain.cfg.namespace);
        } catch (err) {
            throw this.error(err);
        }
    }

    /**
     * Add Ingress object to k8s.
     * 
     * @param {*} domain 
     * @param {*} metadata
     * @param {*} spec 
     */
    async _addIngress(domain, metadata, spec) {
        this.log(`_addIngress(${JSON.stringify(metadata)},${JSON.stringify(spec)})`);
        try {
            let k8sCon = this._connect(domain, "NetworkingV1Api");

            let { body: res } = await k8sCon.createNamespacedIngress(
                domain.cfg.namespace, {
                    apiVersion: "networking.k8s.io/v1",
                    kind: "Ingress",
                    metadata: metadata,
                    spec: spec
                }
            );

            return {};
        } catch (err) {
            throw this.error(err);
        }
    }

    /**
     * 
     * @param {*} domain 
     * @param {*} name 
     */
    async _removeIngress(domain, name) {
        this.log(`_removeIngress(${name})`);

        try {
            let k8sCon = this._connect(domain, "NetworkingV1Api");
            let { body: res } = await k8sCon.deleteNamespacedIngress(name, domain.cfg.namespace);
        } catch (err) {
            throw this.error(err);
        }
    }




}


/*module.exports = (drivers, store, utils) => {
    return new K8sCoreDriver(store, utils);
}*/