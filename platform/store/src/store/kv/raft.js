const EventEmitter = require("events");
const zmq = require("zeromq");

/**
 * [Work in progress]
 * Implementation of the Raft consensus protocol.
 */
class Raft extends EventEmitter {

    /**
     * 
     * @param {Object} opts - Raft options
     * @param {String} [opts.address] - This Raft peer address
     * @param {int} [opts.electionTimeout] - The election max timeout
     * @param {int} [opts.heartbeatTimeout] - The heartbeat timeout
     * @param {Array<string>} [opts.peers] - The remainder Raft peers
     * @param {Object} [opts.transport] - The transport used for sending/receiving messages
     * @param {Object} [opts.log] - The log used for reading/writing entry logs
     */
    constructor(opts) {
        super();
        opts = opts || {};
        this.address = opts.address || "tcp://127.0.0.1:8080";
        this.maxElectionTimeout = opts.maxElectionTimeout || 300; // [150-300]ms
        this.minElectionTimeout = opts.minElectionTimeout || 150; // [150-300]ms
        this.heartbeatTimeout = opts.heartbeatTimeout || 50;
        this.peers = opts.peers || [];
        this.transport = opts.transport || new DefaultTransport();
        this.log = opts.log || new DefaultLog();

        this.currentTerm = 0;
        this.votedFor = null;
        this.commitIndex = 0;
        this.lastApplied = 0;
        this.nextIndex = [];
        this.matchIndex = [];
        this.role = "follower";

        this.lastLogIndex = 0;
        this.lastLogTerm = 0;

        this.debug = require("debug")("raft");
    }


    start() {
        this.debug("start()");
        this.role = "follower";
        this.transport.on("message", this.receive.bind(this)); //this.serve.bind(this));
        this.transport.listen(this.address);
        this.electionTimer = setTimeout(this.election.bind(this), this.electionTimeout);
    }

    majority() {
        return Math.floor(this.peers/2)+1;
    }

    refreshElection() {
        if (this.electionTimer) clearTimeout(this.electionTimer);
        let timeout = Math.floor(Math.random()*(this.maxElectionTimeout-this.minElectionTimeout) + this.minElectionTimeout);
        this.electionTimer = setTimeout(this.election.bind(this), timeout);
    }   

    async election() {
        this.debug("election()");
        this.role = "candidate";
        this.votedFor = this.address;
        let term = ++this.currentTerm;        
        let votes = [this.address];        
        let promises = [];
        for (let peerAddr of this.peers) {
            let promisePeer = new Promise((resolve, reject) => {
                let sendPromise = this.transport.send(peerAddr, {
                    type: "RequestVote",
                    term: this.currentTerm,
                    candidateId: this.address,
                    lastLogIndex: this.lastLogIndex,
                    lastLogTerm: this.lastLogTerm
                });
                sendPromise.then((rep) => {
                    resolve({promise: sendPromise, type:"peer", term: term, addr: peerAddr, rep: rep});
                }).catch((err) => {
                    reject({promise: sendPromise, type:"peer", term: term, addr: peerAddr, err: err});
                });
            });
            promises.push(promisePeer);
        }
        let promiseTimeout = new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve({promise: promiseTimeout, type:"timeout", term: term});
            }, this.electionTimeout);
        });        
        promises.push(promiseTimeout);
        let electing = true;

        while (electing) {
            try {
                let result = await Promise.race(promises);
                if (this.role != "candidate") electing = false;
                else if (result.term < this.term) electing = false;
                else if (result.type == "peer" && result.rep.voteGranted) votes.push(result.addr);
                else if (result.type == "timeout") {
                    // stop waiting; election timeout expired
                    electing = false;
                    this.role = "follower";
                    this.refreshElection();
                }
                promises = promises.filter(p => result.promise !== p);
                if (promises.length <= this.majority()) electing = false; // enough responses; stop waiting
            } catch (err ) {}
           
           /*Promise.race(promises).then(result => {                
                if (this.role != "candidate") electing = false;
                else if (result.term < this.term) electing = false;
                else if (result.type == "peer" && result.rep.voteGranted) votes.push(result.addr);
                else if (result.type == "timeout") {
                    // stop waiting; election timeout expired
                    electing = false;
                    this.role = "follower";
                    setTimeout(this.election.bind(this), this.electionTimeout);
                }
                promises = promises.filter(p => result.promise !== p);
                if (promises.length <= Math.floor(this.peers.length/2)+1) electing = false; // enough responses; stop waiting
            });*/
        }
        if (this.role != "candidate") return;
        if (votes.length >= this.majority()) {
            // become leader
            this.role = "leader";
            this.heartbeat();
        }
    }

    heartbeat() {
        this.debug("heartbeat()");
        for (let peerAddr of this.peers) {
            this.transport.send(peerAddr, {
                type: "AppendEntries",
                term: this.currentTerm,
                leaderId: this.address,
                prevLogIndex: this.lastLogIndex,
                prevLogTerm: this.lastLogTerm,
                entries: [],
                leaderCommit: this.commitIndex
            });
        }
    }

    refreshHeartbeat() {
        if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(this.heartbeat.bind(this), this.heartbeatTimeout);
    }

    receive(req, reply) {
        this.debug(`receive(${JSON.stringify(req)})`);
        clearTimeout(this.electionTimer);
        if (req.term > this.currentTerm) {
            this.currentTerm = req.term;
            this.role = "follower";
        }
        switch (req.type) {
            case "RequestVote":
                if (req.term < this.currentTerm) {
                    reply({
                        type: "RequestVote",
                        term: this.currentTerm,
                        voteGranted: false
                    });
                } else {

                }                
                break;
            case "AppendEntries":


                break;
            default:
        }
        this.electionTimer = setTimeout(this.election.bind(this), this.electionTimeout);

    }

    stop() {
        this.debug("stop()");
        this.transport.close();
    }

    info() {
        this.debug("info");

    }


}

