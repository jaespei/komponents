#!/usr/bin/env node

/**
 * Sidecar script.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic..upv.es> 
 */

const fs = require("fs");
const child_process = require("child_process");
const path = require("path");

const FILE_DB = path.join(__dirname, "endpoints.json");
const FILE_LOG = path.join(__dirname, "log.txt");

let argv = process.argv.slice(2);

main(argv);

/**
 * Main function.
 * 
 * @param {Array<string>} argv - Input arguments
 */
function main(argv) {

    try {
        // ------------ Process CLI
        if (!argv.length) {
            error();
        }

        // Sanitize input
        argv = argv.join(" ").trim().split(" ");

        switch (argv[0]) {
            case "init":
            case "cfg":
                // Process configuration
                argv.shift();
                if (!argv.length) break;

                let cfgs = argv[0].split(";");
                for (let cfg of cfgs) {
                    let [endpoint, addresses] = cfg.split("=");
                    addresses = addresses ? addresses.split(",") : [];
                    doCfg(endpoint, addresses);
                }
                break;
            case "destroy":
                // Do nothing
                break;
            case "ping":
                // Exit with success
                break;
            default:
                error();
        }

        // Append entry to log file
        fs.appendFileSync(FILE_LOG, `${Date.now()} ${argv.join(" ")} SUCCESS\n`);

    } catch (err) {
        // Append entry to log file
        fs.appendFileSync(FILE_LOG, `${Date.now()} ${argv.join(" ")} ERROR stack=${err.stack}, stdout=${err.stdout}, stderr=${err.stderr}\n`);
        throw err;
    }
}


/**
 * Process new configuration
 * 
 * @param {string} endpoint - The endpoint name
 * @param {Array<string>} addresses - The updated addresses
 */
function doCfg(endpoint, addresses) {
    console.log(`doCfg(${endpoint},${JSON.stringify(addresses)})`);
    let endpoints, add = [],
        remove = [];
    if (fs.existsSync(FILE_DB)) {
        endpoints = JSON.parse(fs.readFileSync(FILE_DB).toString());
        if (endpoints[endpoint]) {
            // Calculate addresses to add
            for (let addr of addresses) {
                if (!endpoints[endpoint].includes(addr)) add.push(addr);
            }
            // Calculate addresses to remove
            for (let addr of endpoints[endpoint]) {
                if (!addresses.includes(addr)) remove.push(addr);
            }
        } else {
            // All addresses must be added
            add.push.apply(add, addresses);
        }
    } else {
        endpoints = {};
        // All addresses must be added
        add.push.apply(add, addresses);
    }

    console.log(`endpoint ${endpoint},add=${JSON.stringify(add)},remove=${JSON.stringify(remove)}`)

    // Update iptables rules
    //
    // Add rules
    try {
        for (let addr of add) {
            // Check redirect connections
            let [src, dst] = addr.split("->");
            if (dst) {
                // Add redirect rule
                let srcSchema, srcAddr, srcPort, dstSchema, dstAddr, dstPort;
                [srcSchema, srcAddr] = src.split("://");
                if (!srcAddr) { srcAddr = srcSchema; srcSchema = "tcp"; }
                [srcAddr, srcPort] = srcAddr.split(":");

                [dstSchema, dstAddr] = dst.split("://");
                if (!dstAddr) { dstAddr = dstSchema; dstSchema = "tcp"; }
                [dstAddr, dstPort] = dstAddr.split(":");

                dstPort = dstPort || srcPort;

                cmd(
                    "iptables",
                    `-t nat -A OUTPUT -p ${dstSchema || srcSchema} --destination ${srcAddr}${srcPort ? " --dport " + srcPort : ""} -j DNAT --to-destination ${dstAddr}${dstPort ? ":" + dstPort : ""}`.split(" ")
                );
            }
        }
        // Remove rules
        for (let addr of remove) {
            let [src, dst] = addr.split("->");
            if (dst) {
                // Redirect connection
                cmd(
                    "iptables",
                    `-t nat -D OUTPUT -p tcp --destination ${src} -j DNAT --to-destination ${dst}`.split(" ")
                );
            }
        }
    } catch (err) {
        throw err;
    } finally {
        // Refresh & write
        endpoints[endpoint] = addresses;
        fs.writeFileSync(FILE_DB, JSON.stringify(endpoints));
    }

}

/**
 * Execute the specified command.
 * 
 * @param {string} cmd - The command to execute
 * @param {Array<string>} args - The command arguments
 */
function cmd(cmd, args) {
    console.log(`cmd(${cmd},${JSON.stringify(args)})`);

    let result = child_process.spawnSync(cmd, args, { cwd: __dirname });
    if (result.status != 0) {
        let err = result.error || new Error();
        err.stdout = result.stdout;
        err.stderr = result.stderr;
        throw err;
    }
    return result.stdout;
}

/**
 * Print CLI usage info.
 */
function error() {
    console.log(`
Usage: sidecar.js <event> <data>
Commands:
    init       Initialize the instance. <data> contains
    ping       Instance probe test
    cfg        Refresh instance configuration
    destroy    Destroy the instance
`);
    throw Error();
}