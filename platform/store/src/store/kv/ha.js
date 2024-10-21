/**
 * High available implementation of Level-down compatible store.
 * It internally makes use of an ZMQ-based implementation of the Raft 
 * consensus algorithm.
 * 
 * URLs managed by this store should comply with the syntax "level:ha:<name>"
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
const Q = require('q');
const levelup = require('levelup');
const asyncResult = require('utils').asyncResult;
const raft = require('zmq-raft');
const ip = require('ip');
const fs = require('fs/promises');
const path = require("path");
const {EventEmitter} = require("events");

const name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
const _log = require('utils').logger('store.ha' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
const error = require('utils').error;

/**
 * High available key-value store implementation.
 * 
 * It is an event emitter triggering the following events:
 * - '
 */
class HAStore extends EventEmitter {

    /**
     * Creates a new HAStore.
     * 
     * @param {Object} opts - Options
     * @param {String} [opts.address] - This server address (e.g. 127.0.0.1:8080)
     * @param {Array<String>} [opts.peers] - The peers' addresses
     * @param {String} [opts.logPath] - The log path
     * @param {Object} db - The underlying real store
     */
    constructor(opts, db) {
        super();
        this.opts = opts || {};
        this.address = opts.address || ip.address() + ":8080";
        this.opts.peers = opts.peers || [];
        this.opts.peers.push(this.address);
        this.logPath = opts.logPath || "./raft";
        this.db = db;
    }

    /**
     * Start Raft server.
     */
    async start() {
        _log(`[HAStore] start()`);
        this.server = await raft.server.builder.build({
            id: this.address,
            peers: this.opts.peers.map(addr => { return { id: addr, url: `tcp://${addr}` } }),
            router: {
                bind: `tcp://*:${this.address.split(":")[1]}`
            },
            data: {
                path: this.logPath
            },
            factory: {
                state: (options) => new StateMachine(options)
            },
            /** Customized options */
            db: this.db
        });
        
        _log(`[HAStore] creating client ...`);
        this.client = new raft.client.ZmqRaftClient(`tcp://${this.address}`, {});
    }

    /**
     * Stop Raft server.
     */
    async stop() {
        await this.server.close();
        await this.client.close();
        await this.db.close();
    }

    /**
     * Obtain the cluster leader.
     * 
     * @returns {String} The leader address
     */
    getLeader() {
        return this.client.leaderId;
    }

    /**
     * 
     */
    isLeader() {
        return this.server.isLeader;
    }

    /**
     * Obtain the cluster peers.
     * 
     * @returns {Array<String>} The peer addresses
     */
    listPeers() {
        return this.server.peersAry.map(peer => peer[0]);
    }

    /**
     * Add new peer to the cluster.
     * 
     * @param {String|Array<String>} peer - The peer address
     */
    async addPeer(peers) {
        peers = Array.isArray(peers)? peers: [peers];
        let config = this.server.peersAry.map(p => { return {id: p[0], url: p[1]}});
        for (let peer of peers) {
            if (!config.find(p => p.id == peer)) config.push({id: peer, url: `tcp://${peer}`});
        }
        await this.client.configUpdate(
            raft.utils.id.genIdent(),
            config
        );
    }

    /**
     * Update peers
     * 
     * @param {Array<String> peers - The peers to update
     */
    async updatePeers(peers) {
        config = peers.map(p => {return {id: p, url: `tcp://${p}`}});
        await this.client.configUpdate(
            raft.utils.id.genIdent(),
            config
        );
    }

    /**
     * Remove peer from the cluster.
     * 
     * @param {String|Array<String>} peer - The peer address
     */
    async removePeer(peers) {
        peers = Array.isArray(peers)? peers: [peers];
        let config = this.server.peersAry.map(p => { return {id: p[0], url: p[1]}});
        config = config.filter(p => !peers.includes(p.id));
        await this.client.configUpdate(
            raft.utils.id.genIdent(),
            config
        );
    }