/**
 * Default transport. It allows to send and receive messages.
 * The transport is an event emitter which emits the following events:
 * - "message" => (msg, reply): a new message has been received, along with the reply(msg) function
 */
class DefaultTransport extends EventEmitter {

    constructor() {
        super();
        this.server = null;
        this.debug = require("debug")("DefaultTransport");
    }

    /**
     * Send message.
     * 
     * @param {String} address - The target address
     * @param {Object} msg  - The message to send
     */
    async send(address, msg) {
        this.debug(`send request (${address},${JSON.stringify(msg)})...`);
        
        /*
        let client = zmq.socket("push");
        return new Promise((resolve, reject) => {
            try {
                client.connect(address);
                client.send(JSON.stringify(msg), 0, () => {
                    this.debug(`sent(${address},${JSON.stringify(msg)}).`);
                    client.close();
                    resolve();
                });
            } catch (err) {
                reject(err);
            }            
        });*/

        let client = zmq.socket("req");
        return new Promise((resolve, reject) => {
            client.send(JSON.stringify(msg));
            client.on("message", (rep) => {
                this.debug(`received reply (${rep.toString()})`);
                client.close();
                resolve(JSON.parse(rep.toString()));
            });
            client.on("error", (err) => {
                this.debug(`error ${err.stack}`);
                //client.close();
                reject(err);
            })
        });
    }

    /**
     * Start listening to input messages.
     * 
     * @param {String} address - The local address to listen to
     */
    async listen(address) {
        this.debug(`listen(${address})`);
        this.server = zmq.socket("req");
        return new Promise((resolve, reject) => {

            this.server.bind(address, (err) => {
                if (err) reject(err) ;
                else {
                    this.server.on("message", (msg) => {
                        this.debug(`received req (${msg.toString()})`);
                        let req = JSON.parse(msg.toString());
                        this.emit("message", msg, (rep) => {
                            this.server.send(JSON.stringify(rep));
                        });
                    });
                    resolve();
                }
            });

            
            /*this.server.bind(address, (err) => {
                if (err) reject(err) ;
                else {
                    this.server.on("message", (msg) => {
                        this.debug(`received req (${msg.toString()})`);
                        msg = JSON.parse(msg.toString());
                        this.emit("message", msg);
                    });
                    resolve();
                }
            });*/

        });
        /*this.server.bind(address, (err) => {
            if (err) 
            this.server.on("message", (msg) => {
                this.debug(`received req (${msg.toString()})`);
                msg = JSON.parse(msg.toString());
                this.emit("message", msg, (rep) => {
                                    this.server.send(JSON.stringify(rep));
                                });
            });
        });

        this.on("message", (msg, reply) => {
            this.debug(`[DefaultTransport] on(message) -> ${JSON.stringify(msg)}`);
            reply({msg: "Bye world"});
        });*/
    }

    /**
     * Stop listening.
     */
    async close() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

/**
 * Default connection.
 *
class DefaultConnection extends EventEmitter {

    /**
     * Send message.
     * 
     * @param {Object} msg  - The message
     *
    send(msg) {

    }

}*/

/**
 * Default log.
 */
class DefaultLog {

}



module.exports = (opts) => {
    return new Raft(opts);
}