module.exports = {
    version: "1.0",
    collections: {
        transactions: {
            "*id": "str",
            "-parent": "str", // for hierarchical transactions
            "-type": "str", // transaction type
            "-target": "str", // the transaction target (if any)        
            state: "str", // "started", "completed", "aborted"
            data: "str", // optional data
            err: "str", // transaction error, if any
            ini: "int", // starting time
            last: "int" // last modification time
        },
        domains: {
            "*id": "str",
            type: "str", // "k8s/metal", "k8s/gke", etc.
            title: "str", // domain title
            labels: "str[]", // domain labels
            gateway: "str", // domain gateway
            ingress: "str", // domain ingress
            sIngress: "str", // domain secure ingress
            runtimes: "str[]", // supported runtimes
            cfg: "dict", // domain internal configuration
            data: "dict", // domain internal data
            state: "str", // domain state: "init", "ready", "failed", "destroy"
            last: "int", // last modification time
        },
        resources: {
            "*id": "str",
            type: "str", // "fabric", "vhost", "host", etc.
            domain: "str", // the domain the resource belongs to
            title: "str", // The resource title
            url: "str", // the resource url
            labels: "str[]", // the resource labels
            owner: "str", // the resource owner (e.g. fabric, etc.)
            role: "str", // the resource role (e.g. "master", "worker", etc.)
            metrics: "dict", // usage metrics: {mem, cpu}
            cfg: "dict",
            data: "dict",
            state: "str", // "init", "ready", "failed"     
            last: "int", // last modification time
        },
        collections: {
            "*id": "str",
            domain: "str",
            labels: "str[]",
            name: "str",
            proxy: "bool", // collection with reverse proxy?
            proxyAddr: "str", // address if reverse proxy
            publish: "bool", // collection is published
            publishPaths: "str[]", // published paths (e.g. tcp:80, http/path)
            publishInputs: "dict", // published inputs {input: path}
            inputs: "dict", // collection inputs {name: protocol}
            outputs: "dict", // collection outputs {name: protocol}     
            members: "str[]", // collection members
            cfg: "dict", // { privateAddr: service addr, endpoints: service endpoints }
            data: "dict",
            state: "str",
            last: "int"
        },
        links: {
            "*id": "str",
            domain: "str",
            labels: "str[]",
            //name: "str",              // link name
            protocol: "str", // link protocol: tcp:8080
            src: "str", // source collection
            srcName: "str", // source name
            srcProtocol: "str", // source protocol
            dst: "str", // destination collection
            dstName: "str", // destination name
            dstProtocol: "str", // destination protocol
            cfg: "dict", // link configuration
            data: "dict",
            state: "str",
            last: "int"
        },
        instances: {
            "*id": "str",
            domain: "str",
            collection: "str", // the collection this instance belongs to
            labels: "str[]",
            addr: "str", // the instance address
            proxy: "bool", // instance proxy?
            proxyTarget: "str", // instance target if proxy
            proxyAddr: "str", // address for proxies
            inputs: "dict", // <link-name> -> <list-of-instances>
            outputs: "dict", // <link-name> -> <list-of-instances>|<collection>(if reverse proxy)
            cfg: "dict", // privateAddr, prox source, runtime, durability, etc.
            data: "dict",
            state: "str", // "init", "ready", "failed", "destroy"
            last: "int"
        },
        volumes: {
            "*id": "str",
            domain: "str",
            labels: "str[]",
            collection: "str",
            instance: "str",
            scope: "str",
            cfg: "dict",
            data: "dict",
            state: "str",
            last: "int"
        }
    }
}