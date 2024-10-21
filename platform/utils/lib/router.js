/**
 * Implementation of the router component.
 *
 * Within the PaaS, a router is used for tunneling instance connections. Routers
 * enable end-to-end communications between instances. To that end, three routers
 * are required for every end-to-end connection:
 * - source router: installed in the Sentinel of the source instance.
 *   It captures every connection coming from the source instance and forwards them
 *   to the middle router.
 * - middle router: installed in the Machine Controller of the destination instance.
 *   It forwards every connection comming from the source router to the destination
 *   router.
 * - destination router: installed in the Sentinel of the destination
 *   instance. It forwards every connection coming from the middle router to the
 *   destination instance.
 *
 * Actually, only two routers are really required: the source router and the destination
 * router. Any number of middle router may exist in order to enable end-to-end communications
 * in more complex network scenarios where direct connection between machines could
 * not be possible.
 *
 * To enable this configuration, a router may work in one of three modes:
 * 1. Source mode: one per connection enabled between two instances. The router
 * 	  intercepts every connection coming from a given machine at a given port and
 * 	  forwards them to the middle router installed in the Machine Controller of
 * 	  the destination instance.
 * 2. Middle mode: one per Machine Controller. The router forwards every connection
 * 	  comming from a source router to the destination router.
 * 3. Destination mode: one per Sentinel. The router forwards every
 *    connection coming from a middle router to the destination instance.
 *
 * Source and destination routers may implement transparent mode. In transparent
 * mode the router hides all routing management implementing packet mangling.
 * Source and destination instances look like directly connected peers.
 *
 * A source router may implement virtual addresses. To this end, every connection
 * against the virtual address will be internally translated to different real addresses.
 * Different schemas might be used for this internal translation. Virtual addresses are
 * helpful for:
 * - Load balancing
 * - Masking failures
 *
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
var util = require('util');
var net = require('net');
var os = require('os');

// External dependencies
var _ = require('lodash');

var Q = require('./q');
var name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
var _log = require('./log').logger('utils.router' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
var _run = require('./cmd').run;
var error = require('./error');

/**
 * Globals:
 *
 * - ROUTER_NAME: default router name (for debugging purposes)
 * - SCHEMA: default load balancing schema
 * - LOCAL_ADDR: default address where the router will be listening to
 * - ADDR_SEPARATOR: string used for separating addresses in a list
 */
var ROUTER_NAME = 'router';
var SCHEMA = 'random';
var LOCAL_ADDR = '0.0.0.0';
var ADDR_SEPARATOR = '-';
var PORT_SEPARATOR = ':';

/**
 * Create a router.
 *
 * @constructor
 * @classdesc Router implementation
 * @param {Object} cfg - Router configuration
 * @param {string} mode - Router mode ('src', 'dst', 'mid')
 * @param {string} [cfg.name] - The router name (for debugging purposes)
 * @param {string} [cfg.local] - The local address this router is listening to
 * @param {string} [cfg.src] - Permitted source address
 * @param {string|Array.<string>} [cfg.skip] - Addresses to skip when redirecting
 * @param {string|Array.<string>} [cfg.dst] - Permitted destination address/es
 * @param {string|Array.<string>} [cfg.next] - Next router address/es
 * @param {string} [cfg.schema] - The schema to use when multiple destinations are configured.
 *                                Supported schemas are: 'random', 'first'
 * @param {Object} [transparent] - Enables transparent router when router in 'src' or 'dst' mode
 * @param {string} transparent.pubDev - Public device
 * @param {string} transparent.privDev - Private device
 * @param {string} transparent.virtual - The virtual address which masks other destinations
 */
function TcpRouter(cfg) {

    _log('TcpRouter(' + JSON.stringify(cfg) + ')');

    var self = this;

    self._cfg = {};
    self._init(cfg || {});

}

/**
 * Initialize router configuration.
 *
 * @param  {Object} cfg - The router configuration
 */
