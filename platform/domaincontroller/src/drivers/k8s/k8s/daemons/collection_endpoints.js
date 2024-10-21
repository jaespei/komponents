const _ = require("lodash");
const k8s = require('@kubernetes/client-node');
const streams = require("memory-streams");
const Q = require("q");

/**
 * Daemon responsible for detecting changes in proxied collection
 * members and refreshing the associated service endpoints object.
 */
class CollectionEndpointsDaemon {

    /**
     * Initialize daemon.
     * 
     * @param {Object} store - The store
     * @param {Object} utils - Utilities
     * @param {Object} opts - Additional options
     */
    constructor(store, utils, opts) {
        if (!store) throw new Error("Unable to initialize CollectionEndpointsDaemon: missing store");
        if (!utils) throw new Error("Unable to initialize CollectionEndpointsDaemon: missing utilities");
        this.store = store;
        this.utils = utils;
        this.opts = opts || {};
        this.error = utils.error;
        this.log = utils.log || ((msg) => console.log("[CollectionEndpointsDaemon] " + msg));
        this.opts.interval = this.opts.interval || this.utils.constants.DAEMON_INTERVAL;
    }

    /**
     * Start the daemon.
     */
    start() {
        this.log("start()");

        if (this.intervalID) return;

        /*this.intervalID = setInterval(
            this.run.bind(this),
            this.opts.interval
        );*/

    }

    /**
     * Execute all tests.
     */
    async run() {
        this.log("run()");

        // Look for xxx/k8s domains
        let domainsById = _.keyBy(
            (await this.store.search("domains")).filter(dom => dom.type.includes("k8s")),
            dom => dom.id
        );

        if (!_.keys(domainsById).length) return;

        // Look for recently updated (proxied) collections
        //
        let collections = await this.store.search(
            "collections",
            {
                proxy: true,
                domain: { $in: _.keys(domainsById) },
                //last: { $gt: Date.now() - this.utils.constants.DAEMON_TIME_WINDOW }
            }
        );

        this.log(`collections: ${JSON.stringify(collections)}`);

        // For each detected collections ...
        for (let collection of collections) {

            // Find mismatch
            if (JSON.stringify(collection.members) != JSON.stringify(collection.cfg.endpoints)) {

                // Get members
                let instancesById = _.keyBy(
                    await this.store.search(
                        "instances",
                        { id: { $in: collection.members } }
                    ),
                    inst => inst.id
                );

                // Refresh endpoints  
                collection.cfg.endpoints = collection.members;

                // Create k8sCon
                let k8sCon = this._connect(domainsById[collection.domain]);

                // Update service endpoints
                await this._updateEndpoints(
                    k8sCon, 
                    `ks-${collection.id}`,
                    {
                        name: `ks-${collection.id}`,
                        labels: {
                            domain: domain.id,
                            collection: collection.id
                        }
                    }, 
                    {
                        addresses: _.map(
                            collection.members,
                            instId => {
                                return { ip: instancesById[instId].addr };
                            }
                        ),
                        ports: _.map(
                            collection.inputs,
                            (protocol, name) => {
                                let [schema, port] = protocol.split(":");
                                if (schema == "http") {
                                    schema = "tcp"; port = port || "80";
                                }
                                if (schema == "https") {
                                    schema = "tcp"; port = port || "443";
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

        }

    }

    /**
     * Stop de daemon.
     */
    stop() {
        this.log("stop()");

        if (!this.intervalID) return;

        /*cancelInterval(this.intervalID);
        delete this.intervalID;*/

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
     * Open connection against the specified domain.
     */
    _connect(domain) {
        this.log(`_connect(${domain.id})`);
        let kc = new k8s.KubeConfig();
        kc.loadFromString(domain.cfg.kubeconfig);
        let k8sCon = kc.makeApiClient(k8s.CoreV1Api);
        k8sCon._cfg = kc;
        k8sCon._namespace = domain.cfg.namespace;
        return k8sCon;
    }

}

module.exports = (store, utils, opts) => {
    opts = opts || {};
    return new CollectionMembersDaemon(store, utils, opts);
}