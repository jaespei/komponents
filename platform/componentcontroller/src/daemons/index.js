module.exports = (schedulers, services, store, utils) => {
    let daemons = [];
    daemons.push(require("./projections")(services, store, utils));
    daemons.push(require("./schedule")(schedulers, services, store, utils));
    for (let daemon of daemons) {
        daemon.start();
    }
    return daemons;
}