TcpRouter.prototype._init = function (cfg) {

    var self = this;

    _log('START _init(' + JSON.stringify(cfg) + ')');

    self._cfg.mode = cfg.mode || self._cfg.mode;
    self._cfg.name = cfg.name || self._cfg.name || ROUTER_NAME;

    if (cfg.local) {
        self._cfg.local = {
            addr: cfg.local.split(PORT_SEPARATOR)[0],
            port: cfg.local.split(PORT_SEPARATOR)[1]
        };
    } else if (!self._cfg.local) self._cfg.local = { addr: LOCAL_ADDR };

    if (cfg.src) {
        self._cfg.src = {
            addr: cfg.src.split(PORT_SEPARATOR)[0],
            port: cfg.src.split(PORT_SEPARATOR)[1]
        };
    }

    /*if (cfg.skip) {
        self._cfg.skip = util.isArray(cfg.skip) ? cfg.skip : [cfg.skip];
        self._cfg.skip = _.map(self._cfg.skip, function (route) {
            return _.map(route.split(ADDR_SEPARATOR), function (next) {
                return {
                    addr: next.split(PORT_SEPARATOR)[0],
                    port: next.split(PORT_SEPARATOR)[1]
                };
            });

        });
        if (_.find(self._cfg.skip, function (route) { return _.find(route, function (next) { return !next.port; }); }))
            throw error('Wrong router configuration: skip port not set');
    }*/

    if (cfg.dst) {
        self._cfg.dst = util.isArray(cfg.dst) ? cfg.dst : [cfg.dst];
        self._cfg.dst = _.map(self._cfg.dst, function (route) {
            return _.map(route.split(ADDR_SEPARATOR), function (next) {
                return {
                    addr: next.split(PORT_SEPARATOR)[0],
                    port: next.split(PORT_SEPARATOR)[1]
                };
            });

        });
        if (_.find(self._cfg.dst, function (route) { return _.find(route, function (next) { return !next.port; }); }))
            throw error('Wrong router configuration: destination port not set');
    }

    self._cfg.schema = cfg.schema || SCHEMA;

    if (cfg.next) {
        self._cfg.next = util.isArray(cfg.next) ? cfg.next : cfg.next.split(ADDR_SEPARATOR);
        self._cfg.next = _.map(self._cfg.next, function (next) {
            return {
                addr: next.split(PORT_SEPARATOR)[0],
                port: next.split(PORT_SEPARATOR)[1]
            };
        });
        if (_.find(self._cfg.next, function (next) { return !next.port; })) throw error('Wrong router configuration: next port not set');
    }

    var dev;
    if (cfg.transparent) {
        self._cfg.transparent = {};
        self._cfg.transparent.pubDev = cfg.transparent.pubDev || transparent_pubDev;
        dev = os.networkInterfaces()[self._cfg.transparent.pubDev];
        if (!dev) throw error('Wrong router configuration: ' + self._cfg.transparent.pubDev + ' dev does not exist');
        self._cfg.transparent.pubAddr = _.find(dev, function (addr) { return (addr.family == 'IPv4'); }).address;

        self._cfg.transparent.privDev = cfg.transparent.privDev || transparent_privDev;
        dev = os.networkInterfaces()[self._cfg.transparent.privDev];
        if (!dev) throw error('Wrong router configuration: ' + self._cfg.transparent.privDev + ' dev does not exist');
        self._cfg.transparent.privAddr = _.find(dev, function (addr) { return (addr.family == 'IPv4'); }).address;

        if (cfg.transparent.virtual)
            self._cfg.transparent.virtual = {
                addr: cfg.transparent.virtual.split(PORT_SEPARATOR)[0],
                port: cfg.transparent.virtual.split(PORT_SEPARATOR)[1]
            };
    }

    // checkings ...
    //
    if (!self._cfg.mode) throw error('Wrong router configuration: mode not specified');
    if (self._cfg.mode == 'src' && !self._cfg.transparent && !self._cfg.dst) throw error('Wrong source router configuration: destination not set');
    if (self._cfg.mode == 'src' && self._cfg.transparent && !self._cfg.transparent.virtual && !self._cfg.dst) throw error('Wrong source router configuration: destination not set');
    if (self._cfg.mode == 'src' && self._cfg.transparent && self._cfg.dst.length > 1 && !self._cfg.transparent.virtual)
        throw error('Wrong source router configuration: transparent router with multiple destinations requires virtual address');
    if (self._cfg.mode == 'mid' && self._cfg.transparent) throw error('Wrong middle router configuration: transparent behavior is not supported');

    _log('END _init() SUCCESS');

};

/**
 * Start router.
 *
 * @param {Object} cfg - The router configuration
 * @param {Function} cb - The operation callback. It returns the address where the router is listening to
 */
