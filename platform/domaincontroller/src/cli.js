#!/usr/bin/env node

const repl = require("repl");
const fs = require("fs");

const _ = require("lodash");
const axios = require("axios");
const Q = require("q");

const app = require("./app");
const server = require("./server");
const api = require("./api");

const HOST = process.env.HOST || "0.0.0.0:10000";

let argv = process.argv.slice(2);

/**
 * Print CLI usage info.
 */
function error(msg) {
    let str = "";
    if (msg) str += msg + "\n";
    str += `
Usage: cli.js <command> [options]
Server related commands:
    start [-h <host>]      Start the server
    info [-h <host>]       List info
    
Domain related commands:
    domain add -t <type> [-g <gateway>] [-f <file>] [-n <name>] [-x key=val] [-w]
    domain remove -d <domain> [-w]
    domain list [-q <query>] [-o <opts>]

Resource related commands:
    resource add -d <domain> -t <type> [-x key=val] [-w]
    resource remove -r <resource> [-w]
    resource list [-q <query>] [-o <opts>]
    
Collection related commands:
    collection add -d <domain> [-n <name>] [-p] [-inputs inputs] [-publish publish] [-x key=val] [-w]
    collection remove -c <collection> [-w]
    collection list [-q <query>] [-o <opts>]

Link related commands:
    link add -src <col:name> -dst <col:name> [-n <name>] [-x key=val] [-w]
    link remove -l <link> [-w]
    link list [-q <query>] [-o <opts>]
    
Instance related commands:
    instance add -c <collection> -s <source> -r <runtime> [-t <proxy_target>] [-x key=val] [-w]
    instance remove -i <instance> [-w]
    instance list [-q <query>] [-o <opts>]

Transaction related commands:
    transaction list [-q <query>] [-o <opts>]
    `;

    console.log(str);
    process.exit(-1);

}

/**
 * Execute the provided function a number of times
 *
 * @param {Function} fn - The function to execute
 * @param {Object} [opts] - Additional options
 * @param {number} [opts.retry] - The retry timeout (default 5s)
 * @param {number} [opts.count] - Max number of retries
 * @param {number} [opts.timeout] - Max waiting time (default 5m)
 */
function loop(fn, opts) {
    console.log(`loop(${JSON.stringify(opts)})`);
    opts = opts || {};
    opts.retry = opts.retry || 5000;
    opts.timeout = opts.timeout || 300000;

    let deferred = Q.defer();
    let count = 0,
        ts = Date.now();
    let wrappedFn = async () => {
        let result;
        try {
            result = await fn();
        } catch (err) {
            deferred.reject(err);
            return;
        }
        if (result) deferred.resolve(result);
        else {
            if (opts.count) {
                count++;
                if (count == opts.count) {
                    deferred.reject(new Error("Loop operation exceeded maximum number of retries"));
                    return;
                }
            }
            if (opts.timeout && Date.now() - ts > opts.timeout) {
                deferred.reject(new Error("Loop operation expired timeout"));
                return;
            }
            setTimeout(wrappedFn, opts.retry);
        }
    }
    wrappedFn();
    return deferred.promise;
}


/**
 * REPL context
 */
