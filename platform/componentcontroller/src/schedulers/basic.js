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
 * Basic scheduler. 
 * 
 * This is the default scheduler.
 * 
 * The basic scheduler follows the next rules:
 * 
 * - It enforces component cardinality, keeping the number of
 *   instances within the specified range
 * 
 * - Basic components default to elastic cardinality (e.g. "[:]")
 * 
 * - Composite components default to singleton cardinality (e.g. "[1:1]")
 * 
 * - For basic components, a minimum of two instances get created (except
 *   for singleton) and they are distributed in different domains (if possible).
 * 
 * - For basic components, if the number of instances is included in the 
 *   range [min,max] then resources consumption will guide growing/shrinking
 *   decisions: the average cpu usage of all instances is calculated. If it 
 *   exceeds the 80% a new instance gets created. If it is under the 30% then
 *   an instance is removed.
 * 
 * - For basic components, instances get created evenly balanced among the
 *   available domains.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class BasicScheduler {

    /**
     * Initializes the scheduler. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} services - The available services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(services, store, utils) {
        if (!store) throw this.error("Unable to initialize BasicScheduler: missing store");
        if (!services) throw this.error("Unable to initialize BasicScheduler: missing services");
        if (!utils) throw this.error("Unable to initialize BasicScheduler: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.log = utils && utils.log || ((msg) => console.log("[BasicScheduler] " + msg));

        // scheduler config
        this.minInstances = 2;
        this.cpuUsage = { min: 0.3, max: 0.8 };
    }


    /**
     * Force scheduler activation.
     * 
     * The scheduler may be activated either on a composite instance or on a 
     * specific subcomponent/connector belonging to a composite instance. Then 
     * the scheduler suggests a collection of actions to enforce model properties.
     * 
     * @param {Object} opts - The scheduler options
     * @param {string|Object} opts.parent - The parent instance
     * @param {string} [opts.subcomponent] - The subcomponent name to schedule
     * @param {string} [opts.connector] - The connector name to schedule
     * @param {number} [opts.cardinality] - Cardinality
     */
    async schedule(opts) {
        this.log(`schedule(${JSON.stringify(opts)})`);

        if (!opts.parent) throw this.error(`Unable to schedule: missing parent instance`);
        //if (!opts.component && !opts.connector) throw this.error(`Unable to schedule: missing component/connector name`);

        if (_.isString(opts.parent)) {
            [opts.parent] = await this.store.search("instances", { id: opts.parent });
            if (!opts.parent) throw this.error(`Unable to schedule: parent instance not found`);
        }

        // Schedule every subcomponent/connector of parent instance
        if (!opts.subcomponent && !opts.connector) {
            let events = [];
            await _.eachAsync(opts.parent.model.subcomponents, async (subcomp, subcompName) => {
                Array.prototype.push.apply(events,
                    await this.schedule({
                        parent: parent,
                        subcomponent: subcompName
                    })
                );
            });
            await _.eachAsync(opts.parent.model.connectors, async (con, conName) => {
                Array.prototype.push.apply(events,
                    await this.schedule({
                        parent: parent,
                        connector: conName
                    })
                );
            });
            return events;
        }

        // Obtain model
        let subcomp = opts.subcomponent ? opts.parent.model.subcomponents[opts.subcomponent] : opts.parent.model.connectors[opts.connector];
        if (!subcomp) throw this.error(`Unable to schedule: subcomponent/connector ${opts.subcomponent || opts.connector} not found`);
        let subcompType = opts.parent.model.imports[subcomp.type];

        // Check cardinality
        let cardinality = opts.cardinality || subcomp.cardinality || subcompType.cardinality || "[:]";
        let [min, max] = cardinality.slice(1, -1).split(":").map(val => val.trim() && Number(val.trim()) || Infinity);
        //min = min == Infinity ? 0 : min;

        // Obtain instances
        let instances = await this.store.search(
            "instances", {
            parent: opts.parent.id,
            subcomponent: opts.subcomponent || "",
            connector: opts.connector || "",
            state: { $in: ["ready", "init"] }
        }
        );

        // 1. Detect events
        let events = [];
        if (min != Infinity && instances.length < min) {
            // Enforce minimum number of instances

            for (let i = 0; i < min - instances.length; i++) {
                events.push({
                    type: "InstanceAdd",
                    parent: opts.parent.id,
                    subcomponent: opts.subcomponent,
                    connector: opts.connector
                });
            }

        } else if (
            subcompType.type == "basic" &&
            instances.length < this.minInstances &&
            instances.length < max
        ) {
            // Guarantee at least minInstances basic running

            for (let i = instances.length; i < Math.min(this.minInstances, max); i++) {
                events.push({
                    type: "InstanceAdd",
                    parent: opts.parent.id,
                    subcomponent: opts.subcomponent,
                    connector: opts.connector
                });
            }

        } else if (
            subcompType.type == "composite" &&
            min == Infinity &&
            instances.length == 0
        ) {
            // Guarantee at least 1 composite running
            events.push({
                type: "InstanceAdd",
                parent: opts.parent.id,
                subcomponent: opts.subcomponent,
                connector: opts.connector
            });

        } else if (
            max != Infinity &&
            instances.length > max
        ) {
            // Guarantee maximum number of instances
            events.push({
                type: "InstanceRemove",
                parent: opts.parent.id,
                subcomponent: opts.subcomponent,
                connector: opts.connector,
                instance: instances[Math.floor(Math.random() * instances.length)].id
            });

        } else if (
            subcompType.type == "basic"
        ) {
            // Check resource consumption (cpu)
            let [collection] = await this.store.search(
                "collections", { parent: opts.parent.id, name: opts.subcomponent || opts.connector }
            );
            if (!collection) throw this.error(`Unable to schedule: component collection not found`);

            if (collection.data.metrics && collection.data.metrics.cpu) {
                // if metrics are available
                if (instances.length < max && collection.data.metrics.cpu >= this.cpuUsage.max) {

                    events.push({
                        type: "InstanceAdd",
                        parent: opts.parent.id,
                        subcomponent: opts.subcomponent,
                        connector: opts.connector
                    });

                } else if (instances.length > min && collection.data.metrics.cpu <= this.cpuUsage.min) {

                    events.push({
                        type: "InstanceRemove",
                        parent: opts.parent.id,
                        subcomponent: opts.subcomponent,
                        connector: opts.connector,
                        instance: instances[Math.floor(Math.random() * instances.length)].id
                    });

                }

            }

        }

        // 2. Assign domain to new instances
        //
        // For new basic instances, locate available domains

        if (subcompType.type == "basic") {
            let toAdd = _.filter(events, event => event.type == "InstanceAdd");
            if (toAdd.length) {
                let query = { runtimes: { $any: [subcompType.runtime] }, state: "ready" };
                if (subcompType.domains && subcompType.domains.length) {
                    query.id = { $in: subcompType.domains };
                } else if (opts.parent.model.domains) {
                    query.id = { $in: opts.parent.model.domains };
                }
                let domains = await this.services.domain.listDomains(query);
                if (domains.length) {
                    // count instances per domain
                    _.each(domains, domain => {
                        domain.count = _.reduce(instances, (count, inst) => {
                            if (inst.domain == domain.id) return count + 1;
                            else return count;
                        }, 0);
                    });

                    _.each(toAdd, event => {

                        // sort
                        domains = _.sortBy(domains, dom => dom.count);
                        // assign domain with less instances
                        event.domain = domains[0].id;
                        // increment counter
                        domains[0].count++;
                    });

                }

            }
        }
        /*let runtimes = _.reduce(
                _.filter(events, event => event.type == "InstanceAdd"),
                (runtimes, event) => {
                    let subcomp = event.subcomponent ? opts.parent.model.subcomponents[event.subcomponent] : opts.parent.model.connectors[event.connector];
                    let subcompType = opts.parent.model.imports[subcomp.type];
                    if (subcompType.type == "basic" && !runtimes.includes(subcompType.runtime))
                        runtimes.push(subcompType.runtime)
                    return runtimes;
                }, []);


            let domains = await this.services.domain.listDomains(
                {
                    runtimes: { $any: runtimes },
                    state: "ready"
                }
            );


            // Select one domain
            _.each(
                _.filter(events, event => event.type == "InstanceAdd"),
                event => {
                    let subcomp = event.subcomponent ? opts.parent.model.subcomponents[event.subcomponent] : opts.parent.model.connectors[event.connector];
                    let subcompType = opts.parent.model.imports[subcomp.type];
                    let candidates = _.filter(domains, domain => domain.runtimes.includes(subcompType.runtime));
                    if (!candidates.length) throw this.error(`Unable to schedule: no available domains for subcomponent/connector ${event.subcomponent || event.connector}`);
                    let index = Math.floor(candidates.length * Math.random());
                    event.domain = candidates[index].id;
                });*/

        this.log(`schedule() => ${JSON.stringify(events)}`);

        return events;

    }

}


module.exports = (...opts) => {
    return new BasicScheduler(...opts);
}