TcpRouter.prototype.start = function (cfg, cb) {

    var self = this;

    _log('START start()');

    if (util.isFunction(cfg)) {
        cb = cfg;
        cfg = null;
    }

    self._init(cfg || {});

    // 1. Create server
    //
    var deferred = Q.defer();
    var createServer = function () {

        var port = self._cfg.local.port;
        if (!port) {

            // - calculate ephemeral port
            //
            port = Math.floor(32768 + (61000 - 32768) * Math.random());
        }

        self._server = net.createServer()
            .on('connection', function (client) {
                _log('event <connection> -> addr:' + client.remoteAddress + ', port:' + client.remotePort);
                self._addConnection(client, function (err) {
                    if (err) client.destroy();
                });
            })
            .on('close', function () {
                _log('event <close>');
            })
            .on('error', function (err) {
                _log.error('event <error> -> ', err);
                if (!self._cfg.local.port && err.errno && err.errno == 'EADDRINUSE') {
                    createServer();
                } else deferred.reject(error(err));
            })
            .on('listening', function () {
                _log('listening to ' + JSON.stringify(self._server.address()));
                self._cfg.local.port = port;
                deferred.resolve(true);
            })
            .listen(port, self._cfg.local.addr);
    };

    createServer();

    deferred.promise
        .then(function (res) {

            // 2. If transparent, then set firewall rules
            //
            var deferred = Q.defer();
            if (self._cfg.transparent && self._cfg.mode == 'src') {

                var dst = self._cfg.transparent.virtual || self._cfg.dst[0][self._cfg.dst[0].length - 1];

                _run(
                    [
                        'iptables -A PREROUTING -t nat -i ' + self._cfg.transparent.privDev + ' -p tcp' +
                        ' --destination ' + dst.addr + ' --dport ' + dst.port +
                        (self._cfg.srcAddr ? ' --source ' + self._cfg.srcAddr + (self._cfg.srcPort ? ' --sport ' + self._cfg.srcPort : '') : '') +
                        ' -j DNAT --to ' + self._cfg.local.addr + ':' + self._cfg.local.port,

                        'iptables -A POSTROUTING -t nat -o ' + self._cfg.transparent.privDev + ' -p tcp' +
                        ' --sport ' + self._cfg.local.port +
                        (self._cfg.srcAddr ? ' --destination ' + self._cfg.srcAddr + (self._cfg.srcPort ? ' --dport ' + self._cfg.srcPort : '') : '') +
                        ' -j SNAT --to ' + dst.addr + ':' + dst.port
                    ],
                    function (err, out) {
                        if (err) deferred.reject(error(err));
                        else deferred.resolve(true);
                    }
                );

            } else {
                deferred.resolve(true);
            }

            return deferred.promise;

        })
        .then(function (res) {
            _log('END start() SUCCESS');
            self._started = true;
            self._connections = {};
            if (cb) cb(null, self._cfg.local.addr + PORT_SEPARATOR + self._cfg.local.port);
        })
        .fail(function (err) {
            _log.error('END start() ERROR', err);
            if (cb) cb(error(err));
        });

};

/**
 * Stop router.
 *
 * @param {Function} cb - The operation callback
 */
TcpRouter.prototype.stop = function (cb) {

    var self = this;

    _log('START stop()');

    if (!self._started) throw error('Unable to stop router: it is not running');

    // 1. Close server
    //
    var deferred = Q.defer();
    self._server.close(function (err) {
        if (err) deferred.reject(error(err));
        else deferred.resolve(true);
    });

    deferred.promise
        .then(function (res) {

            // 2. Close all connections
            //
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

            // 3. Remove all rules
            //
            var deferred = Q.defer();
            if (self._cfg.transparent) {

                if (self._cfg.mode == 'src') {

                    var dst = self._cfg.transparent.virtual ? self._cfg.transparent.virtual : self._cfg.dst[0][self._cfg.dst[0].length - 1];
                    var deferred1 = Q.defer();
                    var lock1 = _run('iptables -L PREROUTING -t nat -vn --line-numbers', { lock: true }, function (err, out) {
                        if (err) {
                            deferred1.reject(error(err));
                            lock1.resolve(true);
                            return;
                        }

                        var lines = _parseIptables(out);
                        for (var i = 0; i < lines.length; i++) {
                            if (lines[i].destination.indexOf(dst.addr) != -1 &&
                                lines[i].in.indexOf(self._cfg.transparent.privDev) != -1 &&
                                lines[i].remainder.indexOf('dpt:' + dst.port) != -1 &&
                                lines[i].remainder.indexOf('to:' + self._cfg.local.addr + ':' + self._cfg.local.port) != -1) {

                                _run('iptables -D PREROUTING ' + lines[i].num + ' -t nat', { lock: lock1 }, function (err, out) {
                                    if (err) deferred1.reject(error(err));
                                    else deferred1.resolve(true);
                                    lock1.resolve(true);
                                });

                                break;
                            }
                        }
                    });

                    var deferred2 = Q.defer();
                    var lock2 = _run('iptables -L POSTROUTING -t nat -vn --line-numbers', { lock: true }, function (err, out) {
                        if (err) {
                            deferred2.reject(error(err));
                            lock2.resolve(true);
                            return;
                        }

                        var lines = _parseIptables(out);
                        for (var i = 0; i < lines.length; i++) {
                            if (lines[i].out.indexOf(self._cfg.transparent.privDev) != -1 &&
                                lines[i].remainder.indexOf('spt:' + self._cfg.local.port) != -1 &&
                                (self._cfg.srcAddr ? lines[i].destination.indexOf(self._cfg.srcAddr) != -1 : true) &&
                                (self._cfg.srcPort ? lines[i].remainder.indexOf('dpt:' + self._cfg.srcPort) != -1 : true) &&
                                lines[i].remainder.indexOf('to:' + dst.addr + ':' + dst.port) != -1) {

                                _run('iptables -D POSTROUTING ' + lines[i].num + ' -t nat', { lock: lock2 }, function (err, out) {
                                    if (err) deferred2.reject(error(err));
                                    else deferred2.resolve(true);
                                    lock2.resolve(true);
                                });

                                break;
                            }
                        }
                    });

                    Q.waitAll(_.map([deferred1.promise, deferred2.promise]))
                        .then(function (res) {
                            deferred.resolve(true);
                        })
                        .fail(function (err) {
                            deferred.reject(error(err));
                        });

                }

            } else {
                deferred.resolve(true);
            }

        })
        .then(function (res) {
            _log('END stop() SUCCESS');
            self._started = false;
            self._connections = [];
            if (cb) cb();
        })
        .fail(function (err) {
            _log.error('END stop() ERROR', error(err));
            if (cb) cb(err);
        });

};

