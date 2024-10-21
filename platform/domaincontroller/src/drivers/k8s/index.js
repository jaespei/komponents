

module.exports = (drivers, store, utils) => {
    return {
        "external/k8s": require("./external")(drivers, store, utils),
        "kind/k8s": require("./kind")(drivers, store, utils)
    }
    /*return {
        "metal/k8s": Object.assign(require("./metal")(drivers, store, utils), require("./k8s")(drivers, store, utils)),
        "kind/k8s": Object.assign(require("./kind")(drivers, store, utils), require("./k8s")(drivers, store, utils)),
        "external/k8s": Object.assign(require("./external")(drivers, store, utils), require("./k8s")(drivers, store, utils)),
     };*/
}