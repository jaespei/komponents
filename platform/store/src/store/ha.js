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
 * High available store implementation.
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
    async put(key, value) {
        _log(`[HAStore] put(${key},${value})`);
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
    async del(key) {
        _log(`[HAStore] del(${key})`);
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
    async batch(ops) {
        _log(`[HAStore] batch(${JSON.stringify(ops)})`);
        for (let op of ops) {
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
 * NoSQL store basic constructor.
 * 
 * @param {string} url - The store url, in format "ha:<driver>:[//<host>[:<port>]/]<db>"
 * @param {Object} [opts] - Optional store options
 * @param {Object} [opts.schema] - The store schema. If not provided, the database is supposed to exist
 * @param {string} [opts.schema.version] - The schema version
 * @param {Object} [opts.schema.collections] - Dictionary containing all collections in the store {<col-name>: <col-spec>}
 */
module.exports = async function(url, opts, cb) {

    if (!url) throw new Error("Unable to create store: url not specified");

    // Get driver name
    let driverName;
    let paths = url.split(":");
    if (paths.length == 2) {
        url = "kv:level:" + paths[1];
        driverName = "kv";
    } else {
        url = paths.slice(1).join(":");
        driverName = paths[1];
    } 

    // Import driver library
    let driver = require(`./${driverName}`);
    if (!driver) throw new Error(`Unable to open store: unknown store type ${driverName}`);

    


    let [driverPath, dbPath] = url.split("//");
    if (dbPath) {
        driverName = "proxy";
    } else {
        driverName = driverPath.split(":")[0];
    }

    // Find driver
    let driver = drivers[driverName];
    if (!driver) throw new Error(`Unable to create store: unknown store type ${driverName}`);

    // Create store
    let store = await driver(url, opts, cb);
    return Q(store).nodeify(cb);

}