/**
 * Adds a new destination. Only supported for source routers which have a virtual
 * address correctly configured.
 *
 * @param {string} dst - New destination. Supported format is: 'addr:port,addr:port,...'
 */
TcpRouter.prototype.addDestination = function (dst) {

    var self = this;

    _log('START addDestination(' + dst + ')');

    dst = _.map(dst.split(ADDR_SEPARATOR), function (next) {
        return {
            addr: next.split(PORT_SEPARATOR)[0],
            port: next.split(PORT_SEPARATOR)[1]
        };
    });

    self._cfg.dst.push(dst);

    _log('END addDestination(' + dst + ') SUCCESS');

};

/**
 * Removes a previously added destination. Only supported for source routers which
 * have a virtual address correctly configured.
 *
 * @param {string} dst - The destination to remove. Supported format is 'addr:port,addr:port...'
 */
TcpRouter.prototype.removeDestination = function (dst) {

    var self = this;

    _log('START removeDestination(' + dst + ')');

    dst = _.map(dst.split(ADDR_SEPARATOR), function (next) {
        return {
            addr: next.split(PORT_SEPARATOR)[0],
            port: next.split(PORT_SEPARATOR)[1]
        };
    });

    self._cfg.dst = _.filter(self._cfg.dst, function (val) {
        return !_.isEqual(dst, val);
    });

    _log('END removeDestination(' + dst + ') SUCCESS');

};

/**
 * Lists all destinations attached to this router.
 *
 * @return {Array.<string>} The requested destinations
 */
TcpRouter.prototype.listDestinations = function () {

    var self = this;

    _log('listDestinations()');

    return _.map(self._cfg.dst, function (route) {
        return _.map(route, function (step) { return step.addr + PORT_SEPARATOR + step.port; }).join(ADDR_SEPARATOR);
    });

};

/**
 * Add a new connection.
 *
 * @param {net.Socket} src - The new connection
 * @param {Function} cb - The operation callback
 */
