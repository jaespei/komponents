#!/usr/bin/env node

const repl = require("repl");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const _ = require("lodash");
const connector = require("./connector");
const server = require("./server");

const HOST = process.env.HOST || "0.0.0.0:8080";
const API = process.env.API || "127.0.0.1:10001";
const ENDPOINT = process.env.ENDPOINT || "out";
const MODE = process.env.MODE || 'lb';

const FILE_LOG = path.join(__dirname, "log.txt");

let argv = process.argv.slice(2);


/**
 * Print CLI usage info.
 */
function error() {
    console.log(`
Usage: cli.js <command> [options]
Commands:
    start [-h <host>] [-e <endpoint>] [-m <mode>] [-a <api>]    Start the server
    init [-a <api>] config                                      Lifecycle init
    cfg config [-a <api>]                                       Lifecycle cfg
    destroy [-a <api>]                                          Lifecycle destroy
    info                                                        List info
    stop                                                        Stop the server

Options: 
    -h, --host       The listening host in format addr:port (default 127.0.0.1:10000)
    -e, --endpoint   The endpoint name (default 'out')
    -a, --api        The listening host for administrative operations (default 127.0.0.1:10000)
    -m, --mode       The connector mode 'lb', 'ps' (default 'lb')
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
init(opts)        - Lifecycle init
cfg(opts)         - Lifecycle cfg
destroy(opts)     - Lifecycle destroy
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

        //opts.host = opts.host || HOST || `0.0.0.0:${PORT}`;

        opts.host = opts.host || HOST;
        opts.api = opts.api || API;
        opts.endpoint = opts.endpoint || ENDPOINT;
        opts.mode = opts.mode || MODE;

        // Start connector
        context.connector = connector(opts);
        context.connector.start();

        // Start server
        [opts.addr, opts.port] = opts.api.split(":");
        console.log(`Applying opts to server: ${JSON.stringify(opts)}`);

        context.server = server(context.connector, opts);
        context.server.start();
    },
    stop(opts) {
        opts = opts || gopts || {};
        if (context.server) {

            // if local server
            context.server.stop();
            delete context.server;

        } else {

            // remote connect
            opts.api = opts.api || opts.host || API;
            [opts.addr, opts.port] = opts.api.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios.delete(`http://${opts.addr}:${opts.port}/`);

        }

    },
    init(opts) {
        opts = opts || gopts || {};

        if (!opts.config) return;

        if (context.server) {

            // if local server
            context.connector.update(otps.config);

        } else {

            // remote connect
            opts.api = opts.api || opts.host || API;
            [opts.addr, opts.port] = opts.api.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios.put(
                `http://${opts.addr}:${opts.port}/`,
                { cfg: opts.config }
            );
        }

    },
    cfg(opts) {
        opts = opts || gopts || {};

        if (!opts.config) return;
        if (context.server) {

            // if local server
            context.connector.update(otps.config);

        } else {

            // remote connect
            opts.api = opts.api || opts.host || API;
            [opts.addr, opts.port] = opts.api.split(":");

            console.log(`Applying opts: ${JSON.stringify(opts)}`);

            axios.put(
                `http://${opts.addr}:${opts.port}/`,
                { cfg: opts.config }
            );
        }

    },
    destroy(opts) {

    },
    info(opts) {
        opts = opts || gopts || {};
        if (context.server) {
            console.log("Server configuration:");
            console.log(JSON.stringify(context.connector.info(), undefined, 4));

        } else {
            // remote connect
            opts.api = opts.api || opts.host || API;
            [opts.addr, opts.port] = opts.api.split(":");

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
        case "init":
        case "cfg":
            cmd = argv[0];
            argv.shift();
            if (argv.length) gopts.config = argv[0];
            argv.shift();
            break;
        case "destroy":
        case "start":
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
        case "--port":
            argv.shift();
            if (!argv.length) error();
            gopts.port = argv[0];
            argv.shift();
            break;
        case "-e":
        case "--endpoint":
            argv.shift();
            if (!argv.length) error();
            gopts.endpoint = argv[0];
            argv.shift();
            break;
        case "-m":
        case "--mode":
            argv.shift();
            if (!argv.length) error();
            gopts.mode = argv[0];
            argv.shift();
            break;
        default:
            error();
    }
}



try {
    if (cmd) {
        context[cmd](gopts);
        if (cmd == "start") {
            let cli = repl.start({ prompt: "connector > " });
            Object.assign(cli.context, context);
            context = cli.context;

            /*cli.on('exit', () => {
                console.log('Exiting ...');
                if (context.server) context.stop();
                process.exit();
            });*/
            // Append entry to log file
            fs.appendFileSync(FILE_LOG, `${Date.now()} ${process.argv.slice(2).join(" ")} SUCCESS\n`);

        }
    } else {
        // Append entry to log file
        fs.appendFileSync(FILE_LOG, `${Date.now()} ${process.argv.slice(2).join(" ")} ERROR missing command\n`);
        error();
    }
} catch (err) {
    // Append entry to log file
    fs.appendFileSync(FILE_LOG, `${Date.now()} ${process.argv.slice(2).join(" ")} ERROR stack=${err.stack}, stdout=${err.stdout}, stderr=${err.stderr}\n`);
}