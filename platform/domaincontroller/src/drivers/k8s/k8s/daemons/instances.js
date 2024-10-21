const _ = require("lodash");
const k8s = require('@kubernetes/client-node');
const streams = require("memory-streams");
const Q = require("q");

/**
 * Daemon responsible for monitoring instances's status. 
 * 
 * This daemon serves a dual purpose:
 * - Obtaining instance resource consumption metrics.
 * - Probing instance health status.
 * 
 * When the instance status changes the 'last' field 
 * is updated. 
 * 
 */
class InstancesDaemon {

    /**
     * Initialize daemon.
     * 
     * @param {Object} store - The store
     * @param {Object} utils - Utilities
     * @param {Object} opts - Additional options
     */
    constructor(store, utils, opts) {
        if (!store) throw new Error("Unable to initialize InstancesDaemon: missing store");
        if (!utils) throw new Error("Unable to initialize InstancesDaemon: missing utilities");
        this.store = store;
        this.utils = utils;
        this.opts = opts;
        this.error = utils.error;
        this.log = utils.log || ((msg) => console.log("[InstancesDaemon] " + msg));
        this.opts.interval = this.opts.interval || this.utils.constants.DAEMON_INTERVAL;
        this.opts.range = this.opts.range || this.utils.constants.DAEMON_RANGE
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
        //this.log("run()");

        let ctxt = {
            domains: {},
            instances: {}
        }

        try {
            await this._refreshInstances({}, ctxt);
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
     * Refresh the status of the specified instances.
     * 
     * @param {Object} [opts] - Additional options
     * @param {number} [opts.timeFrame] 
     * @param {Array<string>|Array<Object>} [opts.instances] - The instances
     * @param {Array<string>|Array<Object>} [opts.domains] - The domains to refresh
     * @param {Object} ctxt - Operation context
     */
    async _refreshInstances(opts, ctxt) {
        this.log(`_refreshInstances(${JSON.stringify(opts)})`);

        opts = opts || {};
        opts.range = opts.range || this.opts.range;
        ctxt = ctxt || {};

        ctxt.domains = ctxt.domains || {};
        ctxt.instances = ctxt.instances || {};

        // Obtain instances to sync
        let instances = [];
        if (opts.instances) {
            if (_.isString(opts.instances)) {
                opts.instances = opts.instances.split(",");
            } else if (!_.isArray(opts.instances)) opts.instances = [opts.instances];
            if (_.isString(opts.instances[0])) {
                let ids = _.difference(
                    opts.instances,
                    _.keys(ctxt.instances)
                );
                if (ids.length) {
                    instances = await this.store.search(
                        "instances",
                        { id: { $in: ids } }
                    );
                    Object.assign(ctxt.instances, _.keyBy(instances, inst => inst.id));
                }
                instances = _.map(opts.instances, id => ctxt.instances[id]);
            } else instances = opts.instances;
        } else {

            // Obtain domains to sync
            let domains = [];
            if (opts.domains) {
                if (_.isString(opts.domains)) {
                    opts.domains = opts.domains.split(",");
                } else if (!_.isArray(opts.domains)) opts.domains = [opts.domains];
                if (_.isString(opts.domains[0])) {
                    let ids = _.difference(
                        opts.domains,
                        _.keys(ctxt.domains)
                    );
                    if (ids.length) {
                        domains = await this.store.search(
                            "domains",
                            { id: { $in: ids } }
                        );
                        Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
                    }
                    domains = _.map(opts.domains, id => ctxt.domains[id]);
                } else domains = opts.domains;
            } else {
                domains = _.filter(
                    await this.store.search("domains", { state: "ready" }),
                    dom => dom.type.includes("k8s")
                );
                Object.assign(ctxt.domains, _.keyBy(domains, dom => dom.id));
            }

            // No k8s domains, exit
            if (!domains.length) return;

            let query = {
                state: "ready",
                domain: { $in: _.map(domains, dom => dom.id) }
            };
            let queryOpts = {
                orderBy: "+last"
            };
            if (opts.range) queryOpts.limit = opts.range;
            if (opts.timeFrame) query.last = { $gte: Date.now() - opts.timeFrame };
            instances = await this.store.search("instances", query, queryOpts);
            Object.assign(ctxt.instances, _.keyBy(instances, inst => inst.id));

        }

        let updates = {}, promises = [];
        for (let inst of instances) {
            updates[inst.id] = {};

            try {
                _.merge(updates[inst.id], await this._pingInstance(inst, ctxt));
                _.merge(updates[inst.id], await this._metricsInstance(inst, ctxt));
            } catch (err) {
                updates[inst.id] = { state: "failed" };
            }
            updates[inst.id].last = Date.now();
            promises.push(this.store.update("instances", { id: inst.id }, updates[inst.id]))

        }
        await Q.waitAll(promises);

    }

    /**
     * Checks the health of the specified instance.
     *  
     * @param {*} inst 
     */
    async _pingInstance(inst, ctxt) {
        this.log(`_pingInstance(${inst.id})`);

        let pods = await this._listPods(
            ctxt.domains[inst.domain],
            { instance: inst.id }
        );

        if (!pods.length) throw this.error(`Unable to ping instance ${inst.id}: instance not found`);
        else if (pods[0].state == "Failed") throw this.error(`Unable to ping instance ${inst.id}: instance failed`);
        else if (inst.events && inst.events.ping) {
            let cmd = _.filter(instance.cfg.events.ping.split(" "), arg => arg.strim().length > 0);
            await this._execInPod(ctxt.domains[inst.domain], `ks-${inst.id}`, "main", cmd);
        }
        return {};

    }

    /**
     * Obtains metrics from the specified instance.
     * 
     * @param {*} inst 
     */
    async _metricsInstance(inst) {
        return {};
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
            let kc = new k8s.KubeConfig();
            kc.loadFromString(domain.kubeconfig || domain.cfg.kubeconfig);
            let k8sCon = kc.makeApiClient(k8s.CoreV1Api);

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



}

module.exports = (store, utils, opts) => {
    opts = opts || {};
    return new InstancesDaemon(store, utils, opts);
}