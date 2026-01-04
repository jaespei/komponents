/**
 * Multiconnector.
 *
 * The multiconnector component is used for connecting two subcomponents, where one 
 * subcomponent is the *sender* and the other subcomponent is the *receiver*. Instances 
 * belonging to the sender will connect to instances belonging to the receiver using the 
 * multiconnector as mediator.
 *
 * The schema used for the connections depends on the mode the multiconnector has been
 * configured for. For now, the following modes are supported:
 * - load balancer ('lb'): the multiconnector will work as a load balancer
 * - broadcaster ('bc' or 'ps'): the multiconnector will work as a broadcaster
 *
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */


const Q = require("q");
const _ = require("lodash");
const net = require('net');
const fs = require("fs");
const path = require("path");

const FILE_DB = path.join(__dirname, "receivers.json");

Q.longStackSupport = true;

Q.waitAll = (promises) => {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then((snapshots) => {
        _.forEach(snapshots, (snapshot) => {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};


let error = (msg, code, cause) => {
    if (msg && !_.isString(msg)) { cause = msg; msg = code = undefined; }
    if (code && !_.isString(code)) { cause = code; code = undefined; }
    let err = new Error(msg);
    err.code = code;
    err.cause = cause;
    err.stack = cause && cause.stack ? err.stack + "\n" + cause.stack : err.stack;
    return err;
}

/**
 * Globals:
 *
 * - envPort: port environment variable name
 * - envMode: mode environment variable name
 * - envEndpoint: endpoint environment variable name
 * - envType: type environment variable name
 * - portSeparator: string used for separating addresses from ports
 */
var envPort = 'PORT';
var envMode = 'MODE';
var envEndpoint = 'OUT';
var portSeparator = ':';


/**
 * Create the MultiConnector component.
 *
 * @constructor
 * @classdesc MultiConnector implementation.
 * @param {Object} cfg - MultiConnector configuration
 * @param {string} cfg.host - The address and port where the connector is listening to
 * @param {string} cfg.mode - The MultiConnector working mode (supported values: 'lb', 'bc', 'ps')
 * @param {string} cfg.endpoint - The endpoint name where receiving addresses are available
 */
function MultiConnector(cfg) {

    var self = this;

    this.log = (msg, err) => console.log(`[MultiConnector] ${msg} ${err ? err.stack : ""}`);

    this.log('MultiConnector()', cfg);

    // Initialize connector
    self._init(cfg);
    //self._cfg = cfg;

}

MultiConnector.prototype._init = function (cfg) {

    this.log('START _init()', cfg);

    var self = this;

    if (!self._cfg) self._cfg = {};
    for (var attName in cfg) self._cfg[attName] = cfg[attName];

    // - Check required data
    //
    if (!self._cfg.host)
        throw error('Unable to initialize MultiConnector: \'host\' not specified');
    [self._cfg.addr, self._cfg.port] = self._cfg.host.split(":");
    if (!self._cfg.port)
        throw error('Unable to initialize MultiConnector: \'port\' not specified');
    if (!self._cfg.mode)
        throw error('Unable to initialize MultiConnector: \'mode\' not specified');
    if (!self._cfg.endpoint)
        throw error('Unable to initialize MultiConnector: \'endpoint\' not specified');

    this.log('END _init()');

};


/**
 * Start the MultiConnector.
 *
 * @param {Object} [cfg] - The MultiConnector configuration
 * @param {OperationCallback} cb - The operation callback
 */
MultiConnector.prototype.start = function () {

    this.log('START start()');

    var self = this;

    if (self._started) throw error('MultiConnector is already running');

    // 1. Create server
    //
    var deferred = Q.defer();
    self._server = net.createServer()
        .on('connection', function (client) {
            self.log('<connection> new -> addr:' + client.remoteAddress + ', port:' + client.remotePort);
            self._addConnection(client, function (err) {
                if (err) client.destroy();
            });
        })
        .on('close', function () {
            self.log('<connection> close');
        })
        .on('error', function (err) {
            self.log('<connection> error -> ' + err.message + '\n' + err.stack);
            deferred.reject(error(err));
        })
        .on('listening', function () {
            self.log('listening to ' + JSON.stringify(self._server.address()));
            deferred.resolve(true);
        })
        .listen(self._cfg.port, self._cfg.addr);

    return deferred.promise
        .then(function (res) {
            self.log('END start() SUCCESS');
            self._started = true;
            self._receivers = self._receivers ? self._receivers : [];
            self._connections = {};
        })
        .fail(function (err) {
            self.log('END start() ERROR', err);
        });

};

/**
 * Stop the MultiConnector.
 *
 */
MultiConnector.prototype.stop = function () {

    this.log('START stop()');

    var self = this;

    if (!self._started) throw error('MultiConnector not running');

    // 1. Close server
    //
    var deferred = Q.defer();
    self._server.close(function (err) {
        if (err) deferred.reject(error(err));
        else deferred.resolve(true);
    });

    return deferred.promise
        .then(function (res) {

            // 2. Close all connections
            //
            var con;
            var deferreds = [];
            _.each(self._connections, function (con, locator) {
                var deferred = Q.defer();
                deferreds.push(deferred);
                self._removeConnection(locator, function (err) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(true);
                });

            });
            return Q.waitAll(_.map(deferreds, function (deferred) { return deferred.promise; }));

        })
        .then(function (res) {
            self.log('END stop() SUCCESS');
            self._started = false;
        })
        .fail(function (err) {
            self.log('END stop() ERROR', err);
        });

};

/**
 * Retrieves information about the MultiConnector.
 *
 */
MultiConnector.prototype.info = function () {

    this.log('info()');

    var self = this;

    return {
        port: self._cfg.port,
        mode: self._cfg.mode,
        endpoint: self._cfg.endpoint,
        status: self._started ? 'running' : 'stopped',
        receivers: self._receivers
    };

};

/**
 * Update connctor endpoint config.
 *
 */
MultiConnector.prototype.update = function (cfg) {

    this.log(`update(${JSON.stringify(cfg)})`);

    var self = this;

    let [endpoint, addresses] = cfg.split("=");
    addresses = _.map(
        addresses ? addresses.split(",") : [],
        address => {
            let [addr, port] = address.split(":");
            return {
                addr: addr,
                port: port || this._cfg.port
            };
        }
    )

    let receivers = this.listReceivers();
    let toRemove = _.differenceBy(receivers, addresses, rec => `${rec.addr}:${rec.port}`);
    let toAdd = _.differenceBy(addresses, receivers, rec => `${rec.addr}:${rec.port}`);
    for (let add of toAdd) this.addReceiver(`${add.addr}:${add.port}`);
    for (let remove of toRemove) this.removeReceiver(`${remove.addr}:${remove.port}`);
    fs.writeFileSync(FILE_DB, JSON.stringify(self._receivers));
};


/**
 * Adds a new receiver instance to the multiconnector.
 *
 * @param {string} addr - The receiver address
 */
MultiConnector.prototype.addReceiver = function (addr) {

    this.log('addReceiver(' + addr + ')');

    var self = this;

    if (!self._started) throw error('MultiConnector not running');

    var receiver = {
        addr: addr.split(portSeparator)[0],
        port: addr.split(portSeparator)[1] ? addr.split(portSeparator)[1] : self._cfg.port,
        status: 'healthy'
    };
    self._receivers.push(receiver);

};


/**
 * Removes a receiver instance from the multiconnector.
 *
 * @param {string} addr - The receiver address
 */
MultiConnector.prototype.removeReceiver = function (addr) {

    this.log('removeReceiver(' + addr + ')');

    var self = this;

    if (!self._started) throw error('MultiConnector not running');

    var receiverToRemove = {
        addr: addr.split(portSeparator)[0],
        port: addr.split(portSeparator)[1] ? addr.split(portSeparator)[1] : self._cfg.port
    };

    _.remove(self._receivers, function (receiver) {
        return receiver.addr == receiverToRemove.addr && receiver.port == receiverToRemove.port;
    });

};

/**
 * Lists all the receivers of the multiconnector.
 *
 * @param {string} [query] - The query
 * @param {string} [query.addr] - Specifies the address of the receivers
 * @param {string} [query.status] - Specifies the status of the receivers
 * @return {Array.<Object>} The list of receivers
 */
MultiConnector.prototype.listReceivers = function (query) {

    this.log('listReceivers()');

    var self = this;

    if (!self._started) throw error('MultiConnector not running');

    query = query || {};

    if (query.addr && query.addr.indexOf(portSeparator) !== -1) {
        query.port = query.addr.split(portSeparator)[1];
        query.addr = query.addr.split(portSeparator)[0];
    }

    var receivers = _.filter(self._receivers, function (receiver) {
        var result = true;
        if (query.addr) result = result && (query.addr == receiver.addr);
        if (query.port) result = result && (query.port == receiver.port);
        if (query.status) result = result && (query.status == receiver.status);
        return result;
    });

    return receivers;

};

/**
 * Add a new connection.
 *
 * @param {net.Socket} src - The new connection
 * @param {OperationCallback} cb - The operation callback
 */
MultiConnector.prototype._addConnection = function (src, cb) {

    var self = this;

    this.log('START _addConnection(' + src.remoteAddress + portSeparator + src.remotePort + ')');

    // 1. Allocate slot for connection
    //
    var locator = src.remoteAddress + portSeparator + src.remotePort;
    self._connections[locator] = { src: src };
    self._connections[locator].srcAddr = src.remoteAddress;
    self._connections[locator].srcPort = src.remotePort;

    if (self._cfg.mode == 'lb') {

        var flush = function (free) {
            self.log(' - flush(' + free + '): buffs=' + self._connections[locator].buffs.length + ',buffIndex=' + self._connections[locator].buffIndex);
            if (!self._connections[locator].dst) return;
            for (; self._connections[locator].buffIndex < self._connections[locator].buffs.length; self._connections[locator].buffIndex++) {

                self._connections[locator].dst.write(self._connections[locator].buffs[self._connections[locator].buffIndex], function (err) {
                    if (!err && self._connections[locator].dstStatus == 'unbound') {
                        self._connections[locator].dstStatus = 'bound';
                        flush(true);
                        self._connections[locator].receiver.status = 'healthy';
                        deferred.resolve(true);
                    }
                });
            }
            if (free) {
                self._connections[locator].buffs = [];
                self._connections[locator].buffIndex = 0;
            }
        };

        // Special attributes required for lb
        //
        self._connections[locator].srcStatus = 'opened';
        self._connections[locator].buffs = [];
        self._connections[locator].dstStatus = 'none';

        // 2. Register listeners on incoming connection
        //
        src.on('close', function () {
            self.log('- connection ' + locator + ' src->close');
            self._connections[locator].srcStatus = 'closed';
            if (self._connections[locator].dstStatus == 'closed' || self._connections[locator].dstStatus == 'none') self._removeConnection(locator);
        })
            .on('drain', function () {
                self.log('- connection ' + locator + ' src->drain');
            })
            .on('error', function (err) {
                self.log('- connection ' + locator + ' src->error', err);
                self._connections[locator].srcStatus = 'error';
                self._connections[locator].srcError = err;
                if (self._connections[locator].dstStatus == 'bound') self._connections[locator].dst.destroy(err);

            })
            .on('timeout', function () {
                self.log('- connection ' + locator + ' src->timeout');
            })
            .on('data', function (data) {
                self.log('- connection ' + locator + ' src->data, srcStatus=' + self._connections[locator].srcStatus + ',dstStatus=' + self._connections[locator].dstStatus);
                self._connections[locator].srcStatus = 'streaming';
                if (self._connections[locator].dstStatus == 'bound') {
                    self._connections[locator].dst.write(data);
                } else {
                    self._connections[locator].buffs.push(data);
                    flush();
                }
            })
            .on('end', function () {
                self.log('- connection ' + locator + ' src->end, srcStatus=' + self._connections[locator].srcStatus + ',dstStatus=' + self._connections[locator].dstStatus);
                self._connections[locator].srcStatus = 'ended';
                if (self._connections[locator].dstStatus == 'bound') {
                    self._connections[locator].dst.end();
                }
            });

        var deferred = Q.defer();
        var exceptions = [];

        /**
         * Open a connection against the next receiver.
         */
        var openConnection = function () {

            // - Select receiver
            var receiver = self._nextDst(self._receivers, { exceptions: exceptions });
            exceptions.push(receiver);

            self.log(`- connecting to destination ${receiver.addr}:${receiver.port} ...`);

            var dst = net.createConnection({ port: receiver.port, host: receiver.addr });
            dst.on('connect', function () {
                self.log('- connection ' + locator + ' dst->connect, srcStatus=' + self._connections[locator].srcStatus + ',dstStatus=' + self._connections[locator].dstStatus);

                // Refresh slot info
                //
                self._connections[locator].dstStatus = 'unbound';
                self._connections[locator].receiver = receiver;
                self._connections[locator].dst = dst;
                self._connections[locator].buffIndex = 0;

                if (self._connections[locator].srcError) {
                    dst.destroy(self._connections[locator].srcError);
                    //dst.end();
                } else if (self._connections[locator].srcStatus != 'opened') {
                    flush();
                    if (self._connections[locator].srcStatus != 'streaming') dst.end();
                }

            })
                .on('close', function () {
                    self.log('- connection ' + locator + ' dst->close');
                    if (self._connections[locator]) {
                        if (self._connections[locator].dstStatus != 'none') self._connections[locator].dstStatus = 'closed';
                        if (self._connections[locator].srcStatus == 'closed') self._removeConnection(locator);
                    }
                })
                .on('drain', function () {
                    self.log('- connection ' + locator + ' dst->drain');
                })
                .on('error', function (err) {
                    self.log('- connection ' + locator + ' dst->error', err);
                    if (!self._connections[locator].srcError) {
                        receiver.status = 'failed';
                        if (exceptions.length === self._receivers.length) {
                            self._connections[locator].dstStatus = 'none';
                            src.destroy(error('Unable to find receiver'));
                            deferred.reject(error(err));
                        } else openConnection();
                    }
                })
                .on('timeout', function () {
                    self.log('- connection ' + locator + ' dst->timeout');
                })
                .on('data', function (data) {
                    self.log('- connection ' + locator + ' dst->data, srcStatus=' + self._connections[locator].srcStatus + ',dstStatus=' + self._connections[locator].dstStatus);
                    if (self._connections[locator].dstStatus == 'unbound') {
                        self._connections[locator].dstStatus = 'bound';
                        flush(true);
                        receiver.status = 'healthy';
                        deferred.resolve(true);
                    }
                    src.write(data);
                })
                .on('end', function () {
                    self.log('- connection ' + locator + ' dst->end, srcStatus=' + self._connections[locator].srcStatus + ',dstStatus=' + self._connections[locator].dstStatus);
                    if (self._connections[locator].dstStatus == 'bound') {
                        self._connections[locator].dstStatus = 'ended';
                        if (self._connections[locator].srcStatus != 'ended' && self._connections[locator].srcStatus != 'closed') src.end();
                    } else {
                        receiver.status = 'failed';
                        if (exceptions.length === self._receivers.length) {
                            self._connections[locator].dstStatus = 'none';
                            src.destroy(error('Unable to find receiver'));
                            deferred.reject(error('Destination not bound'));
                        } else openConnection();
                    }
                });
        };

        // - Try connection
        try {
            openConnection();
        } catch (err) {
            self.log(err.stack);
            deferred.reject(error(err));
        }

        deferred.promise
            .then(function (res) {
                self.log('END _addConnection(' + src.remoteAddress + portSeparator + src.remotePort + ') SUCCESS');
                if (cb) cb();
            })
            .fail(function (err) {
                self.log('END _addConnection(' + src.remoteAddress + portSeparator + src.remotePort + ') ERROR', err);
                if (cb) cb(error(err));
            });

    } else if (self._cfg.mode == 'bc' || self._cfg.mode == 'ps') {

        // Special attributes required for ps
        //
        self._connections[locator].dests = {};

        // 2. Register basic listeners on incoming connection
        //
        src.on('close', function () {
            self.log('- connection ' + locator + ' src->close');
            self._removeConnection(locator);
        })
            .on('drain', function () {
                self.log('- connection ' + locator + ' src->drain');
            })
            .on('error', function (err) {
                self.log('- connection ' + locator + ' src->error', err);
            })
            .on('timeout', function () {
                self.log('- connection ' + locator + ' src->timeout');
            });

        // If no destinations reject?
        if (!self._receivers.length) {
            src.end();
            src.destroy();
            return;
        }

        var deferreds = [];
        self._receivers.forEach(function (receiver) {
            var deferred = Q.defer();
            deferreds.push(deferred);

            var dst = net.createConnection({ port: receiver.port, host: receiver.addr });
            dst.on('connect', function () {
                self.log('- connection ' + locator + ' dst->connect');

                // Refresh slot info
                //
                self._connections[locator].dests[receiver.addr + portSeparator + receiver.port] = dst;
                receiver.status = 'healthy';
                deferred.resolve(true);
            })
                .on('close', function () {
                    self.log('- connection ' + locator + ' dst->close');
                    self._removeConnection(locator, receiver.addr + portSeparator + receiver.port);
                })
                .on('drain', function () {
                    self.log('- connection ' + locator + ' dst->drain');
                })
                .on('error', function (err) {
                    self.log('- connection ' + locator + ' dst->error: ' + err.message + '\n' + err.stack);
                    receiver.status = 'failed';
                    if (self._connections[locator].dests[receiver.addr + portSeparator + receiver.port]) {
                        self._removeConnection(locator, receiver.addr + portSeparator + receiver.port);
                    } else {
                        deferred.reject(error(err));
                    }
                })
                .on('timeout', function () {
                    self.log('- connection ' + locator + ' dst->timeout');
                });

        });
        Q.waitAll(_.map(deferreds, function (deferred) { return deferred.promise; }))
            .finally(function (res) {

                // If no healthy destinations then reject
                if (!_.keys(self._connections[locator].dests).length) {
                    src.end();
                    src.destroy();
                    return;
                }

                // Enable single-direction streaming
                //
                src.on('data', function (data) {
                    _.forEach(self._connections[locator].dests, function (dst, dstLocator) {
                        dst.write(data);
                    });
                })
                    .on('end', function () {
                        self.log('- connection ' + locator + ' dst->end');
                        _.forEach(self._connections[locator].dests, function (dst, dstLocator) {
                            dst.end();
                        });
                    });

                deferred.resolve(true);
            });

    }

};

/**
 * Remove a connection.
 *
 * @param {string} srcLocator - The connection source locator
 * @param {string} dstLocator - The connection destination locator
 */
MultiConnector.prototype._removeConnection = function (srcLocator, dstLocator) {

    var self = this;

    this.log('_removeConnection(' + srcLocator + ',' + dstLocator + ')');

    if (self._connections[srcLocator] && dstLocator && self._connections[srcLocator].dests[dstLocator]) {
        if (self._connections[srcLocator].dests[dstLocator]) self._connections[srcLocator].dests[dstLocator].destroy();
        delete self._connections[srcLocator].dests[dstLocator];
    } else if (self._connections[srcLocator] && !dstLocator) {
        if (self._connections[srcLocator].dests) {
            self._connections[srcLocator].src.destroy();
            _.forEach(self._connections[srcLocator].dests, function (dst, dstLocator) {
                self._connections[srcLocator].dests[dstLocator].destroy();
                delete self._connections[srcLocator].dests[dstLocator];
            });
        }
        delete self._connections[srcLocator];
    }

};


/**
 * Selects the next destination among multiple possibilities.
 *
 * @param {Array.<Array.<string>>} dests - Possible destinations
 * @param {Object} [cfg] - Configuration
 * @param {string} [cfg.schema] - The schema to use (e.g. 'random', 'first')
 * @param {Array.<Array.<string>>} [cfg.exceptions] - The addresses to avoid
 * @return {Object} The destination
 */
MultiConnector.prototype._nextDst = function (dests, cfg) {

    var self = this;

    if (!dests || !_.isArray(dests)) throw error('Unable to find destination: no destinations specified');

    cfg = cfg ? cfg : {};
    cfg.schema = cfg.schema ? cfg.schema : 'random';
    cfg.exceptions = cfg.exceptions ? cfg.exceptions : [];

    var availableDests = _.difference(dests, cfg.exceptions, _.isEqual);

    if (availableDests.length === 0) throw error('No destination available');

    var index, addr;
    switch (cfg.schema) {
        case 'first':
            // 'first' schema
            addr = availableDests[0];
            break;
        default:
            // 'random' schema
            index = Math.floor(availableDests.length * Math.random());
            addr = availableDests[index];
    }
    return addr;

};

module.exports = function (cfg) {

    // 1. Check config
    //
    if (!cfg) cfg = {};

    cfg.port = cfg.port ? cfg.port : process.env[envPort];
    cfg.mode = cfg.mode ? cfg.mode : process.env[envMode];
    cfg.endpoint = cfg.endpoint ? cfg.endpoint : process.env[envEndpoint];

    // 2. Create multiconnector
    //
    var multiconnector = new MultiConnector(cfg);

    // 3. Restore receivers
    if (fs.existsSync(FILE_DB)) {
        multiconnector._receivers = JSON.parse(fs.readFileSync(FILE_DB).toString());
    }

    // 3. Start multiconnector
    //
    /*var deferred = Q.defer();
    multiconnector.start(function(err) {
        if (err) {
            this.log('Unable to start MultiConnector', err);
            deferred.reject(error(err));
        } else {
            this.log('MultiConnector started');
            deferred.resolve(true);
        }
    });

    deferred.promise
    /*.then(function(res) {

        // 4. Add receivers
        //
        if (cfg.endpoint) {
            var addresses = cfg.endpoint.split(addrSeparator);
            var deferreds = [];
            addresses.forEach(function(address) {
                var deferred = Q.defer();
                deferreds.push(deferred);
                multiconnector.addReceiver(address.split(portSeparator).length > 1? address: address + portSeparator + cfg.port, function(err, receiver) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(receiver);
                });
            });
            return Q.waitAll(_.map(deferreds, function(deferred) { return deferred.promise; }));
        } else {
            return Q(true);
        }

    })
    .then(function(res) {
        if (cb) cb();
    })
    .fail(function(err) {
        if (cb) cb(error(err));
    });*/

    return multiconnector;

};
