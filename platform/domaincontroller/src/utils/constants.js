/**
 * Useful constants.
 */
module.exports = {
    STORE_URL: "level:database",

    TRANSACTION_DOMAIN_ADD: "DomainAdd",
    TRANSACTION_DOMAIN_UPDATE: "DomainUpdate",
    TRANSACTION_DOMAIN_REMOVE: "DomainRemove",
    TRANSACTION_RESOURCE_ADD: "ResourceAdd",
    TRANSACTION_RESOURCE_UPDATE: "ResourceUpdate",
    TRANSACTION_RESOURCE_REMOVE: "ResourceRemove",
    TRANSACTION_COLLECTION_ADD: "CollectionAdd",
    TRANSACTION_COLLECTION_REMOVE: "CollectionRemove",
    TRANSACTION_COLLECTION_EVENT: "CollectionEvent",
    TRANSACTION_INSTANCE_ADD: "InstanceAdd",
    TRANSACTION_INSTANCE_REMOVE: "InstanceRemove",
    TRANSACTION_INSTANCE_EVENT: "InstanceEvent",
    TRANSACTION_LINK_ADD: "LinkAdd",
    TRANSACTION_LINK_REMOVE: "LinkRemove",
    
    TRANSACTION_STATE_STARTED: "Started",
    TRANSACTION_STATE_COMPLETED: "Completed",
    TRANSACTION_STATE_ABORTED: "Aborted",

    /*EVENT_TRANSACTION_START: "TransactionStart",
    EVENT_TRANSACTION_UPDATE: "TransactionUpdate",
    EVENT_TRANSACTION_COMPLETE: "TransactionComplete",
    EVENT_TRANSACTION_ABORT: "TransactionAbort",*/

    DOMAIN_WORKINGDIR: "working",  // working directory for tmp files


    // DOMAIN K8S
    DOMAIN_K8S_USER: "komponents",
    DOMAIN_K8S_VHOST_MEM: 2000,         // default mem per vhost (2gb)
    DOMAIN_K8S_VHOST_CPU: 1,            // default cpu per vhost (1 core)
    DOMAIN_K8S_PLANNINGSTRATEGY: "random",    // default resourceplanning strategy
    DOMAIN_K8S_WORKINGDIR: "working",
    DOMAIN_K8S_NAMESPACE: "default",
    DOMAIN_K8S_IMAGE_GATEWAY: "gateway:1.0",
    DOMAIN_K8S_IMAGE_PROXY: "proxy:1.0",
    DOMAIN_K8S_IMAGE_SIDECAR: "sidecar:1.0",
    DOMAIN_K8S_GATEWAY_PORT: 10000,
    
    DOMAIN_KIND_MASTERNODES: 1,
    DOMAIN_KIND_WORKERNODES: 0,
    
    DOMAIN_PLANNINGSTRATEY_RANDOM: "random",             // random
    DOMAIN_PLANNINGSTRATEY_CONSERVATIVE: "conservative", // save resources
    DOMAIN_PLANNINGSTRATEGY_BALANCED: "balanced",        // balance resources
    
    RESOURCE_TYPE_FABRIC: "fabric",
    RESOURCE_TYPE_HOST: "host",
    RESOURCE_TYPE_VHOST: "vhost",

    ANSIBLE_TASK_RESULT: "KOMPONENTS_RESULT",    

    HOST_STATE_READY: "ready",
    HOST_STATE_FAILED: "failed",
    HOST_STATE_INIT: "init",
    VHOST_MEM_DEFAULT: 2000,    // default memory per virtual host (2gb)

    DAEMON_INTERVAL: 5000,
    DAEMON_TIMEFRAME: 500000,
    DAEMON_RANGE: 50,
}