TcpRouter.prototype._addConnection = function (src, cb) {

    var self = this;

    _log('START _addConnection(' + src.remoteAddress + PORT_SEPARATOR + src.remotePort + ')');

    // 1. Allocate slot for connection
    //
    var locator = src.remoteAddress + PORT_SEPARATOR + src.remotePort;
    self._connections[locator] = { src: src };

    // 2. Register basic listeners on incoming connection
    //
    src.on('close', function () {
        _log('- event connection ' + locator + ' src->close');
        self._removeConnection(locator);
    })
        .on('drain', function () {
            _log('- event connection ' + locator + ' src->drain');
        })
        .on('error', function (err) {
            _log.error('- event connection ' + locator + ' src->error', err);
            self._removeConnection(locator);
        })
        .on('timeout', function () {
            _log('- event connection ' + locator + ' src->timeout');
        });

    // 3. Connect
    // If source router:
    //  - check source is permitted
    //  - select one destination and create header
    //  - try connection: if error retry with next destination
    //  - if no more available destinations notify error
    // Otherwise:
    //  - read header
    //  - check destination is permitted
    //  - try connection: if error notify error
    //
    var header;
    var deferred = Q.defer();
    if (self._cfg.mode == 'src') {

        // - Access control
        //
        if ((self._cfg.srcAddr && self._cfg.srcAddr != src.remoteAddress) ||
            (self._cfg.srcPort && self._cfg.srcPort != src.remotePort)) {
            deferred.reject(error('Access control error: connection from source not permitted'));
        } else {

            var exceptions = [];

            /**
             * Open a connection against the next router.
             */
            var openConnection = function () {

                // - Create header
                header = self._cfg.next ? _.map(self._cfg.next, function (next) { return next.addr + PORT_SEPARATOR + next.port; }) : [];

                // - Select destination
                var dst = self._nextDst(self._cfg.dst, { exceptions: exceptions });

                // - Concatenate all hops
                header = _.concat(header, _.map(dst, function (next) { return next.addr + PORT_SEPARATOR + next.port; }));

                // - Insert source and ts
                header.push(src.remoteAddress + PORT_SEPARATOR + src.remotePort + '(' + Date.now() + ')');

                self._connections[locator].dstAddr = header[0].split(PORT_SEPARATOR)[0];
                self._connections[locator].dstPort = header[0].split(PORT_SEPARATOR)[1];
                self._connections[locator].srcAddr = src.remoteAddress;
                self._connections[locator].srcPort = src.remotePort;

                exceptions.push(dst);

                self._connect(locator, header, function (err) {
                    if (err) {
                        if (self._cfg.dst.length === 1) deferred.reject(error(err));
                        else {
                            dst.status = 'failed';
                            if (exceptions.length === self._cfg.dst.length) deferred.reject(error(err));
                            else openConnection();
                        }
                    } else {
                        dst.status = 'healthy';
                        deferred.resolve(true);
                    }
                });
            };

            // - Try connection
            openConnection();

        }

    } else {

        // - Read header
        _read(src, function (err, str) {
            if (err) deferred.reject(error(err));
            else {
                header = str.split(ADDR_SEPARATOR);

                /*// - skip addresses 
                if (self._cfg.skip) {
                    header = header.filter((location) => {
                        location = {
                            addr: location.split(PORT_SEPARATOR)[0],
                            port: location.split(PORT_SEPARATOR)[1]
                        };
                        return !self._cfg.skip.find(
                            (skip) => skip.addr === location.addr &&
                                skip.port === location.port
                        );
                    });
                }*/

                _log('- header found: ' + str);

                self._connections[locator].dstAddr = header[0].split(PORT_SEPARATOR)[0];
                self._connections[locator].dstPort = header[0].split(PORT_SEPARATOR)[1];
                self._connections[locator].srcAddr = header[header.length - 1].split(PORT_SEPARATOR)[0];
                self._connections[locator].srcPort = header[header.length - 1].split(PORT_SEPARATOR)[1].split('(')[0];

                // - Access control
                /*if (self._cfg.dst && !_.find(self._cfg.dst, function(dst) { return dst.addr == header[header.length-2].split(PORT_SEPARATOR)[0] && dst.port == header[header.length-2].split(PORT_SEPARATOR)[1]; }))
                {
                    _log('TcpRouter[' + self._cfg.name + '].addConnection() not permitted destination connection');
                    src.end();
                    deferred.reject(error('Access control error: connection to destination not permitted'));
                    return;
                }*/

                // - Try connection
                self._connect(locator, header, function (err) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(true);
                });

            }

        });
    }

    deferred.promise
        .then(function (res) {
            _log('END _addConnection(' + src.remoteAddress + PORT_SEPARATOR + src.remotePort + ') SUCCESS');

            // - notify metrics
            //self._metrics('newconnection', locator, Number(header[header.length-1].split(PORT_SEPARATOR)[1].split('(')[1].slice(0,-1)));

            if (cb) cb();
        })
        .fail(function (err) {
            _log.error('END _addConnection(' + src.remoteAddress + PORT_SEPARATOR + src.remotePort + ') ERROR', err);
            if (cb) cb(err);
        });

};

/**
 * Attempts a connection against the final destination.
 *
 * @param {string} locator - The connection locator
 * @param {Array.<string>} header - The connection header
 * @param {Function} cb - The operation callback
 */
