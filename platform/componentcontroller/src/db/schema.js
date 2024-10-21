module.exports = {
    version: "1.0",
    collections: {
        transactions: { // externally issued time expensive operations
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
        instances: { // instances added to the system
            "*id": "str",
            type: "str", // "composite", "basic", "connector"
            title: "str", // title
            parent: "str", // parent composite instance
            subcomponent: "str", // subcomponent name
            connector: "str", // connector name
            labels: "str[]",
            model: "dict", // instance model
            collection: "str", // collection where the instance is included
            domain: "str", // domain where the real instance is executing
            addr: "str", // instance address
            proxyAddr: "str",   // address for proxies
            data: "dict",
            state: "str",
            last: "int"
        },
        collections: { // collections of basic instances
            "*id": "str",
            parent: "str", // parent composite instance
            name: "str", // it matches the subcomponent/connector name
            /*subcomponent: "str",
            connector: "str",*/
            labels: "str[]",
            addr: "str", // address of the collection proxy (if any)
            domains: "str[]", // domains where the collection of instances must run
            publish: "bool",
            publishInputs: "dict",
            publishPaths: "str[]",
            inputs: "dict",     // collection inputs {name: protocol}
            outputs: "dict",    // collection outputs {name: protocol}   
            members: "str[]",   // collection members
            data: "dict",
            state: "str",
            last: "int"
        },
        links: { // links between collections of basic instances
            "*id": "str",
            labels: "str[]",
            //name: "str",            // link name (from source)
            protocol: "str", // link protocol: tcp:8080
            src: "str", // source collection
            srcName: "str", // source name
            dst: "str", // destination collection
            dstName: "str", // destination name
            data: "dict",
            state: "str",
            last: "int"
        }
    }
}