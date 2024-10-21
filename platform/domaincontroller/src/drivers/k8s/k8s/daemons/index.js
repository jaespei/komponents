module.exports = (store, utils) => {
    let daemons = [];
    daemons.push(require("./links")(store, utils));
    daemons.push(require("./instances")(store, utils));
    for (let daemon of daemons) {
        daemon.start();
    }
    return daemons;
}