TcpRouter.prototype._connect = function (locator, header, cb) {

    var self = this;

    _log('START _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ')');

    // - calculate ephemeral port
    //
    var port = Math.floor(32768 + (61000 - 32768) * Math.random());
    self._connections[locator].port = port;

    // - obtain info from slot
    //
    var dstAddr = self._connections[locator].dstAddr;
    var dstPort = self._connections[locator].dstPort;

    var srcAddr = self._connections[locator].srcAddr;
    var srcPort = self._connections[locator].srcPort;

    var deferred = Q.defer();
    if (self._cfg.mode == 'dst' && self._cfg.transparent) {
        _run(
            [
                'iptables -A POSTROUTING -t nat -o ' + self._cfg.transparent.privDev + ' -p tcp' +
                ' --destination ' + dstAddr + ' --dport ' + dstPort + ' --sport ' + port +
                ' -j SNAT --to ' + srcAddr + ':' + srcPort,

                'iptables -A PREROUTING -t nat -i ' + self._cfg.transparent.privDev + ' -p tcp' +
                ' --destination ' + srcAddr + ' --dport ' + srcPort +
                ' --source ' + dstAddr + ' --sport ' + dstPort +
                ' -j DNAT --to ' + self._cfg.transparent.privAddr + ':' + port
            ],
            function (err, out) {
                if (err) deferred.reject(error(err));
                else deferred.resolve(true);
            }
        );
    } else {
        deferred.resolve(true);
    }

    deferred.promise
        .then(function (res) {

            _log('- connecting to ' + dstAddr + PORT_SEPARATOR + dstPort + ' from local port ' + port + ' ...');
            var dst = net.createConnection({ port: dstPort, host: dstAddr, localPort: port });
            var src = self._connections[locator].src;

            dst.on('connect', function () {
                _log('- event connection ' + locator + ' dst->connect');

                // Refresh slot info
                //
                self._connections[locator].dst = dst;

                // Manage connection
                //
                var deferred = Q.defer();


                // - last hop if header == [final-dst, src]
                if (header.length === 2) {
                    //if (self._cfg.mode == 'dst') {

                    // - if last hop then send connection state (and time)
                    //   
                    _write(src, 'OK(' + Date.now() + ')', function (err) {
                        if (err) deferred.reject(error(err));
                        else deferred.resolve(true);
                    });

                } else {

                    // - if not destination router then send header
                    //
                    header.shift(); // remove next hop
                    _write(dst, header.join(ADDR_SEPARATOR), function (err) {
                        if (err) deferred.reject(error(err));
                        else if (self._cfg.mode != 'src') deferred.resolve(true);
                        else {

                            // - if source router then get connection state
                            //
                            _read(dst, function (err, str) {
                                if (err) deferred.reject(error(err));
                                else {
                                    var msg = str.slice(0, 2);
                                    var ts = Number(str.slice(3, str.length - 1));
                                    if (msg == 'OK') deferred.resolve(true);
                                    else deferred.reject(error('Unable to open connection against destination: destination refused'));
                                }
                            });
                        }
                    });

                }

                deferred.promise
                    .then(function (res) {

                        var deferred = Q.defer();

                        // Enable duplex piping
                        //
                        src.on('data', function (data) {
                            //self._metrics('srcdata', locator, data.length);
                            dst.write(data);
                        })
                            .on('end', function () {
                                _log('- event connection ' + locator + ' dst->end');
                                //self._metrics('srcend', locator);
                                dst.end();
                            });

                        dst.on('data', function (data) {
                            //self._metrics('dstdata', locator, data.length);
                            src.write(data);
                        })
                            .on('end', function () {
                                _log('- event connection ' + locator + ' dst->end');
                                //self._metrics('dstend', locator);
                                src.end();
                            });

                        deferred.resolve(true);

                        return deferred.promise;
                    })
                    .then(function (res) {
                        _log('END _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ') SUCCESS');

                        // Notify success: the connection has been established
                        //
                        if (cb) cb();

                    })
                    .fail(function (err) {
                        _log.error('END _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ') ERROR', err);

                        // Notify error: the connection has not been established
                        //
                        if (cb) cb(error(err));

                    });


            })
                .on('close', function () {
                    _log('- event connection ' + locator + ' dst->close');
                    //self._removeConnection(locator);
                })
                .on('drain', function () {
                    _log('- event connection ' + locator + ' dst->drain');
                })
                .on('error', function (err) {
                    _log.error('- event connection ' + locator + ' dst->error', err);

                    if (err.errno && err.errno == 'EADDRINUSE' && self._cfg.mode == 'dst' && self._cfg.transparent) {

                        var lock1 = _run('iptables -L POSTROUTING -t nat -vn --line-numbers', { lock: true }, function (err, out) {
                            if (err) {
                                _log.error('Unable to remove iptables rule', err);
                                lock1.resolve(true);
                                return;
                            }
                            var lines = _parseIptables(out);
                            for (var i = 0; i < lines.length; i++) {
                                if (lines[i].out.indexOf(self._cfg.transparent.privDev) != -1 &&
                                    lines[i].destination.indexOf(dstAddr) != -1 &&
                                    lines[i].remainder.indexOf('dpt:' + dstPort) != -1 &&
                                    lines[i].remainder.indexOf('spt:' + port) != -1 &&
                                    lines[i].remainder.indexOf('to:' + srcAddr + ':' + srcPort) != -1) {

                                    _run('iptables -D POSTROUTING ' + lines[i].num + ' -t nat', { lock: lock1 }, function (err, out) {
                                        if (err) _log.error('Unable to remove iptables rule', err);
                                        lock1.resolve(true);
                                    });
                                    break;
                                }
                            }

                        });
                        var lock2 = _run('iptables -L PREROUTING -t nat -vn --line-numbers', { lock: true }, function (err, out) {
                            if (err) {
                                _log.error('Unable to remove iptables rule', err);
                                lock2.resolve(true);
                                return;
                            }

                            var lines = _parseIptables(out);
                            for (var i = 0; i < lines.length; i++) {
                                if (lines[i].in.indexOf(self._cfg.transparent.privDev) != -1 &&
                                    lines[i].destination.indexOf(srcAddr) != -1 &&
                                    lines[i].source.indexOf(dstAddr) != -1 &&
                                    lines[i].remainder.indexOf('dpt:' + srcPort) != -1 &&
                                    lines[i].remainder.indexOf('spt:' + dstPort) != -1 &&
                                    lines[i].remainder.indexOf('to:' + self._cfg.transparent.privAddr + ':' + port) != -1) {

                                    _run('iptables -D PREROUTING ' + lines[i].num + ' -t nat', { lock: lock2 }, function (err, out) {
                                        if (err) _log.error('Unable to remove iptables rule', err);
                                        lock2.resolve(true);
                                    });

                                    break;
                                }
                            }
                        });

                        /*********************************/
                        /*      recursive call           */
                        /*********************************/
                        self._connect(header, cb);

                    } else if (header.length === 2) {
                        //} else if (self._cfg.mode == 'dst') {

                        // If acting as destination router then send connection state (and time)
                        //
                        var deferred = Q.defer();
                        _write(src, 'KO(' + Date.now() + ')', function (err) {
                            if (err) deferred.reject(error(err));
                            else deferred.resolve(true);
                        });

                        deferred.promise
                            .then(function (res) {
                                _log('- sent ack to source.');
                            })
                            .fail(function (err) {
                                _log.error('- unable to send nack to source', err);
                            })
                            .finally(function (res) {
                                _log('END _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ') ERROR');
                                self._removeConnection(locator);
                                if (cb) cb(error('Unable to connect to destination: connection refused', err));
                            });

                    } else {

                        self._removeConnection(locator);
                        if (cb) cb(error(err));

                    }

                })
                .on('timeout', function () {
                    _log('- event connection ' + locator + ' dst->timeout');
                });

        })
        .fail(function (err) {
            if (cb) cb(error(err));
        });

};

