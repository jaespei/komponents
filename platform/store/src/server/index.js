#!/usr/bin/env node

const express = require("express");
const repl = require("repl");

const store = require("../store");
const server = require("./server");
const pool = require("./pool")({}, store);

const PORT = 8080;
const ADDR = "0.0.0.0";

let argv = process.argv.slice(2);

/**
 * Print CLI usage info.
 */
function error() {
    console.log(`
Usage: server <command> [options]
Commands:
    start   Start the server

Options: 
    -p, --port  The listening port (default 8080)
    -a, --addr  The listening address (default "0.0.0.0")
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
stop()            - Stop server
list()            - List open connections
`)
    },
    start(opts) {
        if (context.server) {
            console.log("Unable to start: server already running");
            return;
        }
        opts = opts || {};
        opts.port = opts.port || PORT;
        opts.addr = opts.addr || ADDR;

        context.server = server(opts, pool);
        context.server.start();
    },
    stop() {
        if (!context.server) {
            console.log("Unable to stop: server not running");
            return;
        }
        context.server.stop();
        delete context.server;
    },
    /*list() {
        if (!context.server) {
            console.log("Unable to list: server not running");
            return;
        }
        for (let url in context.server.opts.store.pool.connections) {
            let con = context.server._connections[locator];
            console.log(` - ${locator} -> src=${con.srcAddr}:${con.srcPort}, dst=${con.dstAddr}:${con.dstPort}`);
        }

    }*/
};


// Process CLI
let cmd, opts = {};
while (argv.length) {
    console.log(argv[0]);
    switch (argv[0]) {
        case "start":
            cmd = argv[0];
            argv.shift();
            break;
        case "-p":
        case "--port":
            argv.shift();
            if (!argv.length) error();
            opts.port = argv[0];
            argv.shift();
            break;
        case "-a":
        case "--addr":
            argv.shift();
            if (!argv.length) error();
            opts.addr = argv[0];
            argv.shift();
            break;
        default:
            error();
    }
}


if (cmd) context[cmd](opts);

let cli = repl.start({ prompt: "server > " });
Object.assign(cli.context, context);
context = cli.context;


cli.on('exit', () => {
    console.log('Exiting ...');
    if (context.server) context.stop();
    process.exit();
});