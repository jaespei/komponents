#!/usr/bin/env node

const repl = require("repl");
const fs = require("fs");

const _ = require("lodash");
const axios = require("axios");
const Q = require("q");
const YAML = require("yaml");

const app = require("./app");
const server = require("./server");
const api = require("./api");

const HOST = process.env.HOST || "0.0.0.0:9000";
const DOMAIN_HOST = process.env.DOMAIN_HOST || "127.0.0.1:10000";

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
    start [-h <host>] [-d <host>]  Start the server
    info [-h <host>]               List info
    
Instance related commands:
    instance add [-f <file>] [-p <parent>] [-s <subcomponent>] [-c <connector>] [-x key=val] [-w]
    instance update -i <instance> -d <data>
    instance remove -i <instance> [-w]
    instance list [-q <query>] [-o <opts>]
    instance graph [-q <query>] [-o <opts>]
  
Collection related commands:
    collection list [-q <query>] [-o <opts>]
    collection sync [-c <collection>]

Link related commands:
    link list [-q <query>] [-o <opts>]
    
Transaction related commands:
    transactions [-q <query>] [-o <opts>]
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
        opts.domainHost = opts.domainHost || DOMAIN_HOST;
        [opts.domainAddr, opts.domainPort] = opts.domainHost.split(":");

        console.log(`Applying opts: ${JSON.stringify(opts)}`);

        // Start app
        context.app = await app(opts);

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
    async addInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.file && !opts.parent) error("Missing instance data");
        let spec = {
            parent: opts.parent,
            subcomponent: opts.subcomponent,
            connector: opts.connector
        };
        if (opts.file) {
            let deployment = YAML.parse(fs.readFileSync(opts.file).toString());
            spec.model = deployment.model || deployment;
            spec.deployment = deployment.deployment || {};
        }

        if (context.server) {
            let result = await context.app.services.component.addInstance(spec);
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

            console.log(`Applying opts=${JSON.stringify(opts)}, spec=${JSON.stringify(spec)}`);

            try {
                let result = await api(opts).addInstance(spec);
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
    async updateInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.instance) error("Missing instance");
        if (!opts.data) error("Missing instance data");

        if (context.server) {
            let result = await context.app.services.component.updateInstance(opts.instance, opts.data);
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

            console.log(`Applying opts=${JSON.stringify(opts)}, instance=${JSON.stringify(opts.instance)}, data=${JSON.stringify(opts.data)}`);

            try {
                let result = await api(opts).updateInstance(opts.instance, opts.data);
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
    async removeInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.instance) error("Missing instance");

        if (context.server) {
            let result = await context.app.services.component.removeInstance(opts.instance);
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
            let result = await context.app.services.component.listInstances(q, o);
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
    async graphInstance(opts) {
        context.graphInstances(opts);
    },
    async graphInstances(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.component.listGraphs(q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

            try {
                let result = await api(opts).listGraphs(q, o);
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
            let result = await context.app.services.component.listLinks(q, o);
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
    async listCollection(opts) {
        context.listCollections(opts);
    },
    async listCollection(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.component.listCollections(q, o);
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
    /*async syncCollection(opts) {
        context.syncCollections(opts);
    },
    async syncCollections(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        if (context.server) {
            let result = await context.app.services.component.listCollections(q, o);
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
    },*/
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
        case "instance":
        case "collection":
        case "link":
        case "transaction": {
            let tmp = argv.shift();
            if (!argv.length) error();
            switch (argv[0]) {
                case "add":
                case "remove":
                case "list":
                case "sync":
                case "graph":
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
        case "-s":
        case "--subcomponent":
            argv.shift();
            if (!argv.length) error();
            gopts.subcomponent = argv[0];
            argv.shift();
            break;
        case "-c":
        case "--connector":
            argv.shift();
            if (!argv.length) error();
            gopts.connector = argv[0];
            argv.shift();
            break;
        case "-p":
        case "--parent":
            argv.shift();
            if (!argv.length) error();
            gopts.parent = argv[0];
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
        case "-i":
        case "--instance":
            argv.shift();
            if (!argv.length) error();
            gopts.instance = argv[0];
            argv.shift();
            break;
        case "-d":
        case "--data":
            argv.shift();
            if (!argv.length) error();
            gopts.data = argv[0];
            argv.shift();
            break;
        case "-f":
        case "--file":
            argv.shift();
            if (!argv.length) error();
            gopts.file = argv[0];
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
            let cli = repl.start({ prompt: "component > " });
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