/**
 * Remove a connection.
 *
 * @param {string} locator - The connection locator
 * @param {Function} cb - The operation callback
 */
TcpRouter.prototype._removeConnection = function (locator, cb) {

    var self = this;

    _log('START _removeConnection(' + locator + ')');

    if (self._connections[locator] && !self._connections[locator].removing) {

        //self._metrics('deleteconnection', locator);

        self._connections[locator].removing = true;

        var deferred = Q.defer();
        if (self._cfg.mode == 'dst' && self._cfg.transparent) {

            var deferred1 = Q.defer();
            var lock1 = _run('iptables -L POSTROUTING -t nat -vn --line-numbers', { lock: true }, function (err, out) {
                if (err) {
                    deferred1.reject(error('Unable to remove iptables rule', err));
                    lock1.resolve(true);
                    return;
                }
                var lines = _parseIptables(out);
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].out.indexOf(self._cfg.transparent.privDev) != -1 &&
                        lines[i].destination.indexOf(self._connections[locator].dstAddr) != -1 &&
                        lines[i].remainder.indexOf('dpt:' + self._connections[locator].dstPort) != -1 &&
                        lines[i].remainder.indexOf('spt:' + self._connections[locator].port) != -1 &&
                        lines[i].remainder.indexOf('to:' + self._connections[locator].srcAddr + ':' + self._connections[locator].srcPort) != -1) {

                        _run('iptables -D POSTROUTING ' + lines[i].num + ' -t nat', { lock: lock1 }, function (err, out) {
                            if (err) deferred1.reject(error('Unable to remove iptables rule', err));
                            else deferred1.resolve(true);
                            lock1.resolve(true);
                        });

                        break;
                    }
                }
            });

            var deferred2 = Q.defer();
            var lock2 = _run('iptables -L PREROUTING -t nat -vn --line-numbers', { lock: true }, function (err, out) {
                if (err) {
                    deferred2.reject(error('Unable to remove iptables rule', err));
                    lock2.resolve(true);
                    return;
                }

                var lines = _parseIptables(out);
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].in.indexOf(self._cfg.transparent.privDev) != -1 &&
                        lines[i].destination.indexOf(self._connections[locator].srcAddr) != -1 &&
                        lines[i].source.indexOf(self._connections[locator].dstAddr) != -1 &&
                        lines[i].remainder.indexOf('dpt:' + self._connections[locator].srcPort) != -1 &&
                        lines[i].remainder.indexOf('spt:' + self._connections[locator].dstPort) != -1 &&
                        lines[i].remainder.indexOf('to:' + self._cfg.transparent.privAddr + ':' + self._connections[locator].port) != -1) {

                        _run('iptables -D PREROUTING ' + lines[i].num + ' -t nat', { lock: lock2 }, function (err, out) {
                            if (err) deferred2.reject(error('Unable to remove iptables rule', err));
                            else deferred2.resolve(true);
                            lock2.resolve(true);
                        });

                        break;
                    }
                }
            });

            Q.waitAll([deferred1.promise, deferred2.promise])
                .then(function (res) {
                    deferred.resolve(true);
                })
                .fail(function (err) {
                    deferred.reject(error(err));
                });

        } else {

            deferred.resolve(true);

        }

        deferred.promise
            .then(function (res) {
                _log('END _removeConnection(' + locator + ') SUCCESS');
                if (self._connections[locator].src) self._connections[locator].src.destroy();
                if (self._connections[locator].dst) self._connections[locator].dst.destroy();
                delete self._connections[locator];
                if (cb) cb();
            })
            .fail(function (err) {
                _log.error('END _removeConnection(' + locator + ') ERROR', err);
                if (cb) cb(error(err));
            });

    }
};