let context = {
    help() {
        error();
    },
    error(err) {
        if (err.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.log(`ERROR: status=${err.response.status}, data=${JSON.stringify(err.response.data, undefined, 4)}`);
        } /*else if (err.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.log(`ERROR: request=${err.request}`);
        }*/ else {
            // Something happened in setting up the request that triggered an Error
            console.log(`ERROR: type=${err.type}, message=${err.message}, stack=${err.stack}`);
        }
    },
    cb(res) {
        if (res instanceof Error) context.error(res);
        else console.log(JSON.stringify(res, undefined, 4));
    },
    async exit() {
        process.exit(0);
    },
    async start(opts) {
        if (context.server) throw new Error("Unable to start: server already running");

        opts = opts || gopts || {};
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts: ${JSON.stringify(opts)}`);

        // Start app
        context.app = await app();

        // Start server
        context.server = server(context.app, opts);
        context.server.start();
    },
    async stop(opts) {
        opts = opts || gopts || {};
        if (context.server) {

            // if local server
            context.server.stop();
            delete context.server;

        } else {

            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            try {
                await axios.delete(`http://${opts.addr}:${opts.port}/`);
            } catch (err) {
                context.error(err);
            }

        }

    },
    async info(opts) {
        opts = opts || gopts || {};
        if (context.server) {
            console.log("Server configuration:");
            console.log(JSON.stringify(context.server.opts, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            try {
                let { data } = await axios(`http://${opts.addr}:${opts.port}/`);
                console.log(JSON.stringify(data, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    },
    async addDomain(opts) {
        opts = opts || gopts || {};
        if (!opts.type) error("Missing domain type");

        let domain = {
            type: opts.type,
            name: opts.name,
            gateway: opts.gateway
        };
        if (opts.file) domain.kubeconfig = fs.readFileSync(opts.file).toString();

        // extra options
        _.each(opts.extra, opt => {
            domain[opt.key] = opt.value;
        });

        if (context.server) {
            let result = await context.app.services.domain.addDomain(domain);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            [result] = await context.app.services.domain.listDomains({ id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, domain=${JSON.stringify(domain)}`);

            try {
                let result = await api(opts).addDomain(domain);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                [result] = await api(opts).listDomains({ id: tx.target });
                                return result;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async removeDomain(opts) {
        opts = opts || gopts || {};
        if (!opts.domain) error("Missing domain");

        if (context.server) {
            let result = await context.app.services.domain.removeDomain(opts.domain);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, domain=${JSON.stringify(opts.domain)}`);

            try {
                let result = await api(opts).removeDomain(opts.domain);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                return true;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }

    },
    async listDomain(opts) {
        context.listDomains(opts);
    },
    async listDomains(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.domain.listDomains(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listDomains(q, o);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }

    },
    async addResource(opts) {
        opts = opts || gopts || {};
        if (!opts.domain) error("Missing domain");
        if (!opts.type) error("Missing resource type");

        let resource = {
            domain: opts.domain,
            type: opts.type
        };

        // extra options
        _.each(opts.extra, opt => {
            resource[opt.key] = opt.value;
        });

        if (context.server) {
            let result = await context.app.services.domain.addResource(resource);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            [result] = await context.app.services.domain.listResources({ id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, resource=${JSON.stringify(resource)}`);

            try {
                let result = await api(opts).addResource(resource);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                [result] = await api(opts).listResources({ id: tx.target });
                                return result;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async removeResource(opts) {
        opts = opts || gopts || {};
        if (!opts.resource) error("Missing resource");

        if (context.server) {
            let result = await context.app.services.domain.removeResource(opts.resource);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, resource=${JSON.stringify(opts.resource)}`);

            try {
                let result = await api(opts).removeResource(opts.resource);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                return true;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async listResource(opts) {
        context.listResources(opts);
    },
    async listResources(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.domain.listResources(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listResources(q, o);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    },
    async addCollection(opts) {
        opts = opts || gopts || {};
        if (!opts.domain) error("Missing domain");

        let collection = {
            proxy: opts.proxy,
            name: opts.name,
            inputs: opts.inputs,
            publish: opts.publish
        };

        // extra options
        _.each(opts.extra, opt => {
            collection[opt.key] = opt.value;
        });

        if (context.server) {
            let result = await context.app.services.domain.addCollection(otps.domain, collection);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            [result] = await context.app.services.domain.listCollections({ id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, collection=${JSON.stringify(collection)}`);

            try {
                let result = await api(opts).addCollection(opts.domain, collection);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                [result] = await api(opts).listCollections({ id: tx.target });
                                return result;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async removeCollection(opts) {
        opts = opts || gopts || {};
        if (!opts.collection) error("Missing collection");

        if (context.server) {
            let result = await context.app.services.domain.removeCollection(opts.collection);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, domain=${JSON.stringify(opts.collection)}`);

            try {
                let result = await api(opts).removeCollection(opts.collection);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                return true;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async listCollection(opts) {
        context.listCollections(opts);
    },
    async listCollection(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.domain.listCollections(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listCollections(q, o);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    },
    async addLink(opts) {
        opts = opts || gopts || {};
        if (!opts.source) error("Missing source collection");
        if (!opts.destination) error("Missing destination collection");

        let link = {
            src: opts.source,
            dst: opts.destination,
            name: opts.name
        };

        // extra options
        _.each(opts.extra, opt => {
            link[opt.key] = opt.value;
        });

        if (context.server) {
            let result = await context.app.services.domain.addLink(link);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            [result] = await context.app.services.domain.listLinks({ id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, link=${JSON.stringify(link)}`);

            try {
                let result = await api(opts).addLink(link);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                [result] = await api(opts).listLinks({ id: tx.target });
                                return result;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async removeLink(opts) {
        opts = opts || gopts || {};
        if (!opts.link) error("Missing link");

        if (context.server) {
            let result = await context.app.services.domain.removeLink(opts.link);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, link=${JSON.stringify(opts.link)}`);

            try {
                let result = await api(opts).removeLink(opts.link);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                return true;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async listLink(opts) {
        context.listLinks(opts);
    },
    async listLinks(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.domain.listLinks(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listLinks(q, o);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    },
    async addInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.collection) error("Missing collection");
        if (!opts.source) error("Missing source");
        if (!opts.runtime) error("Missing runtime");

        let inst = {
            source: opts.source,
            runtime: opts.runtime,
            proxy: opts.target ? true : false,
            proxyTarget: opts.target
        };

        // extra options
        _.each(opts.extra, opt => {
            inst[opt.key] = opt.value;
        });

        if (context.server) {
            let result = await context.app.services.domain.addInstance(opts.collection, inst);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            [result] = await context.app.services.domain.listInstances({ id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, instance=${JSON.stringify(inst)}`);

            try {
                let result = await api(opts).addInstance(opts.collection, inst);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                [result] = await api(opts).listInstances({ id: tx.target });
                                return result;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async removeInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.instance) error("Missing instance");

        if (context.server) {
            let result = await context.app.services.domain.removeInstance(opts.instance);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let [tx] = await context.app.services.transaction.listTransactions({ id: result });
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect

            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, instance=${JSON.stringify(opts.instance)}`);

            try {
                let result = await api(opts).removeInstance(opts.instance);
                if (opts.wait) {
                    console.log("Waiting ...");
                    try {
                        result = await loop(async () => {
                            let [tx] = await api(opts).listTransactions({ id: result });
                            if (tx.state == "Completed") {
                                return true;
                            } else if (tx.state == "Aborted") {
                                throw new Error(tx.err);
                            }
                        });
                    } catch (err) {
                        context.error(err);
                    }
                }
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }
        }
    },
    async listInstance(opts) {
        context.listInstances(opts);
    },
    async listInstances(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.domain.listInstances(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listInstances(q, o);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    },
    async listTransaction(opts) {
        context.listTransactions(opts);
    },
    async listTransactions(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.transaction.listTransactions(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listTransactions(q, o);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    }
};


// Process CLI
let cmd, gopts = {};
while (argv.length) {
    switch (argv[0]) {
        case "start":
        case "info":
            cmd = argv[0];
            argv.shift();
            break;
        case "domain":
        case "resource":
        case "collection":
        case "link":
        case "instance":
        case "transaction": {
            let tmp = argv.shift();
            if (!argv.length) error();
            switch (argv[0]) {
                case "add":
                case "remove":
                case "list":
                    cmd = argv.shift() + tmp.charAt(0).toUpperCase() + tmp.slice(1);
                    break;
                default:
                    error();
            }
            break;
        }
        case "-h":
        case "--host":
            argv.shift();
            if (!argv.length) error();
            gopts.host = argv[0];
            argv.shift();
            break;
        case "-t":
        case "--type":
            argv.shift();
            if (!argv.length) error();
            gopts.type = argv[0];
            argv.shift();
            break;
        case "-g":
        case "--gateway":
            argv.shift();
            if (!argv.length) error();
            gopts.gateway = argv[0];
            argv.shift();
            break;
        case "-n":
        case "--name":
            argv.shift();
            if (!argv.length) error();
            gopts.name = argv[0];
            argv.shift();
            break;
        case "-d":
        case "--domain":
            argv.shift();
            if (!argv.length) error();
            gopts.domain = argv[0];
            argv.shift();
            break;
        case "-inputs":
        case "--inputs":
            argv.shift();
            if (!argv.length) error();
            gopts.inputs = JSON.parse(argv[0]);
            argv.shift();
            break;
        case "-publish":
        case "--publish":
            argv.shift();
            if (!argv.length) error();
            gopts.publish = JSON.parse(argv[0]);
            argv.shift();
            break;
        case "-q":
        case "--query":
            argv.shift();
            if (!argv.length) error();
            gopts.query = JSON.parse(argv[0]);
            argv.shift();
            break;
        case "-o":
        case "--opts":
            argv.shift();
            if (!argv.length) error();
            gopts.opts = JSON.parse(argv[0]);
            argv.shift();
            break;
        case "-p":
        case "--proxy":
            argv.shift();
            gopts.proxy = true;
            break;
        case "-c":
        case "--collection":
            argv.shift();
            if (!argv.length) error();
            gopts.collection = argv[0];
            argv.shift();
            break;
        case "-i":
        case "--instance":
            argv.shift();
            if (!argv.length) error();
            gopts.instance = argv[0];
            argv.shift();
            break;
        case "-s":
        case "--source":
            argv.shift();
            if (!argv.length) error();
            gopts.source = argv[0];
            argv.shift();
            break;
        case "-r":
        case "--runtime":
            argv.shift();
            if (!argv.length) error();
            gopts.runtime = argv[0];
            argv.shift();
            break;
        case "-t":
        case "--target":
            argv.shift();
            if (!argv.length) error();
            gopts.target = argv[0];
            argv.shift();
            break;
        case "-r":
        case "--resource":
            argv.shift();
            if (!argv.length) error();
            gopts.resource = argv[0];
            argv.shift();
            break;
        case "-src":
        case "--source":
            argv.shift();
            if (!argv.length) error();
            gopts.source = argv[0];
            argv.shift();
            break;
        case "-dst":
        case "--destination":
            argv.shift();
            if (!argv.length) error();
            gopts.destination = argv[0];
            argv.shift();
            break;
        case "-f":
        case "--file":
            argv.shift();
            if (!argv.length) error();
            gopts.file = argv[0];
            argv.shift();
            break;
        case "-l":
        case "--link":
            argv.shift();
            if (!argv.length) error();
            gopts.link = argv[0];
            argv.shift();
            break;
        case "-x":
        case "--extra":
            argv.shift();
            if (!argv.length) error();
            gopts.extra = gopts.extra || [];
            let [key, value] = argv[0].split("=");
            if (!value) error("Missing key=value in -x option");
            gopts.extra.push({ key: key, value, value });
            argv.shift();
            break;
        case "-w":
        case "--wait":
            argv.shift();
            gopts.wait = true;
            break;
        default:
            if (argv[0].startsWith("--")) {
                if (argv.length > 1) {
                    gopts[argv[0].slice(2)] = argv[1];
                    argv.shift(); argv.shift();
                } else {
                    gopts[argv[0].slice(2)] = true;
                }
            } else if (argv[0].startsWith("-")) {
                if (argv.length > 1) {
                    gopts[argv[0].slice(1)] = argv[1];
                    argv.shift(); argv.shift();
                } else {
                    gopts[argv[0].slice(1)] = true;
                }
            } else error(`Unsupported option ${argv[0]}`);
    }
}


if (cmd) {
    let f = async () => {
        await context[cmd].apply(context, gopts);
        if (cmd == "start") {
            let cli = repl.start({ prompt: "domain > " });
            Object.assign(cli.context, context);
            context = cli.context;

            /*cli.on('exit', () => {
                console.log('Exiting ...');
                if (context.server) context.stop();
                process.exit();
            });*/

        }
    }
    f();
} else error("No command");