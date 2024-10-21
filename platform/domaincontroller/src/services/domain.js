const _ = require("lodash");

/**
 * Domain Service.
 * 
 * Service responsible for managing the different domains.
 * A domain provides the basic primitives for managing a
 * cluster's resources.
 * 
 * This component relies on a collection of drivers tailored 
 * for specific platforms.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
class DomainService {

    /**
     * Initializes the service. Dependencies are injected as 
     * constructor parameters.
     * 
     * @param {Object} drivers - The domain drivers
     * @param {Object} store - The store.
     * @param {object} services - The remainder services
     * @param {Object} [utils] - Additional utilities
     */
    constructor(drivers, services, store, utils) {
        if (!drivers) throw new Error("Unable to initialize DomainService: missing drivers");
        if (!store) throw new Error("Unable to initialize DomainService: missing store");
        if (!services) throw new Error("Unable to initialize DomainService: missing services");
        if (!utils) throw new Error("Unable to initialize DomainService: missing utilities");
        this.drivers = drivers;
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.log = utils && utils.log || ((msg) => console.log("[DomainService] " + msg));
    }

    /**
     * Add a new domain.
     * 
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type
     * @param {Array<string>} domain.labels - The domain labels
     * @return {string} The started transaction id
     */
    async addDomain(domain) {
        this.log(`addDomain(${JSON.stringify(domain)})`);
        if (!domain) throw new Error("Unable to add domain: missing domain data");
        if (!domain.type) throw new Error("Unable to add domain: missing domain type");
        if (!this.drivers[domain.type]) throw new Error(`Unable to add domain: unknown domain type ${domain.type}`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_DOMAIN_ADD,
            data: JSON.stringify(domain)
        });

        // Start async operation
        let promise = this.drivers[domain.type].addDomain(domain, { tx: tx });
        promise
            .then(async domain => {
                await this.services.transaction.completeTransaction(tx.id, { target: domain.id });
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            });

        // return transaction id
        return tx.id;
    }

    /**
     * Update the specified domain.
     * 
     * @param {string} domainId - The domain id
     * @param {Object} data  - The data to update
     * @return {string} The started transaction id
     */
    async updateDomain(domainId, data) {
        this.log(`updateDomain(${domainId}, ${JSON.stringify(data)})`);
        if (!domainId) throw new Error("Unable to update domain: missing domain identifier");
        if (!data) throw new Error("Unable to update domain: missing domain data");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [domain] = await this.store.search("domains", { id: domainId } /*, { lock: lock }*/ );
        if (!domain) throw new Error(`Unable to update domain: domain ${domainId} not found`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_DOMAIN_UPDATE,
            target: domainId,
            data: JSON.stringify(data)
        });

        // Start async operation
        let promise = this.drivers[domain.type].updateDomain(domain, data, { tx: tx });
        promise
            .then(async domain => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            })
            /*.finally(async res => {
                // Release locks
                await this.store.search("domains", { id: domainId }, { unlock: lock });
            })*/
        ;

        // return transaction id
        return tx.id;
    }

    /**
     * Remove the specified domain.
     * 
     * @param {string} domainId - The domain id
     */
    async removeDomain(domainId) {
        this.log(`removeDomain(${domainId})`);
        if (!domainId) throw new Error("Unable to remove domain: missing domain identifier");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [domain] = await this.store.search("domains", { id: domainId } /*, { lock: lock }*/ );
        if (!domain) throw new Error(`Unable to remove domain: domain ${domainId} not found`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_DOMAIN_REMOVE,
            target: domainId
        });

        // Start async operation
        let promise = this.drivers[domain.type].removeDomain(domain, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                //await this.store.search("domains", { id: domainId }), { unlock: lock };
            });

        // return transaction id
        return tx.id;

    }

    /**
     * List the specified domains.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listDomains(query, opts) {
        this.log(`listDomains(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);
        query = query || {};
        opts = opts || {};
        if (!query.state) query.state = "ready";
        let result = await this.store.search("domains", query, opts);
        return result;
    }

    /**
     * Add a new resource to the specified domain.
     * 
     * @param {stirng} domainId - The domain
     * @param {Object} resource - The resource data
     * @param {stirng} resource.type - The resource type
     */
    async addResource(domainId, resource) {
        this.log(`addResource(${domainId}, ${JSON.stringify(resource)})`);

        if (!domainId) throw new Error("Unable to add resource: missing domain");
        if (!resource) throw new Error("Unable to add resource: missing resource data");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [domain] = await this.store.search("domains", { id: domainId } /*, { lock: lock }*/ );
        if (!domain) throw new Error(`Unable to add resource: domain ${domainId} not found`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_RESOURCE_ADD,
            target: domainId
        });

        // Start async operation
        let promise = this.drivers[domain.type].addResource(domain, resource, { tx: tx });
        promise
            .then(async resource => {
                await this.services.transaction.completeTransaction(tx.id, { target: resource.id });
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            })
            /*.finally(async res => {
                // Release locks
                await this.store.search("domains", { id: domainId }), { unlock: lock };
            })*/
        ;

        // return transaction id
        return tx.id;

    }


    /**
     * Update the specified resource.
     * 
     * @param {string} resourceId - The resource id
     * @param {Object} data  - The data to update
     */
    async updateResource(resourceId, data) {
        this.log(`updateResource(${resourceId}, ${JSON.stringify(data)})`);

        if (!resourceId) throw new Error("Unable to update resource: missing id");
        if (!data) throw new Error("Unable to update resource: missing data");

        // Check resource
        let [resource] = await this.store.search("resources", { id: resourceId });
        if (!resource) throw new Error(`Unable to update resource: resource ${resourceId} not found`);

        // Acquire locks
        //let lock = this.utils.uuid();
        let [domain] = await this.store.search("domains", { id: resource.domain } /*, { lock: lock }*/ );
        if (!domain) throw new Error(`Unable to update resource: domain ${resource.domain} not found`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_RESOURCE_UPDATE,
            target: resourceId
        });

        // Start async operation
        let promise = this.drivers[domain.type].updateResource(domain, resource, data, { tx: tx });
        promise
            .then(async resource => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            })
            /*.finally(async res => {
                // Release locks
                await this.store.search("domains", { id: resource.domain }), { unlock: lock };
            })*/
        ;

        // return transaction id
        return tx.id;
    }

    /**
     * Remove the specified resource.
     * 
     * @param {string} resourceId - The resource id
     */
    async removeResource(resourceId) {
        this.log(`removeResource(${resourceId})`);

        if (!resourceId) throw new Error("Unable to remove resource: missing id");

        // Check resource
        let [resource] = await this.store.search("resources", { id: resourceId });
        if (!resource) throw new Error(`Unable to update resource: resource ${resourceId} not found`);

        // Acquire locks
        //let lock = this.utils.uuid();
        let [domain] = await this.store.search("domains", { id: resource.domain } /*, { lock: lock }*/ );
        if (!domain) throw new Error(`Unable to remove resource: domain ${resource.domain} not found`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_RESOURCE_REMOVE,
            target: resourceId
        });

        // Start async operation
        let promise = this.drivers[domain.type].removeResource(domain, resource, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                //await this.store.search("domains", { id: resource.domain }), { unlock: lock };
            });

        // return transaction id
        return tx.id;
    }

    /**
     * List the specified resources.
     * 
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listResources(query, opts) {
        this.log(`listResources(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);
        query = query || {};
        opts = opts || {};
        let result = await this.store.search("resources", query, opts);
        return result;
    }

    // ----------------------------------------------------------
    //            Collections 
    // ----------------------------------------------------------

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
        opts = opts || {};
        if (!query.state) query.state = "ready";
        let result = await this.store.search("collections", query, opts);
        return result;
    }

    /**
     * Add new collection to the domain.
     * 
     * @param {string} domainId - The domain
     * @param {Object} collection - The collection
     * @param {Array<string>} [collection.labels] - The collection labels
     * @param {boolean} [collection.proxy] - Collection with reverse proxy
     * @param {boolean|string} [collection.proxyAddr] - Reverse proxy address, if any
     * @param {Object} [collection.publish] - Published inputs {input: {protocol, path}}
     * @param {Object} [collection.inputs] - Dictionary with collection inputs {name: protocol}
     * @param {Object} [collection.outputs] - Dictionary with collection outputs {name: protocol}
     * @param {Object} ctxt - The operation context
     * @return {Object} The added collection
     */
    async addCollection(domainId, collection) {
        this.log(`addCollection(${domainId},${JSON.stringify(collection)})`);
        if (!domainId) throw new Error("Unable to add collection: missing domain identifier");

        collection = collection || {};

        if (collection.publish && _.keys(collection.publish).length && !collection.proxy) throw Error(`Unable to add collection: missing reverse proxy in published collection`);
        if (collection.publish && _.keys(collection.publish).length) {
            for (let input in collection.publish) {
                if (!collection.inputs || !collection.inputs[input]) throw new Error(`Unable to add collection: missing published input ${input}`);
                if (!collection.publish[input].protocol) throw new Error(`Unable to add collection: missing protocol in published input ${input}`);
                if (["http", "https"].includes(collection.publish[input].protocol) && !collection.publish[input].path) throw new Error(`Unable to add collection: missing path in published input ${input}`);
            }
        }

        // Search for domain
        let [domain] = await this.store.search("domains", { id: domainId });
        if (!domain) throw new Error(`Unable to add collection: domain ${domainId} not found`);

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_COLLECTION_ADD,
            data: JSON.stringify(collection)
        });

        // Start async operation
        let promise = this.drivers[domain.type].addCollection(domain, collection, { tx: tx });
        promise
            .then(async collection => {
                await this.services.transaction.completeTransaction(tx.id, { target: collection.id });
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            });

        // return transaction id
        return tx.id;
    }

    /**
     * Remove the specified collections and all its members.
     * 
     * @param {string} collectionId - The collection
     */
    async removeCollection(collectionId) {
        this.log(`removeCollection(${collectionId})`);

        if (!collectionId) throw new Error("Unable to remove collection: missing collection identifier");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [collection] = await this.store.search(
            "collections", { id: collectionId } /*, { lock: lock }*/
        );
        if (!collection) throw new Error(`Unable to remove collection: collection ${collectionId} not found`);

        // Search domain
        let [domain] = await this.store.search("domains", { id: collection.domain });

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_COLLECTION_REMOVE,
            target: collectionId
        });

        // Start async operation
        let promise = this.drivers[domain.type].removeCollection(domain, collection, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                /*await this.store.search(
                    "collections", { id: collectionId }, { unlock: lock }
                );*/
            });

        // return transaction id
        return tx.id;
    }

    /**
     * Notifies an event to all the members of the specified collection.
     * 
     * @param {Object} collectionId - The collection
     * @param {string} event - The event
     * @param {object} [event.target] - The event target, as a query
     * @param {string|Array<string>} event.cmd - The event command
     */
    async eventCollection(collectionId, event) {
        this.log(`eventCollection(${collectionId},${JSON.stringify(event)})`);

        if (!collectionId) throw new Error("Unable to event collection: missing collection identifier");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [collection] = await this.store.search(
            "collections", { id: collectionId } /*, { lock: lock }*/
        );
        if (!collection) throw new Error(`Unable to event collection: collection ${collectionId} not found`);

        // Search domain
        let [domain] = await this.store.search("domains", { id: collection.domain });

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_COLLECTION_EVENT,
            target: collectionId,
            data: JSON.stringify(event)
        });

        // Start async operation
        let promise = this.drivers[domain.type].eventCollection(domain, collection, event, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                /*await this.store.search(
                    "collections", { id: collectionId }, { unlock: lock }
                );*/
            });

        // return transaction id
        return tx.id;

    }

    // ----------------------------------------------------------
    //            Links 
    // ----------------------------------------------------------

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
        opts = opts || {};
        let result = await this.store.search("links", query, opts);
        return result;
    }

    /**
     * Add new link between two collections.
     * 
     * @param {Object} link - The link info
     * @param {Array<string>} [link.labels] - The link labels
     * @param {string|Object} link.src - The link source
     * @param {string} link.src.collection - The source collection
     * @param {string} link.src.name - The source endpoint name
     * @param {string|Object} link.dst - The link destination
     * @param {string} link.dst.colllection - The destination collection
     * @param {string} link.dst.name - The destination endpoint name
     */
    async addLink(link) {
        this.log(`addLink(${JSON.stringify(link)})`);
        if (!link.src) throw new Error("Unable to add link: missing source");
        if (!link.dst) throw new Error("Unable to add link: missing destination");

        let srcCol, srcName, dstCol, dstName;
        if (_.isString(link.src))[srcCol, srcName] = link.src.split(":");
        else {
            srcCol = link.src.collection;
            srcName = link.src.name;
        }
        if (_.isString(link.dst))[dstCol, dstName] = link.dst.split(":");
        else {
            dstCol = link.dst.collection;
            dstName = link.dst.name;
        }

        if (!srcCol) throw new Error("Unable to add link: missing source collection");
        if (!srcName) throw new Error("Unable to add link: missing source endpoint");
        if (!dstCol) throw new Error("Unable to add link: missing destination collection");
        if (!dstName) throw new Error("Unable to add link: missing destination endpoint");

        link.src = {
            collection: srcCol,
            name: srcName
        };

        link.dst = {
            collection: dstCol,
            name: dstName
        };

        // Search collections
        let collections = await this.store.search(
            "collections", { id: { "$in": [srcCol, dstCol] } }
        );
        if (collections.length < 2) throw new Error(`Unable to add link: peer collections not found`);
        let src, dst;
        if (collections[0].id == srcCol)[src, dst] = collections;
        else [dst, src] = collections;

        if (src.domain != dst.domain) throw new Error(`Unable to add link: source and destination collections belong to different domains`);

        if (!src.outputs[srcName] || !dst.inputs[dstName]) throw new Error(`Unable to add link: source or destination names not found in involved collections`);
        //if (src.outputs[srcName] != dst.inputs[dstName]) throw new Error(`Unable to add link: source or destination protocols do not match`);

        // Search domain
        let [domain] = await this.store.search("domains", { id: src.domain });

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_LINK_ADD,
            data: JSON.stringify(link)
        });

        // Start async operation
        let promise = this.drivers[domain.type].addLink(domain, link, src, dst, { tx: tx });
        promise
            .then(async link => {
                await this.services.transaction.completeTransaction(tx.id, { target: link.id });
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
            });

        // return transaction id
        return tx.id;
    }

    /**
     * Remove the specified link.
     * 
     * @param {string} linkId - The link
     */
    async removeLink(linkId) {
        this.log(`removeLink(${linkId})`);

        if (!linkId) throw new Error("Unable to remove link: missing link identifier");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [link] = await this.store.search(
            "links", { id: linkId } /*, { lock: lock }*/
        );
        if (!link) throw new Error(`Unable to remove link: link ${linkId} not found`);


        // Search domain
        let [domain] = await this.store.search("domains", { id: link.domain });

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_LINK_REMOVE,
            target: linkId
        });

        // Start async operation
        let promise = this.drivers[domain.type].removeLink(domain, link, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                /*await this.store.search(
                    "links", { id: linkId }, { unlock: lock }
                );*/
            });

        // return transaction id
        return tx.id;
    }

    // ----------------------------------------------------------
    //            Instances 
    // ----------------------------------------------------------


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
        opts = opts || {};
        if (!query.state) query.state = { $in: ["ready", "failed"] };
        let result = await this.store.search("instances", query, opts);
        return result;
    }

    /**
     * Add new instance to the collection.
     * 
     * @param {string} collectionId - The collection
     * @param {Object} instance - The instance
     * @param {Array<string>} [instance.labels] - The instance labels
     * @param {string} [instance.addr] - The instance address
     * @param {boolean} [instance.proxy] - Is proxy?
     * @param {string} [instance.proxyTarget] - The proxy target id or route
     * @param {string} [instance.source] - The instance source
     * @param {string} [instance.runtime] - The instance runtime
     * @param {Object} [instance.variables] - The instance variables
     * @param {string} [instance.durability] - The instance durability
     * @param {Object} [instance.events] - The instance event handlers
     */
    async addInstance(collectionId, instance) {
        this.log(`addInstance(${collectionId},${JSON.stringify(instance)})`);

        if (!collectionId) throw new Error("Unable to add instance: missing collection identifier");
        if (!instance) throw new Error("Unable to add instance: missing instance data");

        // Fill missing data
        instance.durability = instance.durability || "ephemeral";
        instance.variables = instance.variables || {};
        instance.events = instance.events || {};

        if (instance.proxy) {
            if (!instance.proxyTarget) throw new Error("Unable to add instance: missing proxy target");

            // Search proxy target
            if (!instance.proxyTarget.includes(":")) {
                let [target] = await this.store.search("instances", { id: instance.proxyTarget });
                if (!target) throw new Error(`Unable to add instance: proxy target ${instance.proxyTarget} not found`);
                // Set real target
                instance.proxyTarget = target.proxyAddr;
            }

        } else {
            if (!instance.source) throw new Error("Unable to add instance: missing instance source");
            if (!instance.runtime) throw new Error("Unable to add instance: missing instance runtime");
        }

        // Search collection
        let [collection] = await this.store.search("collections", { id: collectionId });
        if (!collection) throw new Error(`Unable to add instance: collection ${collectionId} not found`);

        // Search domain
        let [domain] = await this.store.search("domains", { id: collection.domain });


        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_INSTANCE_ADD,
            data: JSON.stringify(instance)
        });

        // Start async operation
        let promise = this.drivers[domain.type].addInstance(domain, collection, instance, { tx: tx });
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
     * Remove the specified instance.
     * 
     * @param {string} instanceId - The instance
     */
    async removeInstance(instanceId) {
        this.log(`removeInstance(${instanceId})`);

        if (!instanceId) throw new Error("Unable to remove instance: missing instance identifier");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [instance] = await this.store.search(
            "instances", { id: instanceId } /*, { lock: lock }*/
        );
        if (!instance) throw new Error(`Unable to remove instance: instance ${instanceId} not found`);

        // Select domain
        let [domain] = await this.store.search("domains", { id: instance.domain });

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_INSTANCE_REMOVE,
            target: instanceId
        });

        // Start async operation
        let promise = this.drivers[domain.type].removeInstance(domain, instance, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                /*await this.store.search(
                    "instances", { id: instanceId, domain: domain.id }, { unlock: lock }
                );*/
            });

        // return transaction id
        return tx.id;

    }

    /**
     * Notifies an event to the specified instance.
     * 
     * @param {string} instanceId - The instance
     * @param {Object} event - The event
     * @param {string|Array<string>} event.cmd - The event command
     */
    async eventInstance(instanceId, event) {
        this.log(`eventInstance(${instanceId},${JSON.stringify(event)})`);

        if (!instanceId) throw new Error("Unable to event instance: missing instance identifier");

        // Acquire locks
        //let lock = this.utils.uuid();
        let [instance] = await this.store.search(
            "instances", { id: instanceId } /*, { lock: lock }*/
        );
        if (!instance) throw new Error(`Unable to event instance: instance ${instanceId} not found`);

        // Search domain
        let [domain] = await this.store.search("domains", { id: instance.domain });

        // Start tx (likely to be a time-consuming operation)
        let tx = await this.services.transaction.startTransaction({
            type: this.utils.constants.TRANSACTION_INSTANCE_EVENT,
            target: instanceId,
            data: JSON.stringify(event)
        });

        // Start async operation
        let promise = this.drivers[domain.type].eventInstance(domain, instance, event, { tx: tx });
        promise
            .then(async() => {
                await this.services.transaction.completeTransaction(tx.id);
            })
            .catch(async err => {
                await this.services.transaction.abortTransaction(tx.id, err);
                // Release locks
                /*await this.store.search(
                    "instances", { id: instanceId }, { unlock: lock }
                );*/
            });

        // return transaction id
        return tx.id;
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





}


module.exports = (...opts) => {
    return new DomainService(...opts);
}