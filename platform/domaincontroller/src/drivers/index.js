module.exports = (store, utils) => {
    
    let drivers = {};
    
    // Load base drivers, reused by others
    Object.assign(drivers, require("./base")(utils));

    // Load reminder drivers (k8s, docker, vbox, etc.)
    Object.assign(drivers, require("./k8s")(drivers, store, utils));
    Object.assign(drivers, require("./docker")(drivers, store, utils));
    
    return drivers;
}