    /******************* Level-down compatible interface *******************/
    async put(key, value, opts) {
        _log(`[HAStore] put(${key},${value},${opts})`);
        if (opts && opts.preventHA) await this.db.put(key, value);
        else 
            await this.client.requestUpdate(
                raft.utils.id.genIdent(),
                Buffer.from(
                    JSON.stringify({
                        type: "put",
                        key: key,
                        value: value
                    })
                )
            );
    }
    async get(key) {
        _log(`[HAStore] get(${key})`);
        return await this.db.get(key);
    }
    async del(key, opts) {
        _log(`[HAStore] del(${key})`);
        if (opts && opts.preventHA) await this.db.del(key);
        else 
            await this.client.requestUpdate(
                raft.utils.id.genIdent(),
                Buffer.from(
                    JSON.stringify({
                        type: "del",
                        key: key
                    })
                )
            );
    }
    async batch(operations, opts) {
        _log(`[HAStore] batch(${JSON.stringify(operations)})`);
        if (opts && opts.preventHA) await this.db.batch(operations);
        else 
            for (let op of operations) {
                _log(`[HAStore] ${JSON.stringify(op)}`);
                await this.client.requestUpdate(
                    raft.utils.id.genIdent(),
                    Buffer.from(
                        JSON.stringify(op)
                    )
                );
            }
    }
    iterator(opts) {
        _log(`[HAStore] iter()`);
        return this.db.iterator(opts);
    }
    async close() {
        // do nothing
    }
    /******************* Level-down compatible interface *******************/

    /**
     * Execute native command.
     * 
     * @param {String} cmdName - The command name
     * @param {*} cmdData - The command data
     */
    async execute(cmdName, cmdData) {
        _log(`[HAStore] execute(${cmdName})`);

        switch (cmdName) {
            case "addPeer":
                return await this.addPeer(cmdData);
            case "removePeer":
                return await this.removePeer(cmdData);
            case "updatePeers":
                return await this.updatePeers(cmdData);
            default:
        }

    }

}

class StateMachine extends raft.api.StateMachineBase {
    constructor(opts) {
        _log(`[StateMachine] constructor(${JSON.stringify(opts)})`);
        super();
        this.db = opts.db;
        this.lastAppliedFile = opts.data.path + "/lastApplied";
        this.initMyStateMachine().then(() => {
            this[Symbol.for('setReady')]();
        });
    }
    async initMyStateMachine() {
        try {
            await fs.access(this.lastAppliedFile);
            this.lastApplied = Number(await fs.readFile(this.lastAppliedFile));
        } catch (err) {
            this.lastApplied = 0;
        }
    }
    async applyEntries(logEntries, nextIndex, currentTerm, snapshot) {
        _log(`[StateMachine] applyEntries()`);
        let ops = [];
        for (let [index, item] of logEntries.entries()) {
            let entry = raft.common.LogEntry.bufferToLogEntry(item, nextIndex + index);
            console.log("log entry: log-index=%s term=%s", entry.logIndex, entry.readEntryTerm());
            if (entry.isStateEntry) {
                console.log("this is state entry:");
                //  user data of the log entry
                let data = entry.readEntryData();
                // ... do something with entry data
                let op = JSON.parse(
                    data.toString(),
                    (key, value) => {
                        if (typeof value == "object" &&
                            value.type == "Buffer" &&
                            Array.isArray(value.data))
                            return Buffer.from(value.data);
                        else return value;
                    }
                );
                console.dir(op);
                ops.push(op);
            } else if (entry.isConfigEntry) {
                console.log("this is config entry");
            } else {
                console.log("this is checkpoint entry");
            }
        }
        // Apply all operations in batch
        try {
            await this.db.batch(ops);
        } catch (err) { }

        let lastApplied = await super.applyEntries(logEntries, nextIndex, currentTerm, snapshot);
        await fs.writeFile(this.lastAppliedFile, String(lastApplied));
        return lastApplied;

    }
}

/**
 * Open a new connection against the key-value store.
 * 
 * @param {string} url - The database URL (e.g. ha:level:mydb)
 * @param {Object} opts - Configuration options
 */
async function open(url, opts) {
    _log(`open(${url}, ${JSON.stringify(opts)})`);

    // Create new permanent connection
    opts = opts || {};
    let driverName;
    let paths = url.split(":");
    if (paths.length == 1) {
        url = "level:" + paths[0];
        driverName = "level";
    } else if (paths.length == 2) {
        if (paths[0] == "ha") {
            url = "level:" + paths[1];
            driverName = "level";
        } else {
            driverName = paths[0];
        }
    } else {
        if (paths[0] == "ha") {
            url = paths.slice(1).join(":");
            driverName = paths[1];
        } else driverName = paths[0];
    }

    // If already connected, then return connection
    if (cons[url]) return cons[url];

    // Import driver library
    let driver = require(`./${driverName}`);
    if (!driver) throw new Error(`Unable to open store: unknown store type ${driverName}`);

    // Open connection against the backend
    let db = await driver.open(url, opts);

    // Wrap connection with HAStore
    opts.logPath = paths[paths.length - 1] + ".raft";
    let con = new HAStore(opts, db);

    // Start HAStore
    await con.start();

    // Register permanent connection
    cons[url] = con;

    return con;
}

let cons = {};

exports.open = open;