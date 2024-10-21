const _ = require("lodash");

_.eachAsync = async(col, fn) => {
    if (col) {
        if (_.isArray(col)) {
            for (let i = 0; i < col.length; i++) await fn(col[i], i);
        } else {
            for (let key in col) await fn(col[key], key);
        }
    }
};

/**
 * Schedule daemon.
 * 
 * Daemon which periodically schedules 
 */
class ScheduleDaemon {

    /**
     * Initialize daemon.
     * 
     * @param {Object} store - The store
     * @param {Object} utils - Utilities
     * @param {Object} opts - Additional options
     */
    constructor(schedulers, services, store, utils, opts) {
        if (!schedulers) throw this.error("Unable to initialize ScheduleDaemon: missing schedulers");
        if (!services) throw this.error("Unable to initialize ScheduleDaemon: missing services");
        if (!store) throw new Error("Unable to initialize ScheduleDaemon: missing store");
        if (!utils) throw new Error("Unable to initialize ScheduleDaemon: missing utilities");
        opts = opts || {};
        this.schedulers = schedulers;
        this.services = services;
        this.store = store;
        this.utils = utils;
        this.opts = opts;
        this.error = utils.error;
        this.log = utils.log || ((msg) => console.log("[ScheduleDaemon] " + msg));
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

    }

    async run() {
        this.log("run()");

        try {

            // 1. Schedule instances
            await this._scheduleInstances({});

        } catch (err) {
            this.log(err.stack);
        } finally {
            // program next run
            if (this.running) setTimeout(this.run.bind(this), this.opts.interval);
        }

    }

    /**
     * Schedule the specified instances.
     * 
     * @param {Object} opts  - Additional options
     * @param {number} [opts.timeFrame] - Time frame
     * @param {number} [opts.range] - Number of instances to schedule
     * @param {Array<string>|Array<Object>} [opts.instances] - The instances to sync
     * @param {Object} ctxt - Operation context
     */
    async _scheduleInstances(opts) {
        this.log(`_scheduleInstances(${opts})`);

        // Obtain instances to sync
        let instances = [];
        if (opts.instances) {
            if (_.isString(opts.instances)) {
                opts.instances = opts.instances.split(",");
            } else if (!_.isArray(opts.instances)) opts.instances = [opts.instances];
            if (_.isString(opts.instances[0])) {
                instances = await this.store.search(
                    "instances", { id: { $in: opts.instances } }
                );
            } else instances = opts.instances;
        } else {

            // Obtain last recently updated composites ...
            let query = {
                state: "ready",
                type: "composite"
            };
            let queryOpts = {
                orderBy: "+last"
            };
            if (opts.range) queryOpts.limit = opts.range;
            if (opts.timeFrame) query.last = { $gte: Date.now() - opts.timeFrame };
            instances = await this.store.search("instances", query, queryOpts);
        }


        // 1. Obtain all events
        let events = [];
        await _.eachAsync(instances, async instance => {

            // - Schedule subcomponents
            await _.eachAsync(instance.model.subcomponents, async(subcomp, subcompName) => {

                // - Obtain scheduler
                let subcompType = instance.model.imports[subcomp.type];
                let scheduler = this.schedulers[subcomp.scheduler || subcompType.scheduler || "basic"];
                if (!scheduler) return;

                // - Schedule
                Array.prototype.push.apply(events,
                    await scheduler.schedule({
                        parent: instance,
                        subcomponent: subcompName
                    })
                );
            });

            // - Schedule connectors
            await _.eachAsync(instance.model.connectors, async(con, conName) => {

                // - Obtain scheduler
                if (con.type == "Link") return;
                let conType = instance.model.imports[con.type];
                let scheduler = this.schedulers[con.scheduler || conType.scheduler || "basic"];
                if (!scheduler) return;

                // - Schedule
                Array.prototype.push.apply(events,
                    await scheduler.schedule({
                        parent: instance,
                        connector: conName
                    })
                );
            });

        });

        // 2. Sort events following parent-child relationship
        // (events must be applied from inner instances to outer instances)
        events = this._sortEvents(events, instances);

        instances = _.keyBy(
            instances,
            inst => inst.id
        );

        // 3. Apply events in a sorted way
        await _.eachAsync(events, async event => {

            let parent = instances[event.parent];
            let subcomp = parent.model.subcomponents[event.subcomponent];
            let con = parent.model.connectors[event.connector];
            let subcompType = parent.model.imports[subcomp && subcomp.type || con.type];

            if (event.type == "InstanceAdd") {
                let model = await this.services.component._resolveModel(subcomp || con, subcompType);
                if (subcompType.type == "basic") {
                    await this.services.component._addBasic(
                        parent,
                        event.subcomponent || event.connector,
                        model, { domain: event.domain }
                    );
                } else if (subcompType.type == "omposite") {
                    await this.services.component._addComposite(
                        parent,
                        event.subcomponent || event.connector,
                        model
                    );
                }
            } else if (event.type == "InstanceRemove") {
                if (subcompType.type == "basic") {
                    await this.services.component._removeBasic(
                        event.instance
                    );
                } else if (subcompType.type == "composite") {
                    await this.services.component._removeComposite(
                        event.instance
                    );
                }
            }
        });

        // 4. Update composites timestamp
        await this.store.update(
            "instances",
            { id: { $in: _.keys(instances) } },
            { last: Date.now() }
        )

    }

    /**
     * Sort the specified events. First events on inner instances, later events
     * on outer instances.
     * 
     * @param {*} events 
     * @param {*} instances 
     */
    _sortEvents(events, instances) {
        this.log(`_sortEvents(${JSON.stringify(events)})`);

        // Sort instances hierarchically
        let sortedInstances = [];
        var visitInstance = (inst) => {
            inst.visited = true;
            let adjacents = _.filter(
                instances,
                child => child.parent == inst.id
            );
            _.each(adjacents, adjacent => {
                if (!adjacent.visited)
                    visitInstance(adjacent);
            });
            sortedInstances.push(inst);
        };

        // Traverse root instances
        _.each(
            _.filter(
                instances,
                inst => !inst.parent
            ),
            inst => { visitInstance(inst); }
        );

        // Group events by parent
        let eventsByParent = {};
        _.each(events, event => {
            if (!eventsByParent[event.parent]) {
                eventsByParent[event.parent] = [];
                eventsByParent[event.parent].visited = false;
            }
            eventsByParent[event.parent].push(event);
        });

        // Now traverse events in a sorted way
        let sortedEvents = [];
        _.each(sortedInstances, inst => {
            if (eventsByParent[inst.id]) Array.prototype.push.apply(sortedEvents, eventsByParent[inst.id]);
        });

        this.log(`_sortEvents() => ${JSON.stringify(sortedEvents)}`);

        return sortedEvents;

    }

    /**
     * Stop de daemon.
     */
    stop() {
        this.log("stop()");

        this.running = false;

    }


}

module.exports = (...opts) => {
    opts = opts || {};
    return new ScheduleDaemon(...opts);
}