/**
 * Useful constants.
 */
module.exports = {
    STORE_URL: "level:database",

    TRANSACTION_INSTANCE_ADD: "InstanceAdd",
    TRANSACTION_INSTANCE_UPDATE: "InstanceUpdate",
    TRANSACTION_INSTANCE_REMOVE: "InstanceRemove",

    TRANSACTION_STATE_STARTED: "Started",
    TRANSACTION_STATE_COMPLETED: "Completed",
    TRANSACTION_STATE_ABORTED: "Aborted",


    CONNECTOR_CIDR: "172.16.0.0/12",

    DAEMON_INTERVAL: 5000,  // 5s
    DAEMON_TIMEFRAME: 60000, // 60 s

}