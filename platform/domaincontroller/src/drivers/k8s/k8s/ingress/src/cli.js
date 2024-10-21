#!/usr/bin/env node

const repl = require("repl");
const axios = require("axios");
const gateway = require("./gateway");
const server = require("./server");

const PORT = process.env.PORT || 10000;
const PORT_API = process.env.PORT_API || 10001;
const ADDR = process.env.ADDR || "0.0.0.0";
const ADDR_API = process.env.ADDR_API || "127.0.0.1"


let argv = process.argv.slice(2);

/**
 * Print CLI usage info.
 */
function error() {
    console.log(`
Usage: cli.js <command> [options]
Commands:
    start    Start the server
    restart  Restart previously stopped server
    info     List info
    stop     Stop the server

Options: 
    -h, --host       The listening host for input connections (default 0.0.0.0.:10001)
    -a, --api        The listening host for administrative operations (default 127.0.0.1:10000)
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
stop(opts)        - Stop server
info(opts)        - List info
`)
    },
    start(opts) {
        if (context.server) throw new Error("Unable to start: server already running");

        opts = opts || gopts || {};

        opts.host = opts.host || `${ADDR}:${PORT}`;
        [opts.addr, opts.port] = opts.host.split(":");

        // Start gateway
        context.gateway = gateway(opts);
        context.gateway.start();

        // Start server
        opts.api = opts.api || `${ADDR_API}:${PORT_API}`;
        [opts.addr, opts.port] = opts.api.split(":");

        context.server = server(context.gateway, opts);
        context.server.start();
    },
    restart(opts) {
        opts = opts || gopts || {};
        if (context.server) {

            // if local server
            context.gateway.start();

        } else {

            // remote connect
            opts.host = opts.host || opts.api || `${ADDR_API}:${PORT_API}`;
            [opts.addr, opts.port] = opts.host.split(":");

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
            opts.host = opts.host || opts.api || `${ADDR_API}:${PORT_API}`;
            [opts.addr, opts.port] = opts.host.split(":");

            axios.delete(`http://${opts.addr}:${opts.port}/`);

        }
    },
    info(opts) {
        opts = opts || gopts || {};
        if (context.server) {
            console.log("Server configuration:");
            console.log(JSON.stringify(context.gateway.opts, undefined, 4));
            console.log("Connections:");
            let str = "";
            for (let locator in context.gateway._connections) {
                let con = context.gateway._connections[locator];
                str += ` - ${locator} -> src=${con.srcAddr}:${con.srcPort}, dst=${con.dstAddr}:${con.dstPort}`;
            }
            console.log(str);
        } else {
            // remote connect
            opts.host = opts.host || opts.api || `${ADDR_API}:${PORT_API}`;
            [opts.addr, opts.port] = opts.host.split(":");

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
    console.log(argv[0]);
    switch (argv[0]) {
        case "start":
        case "restart":
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
        default:
            error();
    }
}


if (cmd) {
    context[cmd](gopts);
    if (cmd == "start") {
        let cli = repl.start({ prompt: "gateway > " });
        Object.assign(cli.context, context);
        context = cli.context;

        /*cli.on('exit', () => {
            console.log('Exiting ...');
            if (context.server) context.stop();
            process.exit();
        });*/

    }
} else error();