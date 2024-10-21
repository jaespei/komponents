#!/usr/bin/env node

const repl = require("repl");
const axios = require("axios");
const _ = require("lodash");
const proxy = require("./proxy");
const server = require("./server");

const HOST = process.env.HOST || "0.0.0.0";
const API = process.env.API || "127.0.0.1:10001";
const GATEWAY = process.env.GATEWAY;
const DEST = process.env.DEST;
const PORTS = process.env.PORTS;

let argv = process.argv.slice(2);

/**
 * Print CLI usage info.
 */
function error() {
    console.log(`
Usage: cli.js <command> [options]
Commands:
    start  -d <addr> -p <port,port,...> -g <addr:port>  Start the server
    update -d <addr> -p <port,port,...> -g <addr:port>  Update server cfg
    restart                                             Restart previously stopped server
    info                                                List info
    stop                                                Stop the server

Options: 
    -h, --host       The listening host in format addr:port (default 0.0.0.0.:8080)
    -a, --api        The listening host for administrative operations (default 127.0.0.1:10000)
    -g, --gateway    The intermediate gateway in format addr:port
    -d, --dest       The real destination addr
    -p, --ports      The destination ports. Syntax: portSpec{,portSpec}, where portSpec ::= [srcAddr:]srcPort[->[dstAddr:]dstPort]
`);
    process.exit(-1);

}


/**
 * REPL context
 */