/**
 * Selects the next destination among multiple possibilities.
 *
 * @param {Array.<string>} dests - Possible destinations
 * @param {Object} [cfg] - Configuration
 * @param {string} [cfg.schema] - The schema to use (e.g. 'random', 'first')
 * @param {Array.<Array.<string>>} [cfg.exceptions] - The addresses to avoid
 * @return {Object} The destination
 */
TcpRouter.prototype._nextDst = function (dests, cfg) {

    var self = this;

    if (!dests || !util.isArray(dests)) throw error('Unable to find destination: no destinations specified');

    cfg = cfg || {};
    cfg.schema = cfg.schema || SCHEMA;
    cfg.exceptions = cfg.exceptions || [];

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

/**
 * Updates metrics from the given data.
 *
 * The following metrics are considered:
 * - latency: in destination router. Calculated when the connection from the source is
 * 			  done. Calculated as the time elapased since initial connection was received
 * 			  in source router
 * - jitter: latency variance
 * - throughput: in source/destination routers.
 * - response time: the time elapsed since last write when a new read is obtained
 *
 * These metrics make sense under the following assumptions:
 * - The clock of the different routers are synchronized.
 * - A connection is opened by the source for sending a request to the destination.
 * - Once the connection is opened the request is immediately sent.
 * - When the request is received, the destination executes a process for generating the response.
 * - The response is sent back to the source
 * - When the response has been transmitted, the source may send more requests to the destination,
 *   following the same schema presented before
 *
 * @param {string} event - The event type. Supported values: 'newconnection'
 * @param {string} locator - The connection locator
 * @param {number} measurement - The measurement used to update metrics
 */
TcpRouter.prototype._metrics = function (event, locator, measurement) {

    var self = this;

    _log('_metrics(' + event + ',' + locator + ',' + measurement + ')');

    /*switch(event) {
        case 'newconnection':

            // measurement contains the initial ts
            self._connections[locator].ts = Date.now();
            self._connections[locator].latency = self._connections[locator].ts - measurement;
            self._connections[locator].bytes = 0;

            break;
        case 'deleteconnection':

        case 'srcdata':
            // measurement contains the data length
            self._connections[locator].bytes += Date.now() - measurement;
        case 'dstdata':

        case 'srcend':

        case 'dstend':

        default:

    }*/

};

/**
 * Read the specified number of bytes from the specified input stream.
 *
 * @param {number} num - The number of bytes to read
 * @param {Function} cb - The operation callback. It returns the requested bytes
 */
function _readBytes(src, num, cb) {
    var buff = src.read(num);
    if (buff) {
        cb(null, buff);
    }
    else setTimeout(_readBytes, 0, src, num, cb);
}

/**
 * Reads a string from the specified input stream.
 *
 * @param {stream.Readable} src - The input stream
 * @param {Function} cb - The operation callback. It returns the requested string
 */
function _read(src, cb) {

    _log('_read()');

    // - Read header
    _readBytes(src, 4, function (err, buff) {
        if (err) {
            if (cb) cb(error(err));
            return;
        }
        var strSize = buff.readUInt32LE(0);

        _readBytes(src, strSize, function (err, buff) {
            if (err) {
                if (cb) cb(error(err));
                return;
            }

            var str = buff.toString();

            if (cb) cb(null, str);

        });
    });
}

/**
 * Writes a string to an output stream.
 *
 * @param {stream.Writable} dst - A writable stream
 * @param {string} str - The string to write
 * @param {Function} cb - The operation callback
 */
function _write(dst, str, cb) {
    var buff = new Buffer(str);
    var num = new Buffer(4);
    num.writeUInt32LE(buff.length);
    dst.write(Buffer.concat([num, buff]), cb);
}


/**
* Parses the specified iptables output.
*
* @param {string} txt - The text to parse
* @return {Array} With parsed results
*/
function _parseIptables(txt) {
    var result = [];
    var lines = txt.split('\n');
    var fields = lines[1].split(/\s{1}\s*/);
    fields = _.filter(fields, function (field) { return field.length > 0; });
    for (var i = 2; i < lines.length; i++) {
        if (lines[i].length === 0) continue;
        var out = {};
        var fds = lines[i].split(/\s{1}\s*/);
        for (var j = 0; j < fields.length; j++) out[fields[j]] = fds[j];
        out.remainder = fds.slice(fields.length).join(' ');
        result.push(out);
    }
    return result;
}

module.exports = function (cfg) {
    return new TcpRouter(cfg);
};

/*
exports.TcpRouter = TcpRouter;
exports._run = _run;
exports._parseIptables = _parseIptables;*/