let context = {
    help() {
        console.log(`
start(opts)       - Start server
restart(opts)     - Restart server
update(opts)      - Update server cfg
info(opts)        - List info
stop(opts)        - Stop server
`)
    },
    start(opts) {
        console.log(1);
        if (context.server) throw new Error("Unable to start: server already running");

        opts = opts || gopts || {};

        /*if (!opts.gateway) throw new Error("Unable to start: missing gateway");
        if (!opts.dest) throw new Error("Unable to start: missing destination address");
        if (!opts.ports) throw new Error("Unable to start: missing destination ports");*/

        opts.host = opts.host || HOST;
        opts.api = opts.api || API;
        opts.gateway = opts.gateway || GATEWAY;
        opts.dest = opts.dest || DEST;
        opts.ports = opts.ports || PORTS;

        if (opts.gateway) {
            [opts.gwAddr, opts.gwPort] = opts.gateway.split(":");
        }
        if (opts.dest) {
            opts.dstAddr = opts.dest;
        }
        if (opts.ports) {
            opts.dstPort = _.map(opts.ports.split(","), portSpec => {
                let [src, dst] = portSpec.split("->");
                let [srcAddr, srcPort] = src.split(":");
                if (!srcPort) { srcPort = srcAddr; srcAddr = opts.host; }
                let dstAddr, dstPort;
                if (dst) {
                    [dstAddr, dstPort] = dst.split(":");
                    if (!dstPort) { dstPort = dstAddr; dstAddr = undefined; }
                }
                return {
                    srcAddr: srcAddr,
                    srcPort: srcPort,
                    dstAddr: dstAddr,
                    dstPort: dstPort
                };
            });
        }

        console.log(`Applying opts to proxy: ${JSON.stringify(opts)}`);

        // Start proxy
        context.proxy = proxy(opts);
        context.proxy.start();

        // Start server
        opts.api = opts.api || API;
        [opts.addr, opts.port] = opts.api.split(":");

        console.log(`Applying opts to server: ${JSON.stringify(opts)}`);

        context.server = server(context.proxy, opts);
        context.server.start();
    },
    restart(opts) {
        opts = opts || gopts || {};
        if (context.server) {

            // if local server
            context.proxy.start();

        } else {

            // remote connect
            opts.host = opts.host || opts.api || API;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios.post(`http://${opts.addr}:${opts.port}/`);

        }
    },
    stop(opts) {
        opts = opts || gopts || {};
        if (context.server) {

            // if local server
            context.server.stop();
            delete context.server;

        } else {

            // remote connect
            opts.host = opts.host || opts.api || API;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios.delete(`http://${opts.addr}:${opts.port}/`);

        }

    },
    update(opts) {
        opts = opts || gopts || {};

        if (opts.gateway) {
            [opts.gwAddr, opts.gwPort] = opts.gateway.split(":");
        }
        if (opts.dest) {
            opts.dstAddr = opts.dest;
        }
        if (opts.ports) {
            opts.dstPort = _.map(opts.ports.split(","), portSpec => {
                let [src, dst] = portSpec.split("->");
                let [srcAddr, srcPort] = src.split(":");
                if (!srcPort) { srcPort = srcAddr; srcAddr = undefined; }
                let dstAddr, dstPort;
                if (dst) {
                    [dstAddr, dstPort] = dst.split(":");
                    if (!dstPort) { dstPort = dstAddr; dstAddr = undefined; }
                }
                return {
                    srcAddr: srcAddr,
                    srcPort: srcPort,
                    dstAddr: dstAddr,
                    dstPort: dstPort
                };
            });
        }

        if (context.server) {

            // if local server
            context.proxy.update(opts);

        } else {

            // remote connect
            opts.host = opts.host || opts.api || API;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios.put(
                `http://${opts.addr}:${opts.port}/`,
                opts
            );
        }

    },
    info(opts) {
        opts = opts || gopts || {};
        if (context.server) {
            console.log("Server configuration:");
            console.log(JSON.stringify(context.proxy.opts, undefined, 4));
            console.log("Connections:");
            let str = "";
            for (let port in context.proxy.forwarders) {
                str += `<${port}>:\n`;
                for (let locator in context.proxy.forwarders[port]._connections) {
                    let con = context.proxy.forwarders[port]._connections[locator];
                    str += ` - ${locator} -> src=${con.srcAddr}:${con.srcPort}, dst=${con.dstAddr}:${con.dstPort}`;
                }
            }
            console.log(str);
        } else {
            // remote connect
            opts.host = opts.host || opts.api || API;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios(`http://${opts.addr}:${opts.port}/`)
                .then(resp => {
                    console.log(JSON.stringify(resp.data, undefined, 4));
                })
                .catch(err => {
                    if (err.response) {
                        // The request was made and the server responded with a status code
                        // that falls out of the range of 2xx
                        console.log(`ERROR. data=${err.response.data}, status=${err.response.status}`);
                    } else if (error.request) {
                        // The request was made but no response was received
                        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                        // http.ClientRequest in node.js
                        console.log(`ERROR. request=${error.request}`);
                    } else {
                        // Something happened in setting up the request that triggered an Error
                        console.log(`ERROR. ${err.message}`);
                    }
                });

        }
    }
};


// Process CLI
let cmd, gopts = {};
while (argv.length) {
    switch (argv[0]) {
        case "start":
        case "restart":
        case "update":
        case "stop":
        case "info":
            cmd = argv[0];
            argv.shift();
            break;
        case "-h":
        case "--host":
            argv.shift();
            if (!argv.length) error();
            gopts.host = argv[0];
            argv.shift();
            break;
        case "-a":
        case "--api":
            argv.shift();
            if (!argv.length) error();
            gopts.api = argv[0];
            argv.shift();
            break;
        case "-p":
        case "--ports":
            argv.shift();
            if (!argv.length) error();
            gopts.ports = argv[0];
            argv.shift();
            break;
        case "-g":
        case "--gateway":
            argv.shift();
            if (!argv.length) error();
            gopts.gateway = argv[0];
            argv.shift();
            break;
        case "-d":
        case "--dest":
            argv.shift();
            if (!argv.length) error();
            gopts.dest = argv[0];
            argv.shift();
            break;
        default:
            error();
    }
}


if (cmd) {
    context[cmd](gopts);
    if (cmd == "start") {
        let cli = repl.start({ prompt: "proxy > " });
        Object.assign(cli.context, context);
        context = cli.context;

        /*cli.on('exit', () => {
            console.log('Exiting ...');
            if (context.server) context.stop();
            process.exit();
        });*/

    }
} else error();