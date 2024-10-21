// -------------------------
// Dependencies
// -------------------------
const net = require('net');
const _ = require("lodash");
const Q = require("q");

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
    if (msg && !_.isString(msg)) { cause = msg;
        msg = code = undefined; }
    if (code && !_.isString(code)) { cause = code;
        code = undefined; }
    let err = new Error(msg);
    err.code = code;
    err.cause = cause;
    err.stack = cause && cause.stack ? err.stack + "\n" + cause.stack : err.stack;
    return err;
}

// -------------------------
// Constants
// -------------------------
const ADDR_SEPARATOR = '-';
const PORT_SEPARATOR = ':';

/*
 * TCP Gateway. 
 * 
 * Forwards inbound connections. Every connection should contain a 
 * preamble where the real destination should be specified.
 * 
 */
class TcpGateway {

    /**
     * Initializes a new TcpGateway.
     *
     * @param {Object} opts - Configuration options.
     * @param {string} opts.addr - The gateway binding address
     * @param {number} opts.port - The gateway binding port
     */
    constructor(opts) {
        this.log = opts.log || ((msg) => console.log(`[TcpGateway] ${msg}`));
        this.error = opts.error || error;
        this.log('TcpGateway(' + JSON.stringify(opts) + ')');
        this.cfg = _.clone(opts);
    }


    /**
     * Start gateway.
     * 
     * @param {Function} [cb] - The operation callback
     */
    async start(cb) {
        this.log("start()");

        // 1. Create server
        //
        var deferred = Q.defer();
        this._server = net.createServer()
            .on('connection', (client) => {
                this.log('event <connection> -> addr:' + client.remoteAddress + ', port:' + client.remotePort);
                this._addConnection(client, (err) => {
                    if (err) client.destroy();
                });
            })
            .on('close', () => {
                this.log('event <close>');
            })
            .on('error', (err) => {
                this.log('event <error> -> ', err);
                deferred.reject(this.error(err));
            })
            .on('listening', () => {
                this.log('listening to ' + JSON.stringify(this._server.address()));
                deferred.resolve(true);
            })
            .listen(this.cfg.port, this.cfg.addr);

        return deferred.promise
            .then((res) => {
                this._started = true;
                this._connections = {};
            }).nodeify(cb);
    }

    /**
     * Stop gateway.
     * 
     * @param {Function} [cb] - The operation callback
     */
    async stop(cb) {
        this.log("stop()");

        if (!this._started) throw new Error('Unable to stop gateway: it is not running');

        // 1. Close server
        //
        var deferred = Q.defer();
        this._server.close((err) => {
            if (err) deferred.reject(this.error(err));
            else deferred.resolve(true);
        });

        return deferred.promise
            .then((res) => {

                // 2. Close all connections
                //
                var deferreds = [];
                _.each(this._connections, (con, locator) => {
                    var deferred = Q.defer();
                    deferreds.push(deferred);
                    this._removeConnection(locator, (err) => {
                        if (err) deferred.reject(this.error(err));
                        else deferred.resolve(true);
                    });

                });
                return Q.waitAll(_.map(deferreds, (deferred) => { return deferred.promise; }));

            })
            .then((res) => {
                this._started = false;
                this._connections = [];
            }).nodeify(cb);

    }

    /**
     * Add a new connection.
     *
     * @param {net.Socket} src - The new connection
     * @param {Function} cb - The operation callback
     */
    _addConnection(src, cb) {
        this.log('START _addConnection(' + src.remoteAddress + PORT_SEPARATOR + src.remotePort + ')');

        // 1. Allocate slot for connection
        //
        var locator = src.remoteAddress + PORT_SEPARATOR + src.remotePort;
        this._connections[locator] = { src: src };

        // 2. Register basic listeners on incoming connection
        //
        src.on('close', () => {
                this.log('- event connection ' + locator + ' src->close');
                this._removeConnection(locator);
            })
            .on('drain', () => {
                this.log('- event connection ' + locator + ' src->drain');
            })
            .on('error', (err) => {
                this.log('- event connection ' + locator + ' src->error', err);
                this._removeConnection(locator);
            })
            .on('timeout', () => {
                this.log('- event connection ' + locator + ' src->timeout');
            });

        // 3. Connect
        //  - read header
        //  - check destination is permitted
        //  - try connection: if error notify error
        //
        var header;
        var deferred = Q.defer();

        // - Read header
        this._read(src, (err, str) => {
            if (err) deferred.reject(this.error(err));
            else {
                header = str.split(ADDR_SEPARATOR);

                this.log('- header found: ' + str);

                this._connections[locator].dstAddr = header[0].split(PORT_SEPARATOR)[0];
                this._connections[locator].dstPort = header[0].split(PORT_SEPARATOR)[1];
                this._connections[locator].srcAddr = header[header.length - 1].split(PORT_SEPARATOR)[0];
                this._connections[locator].srcPort = header[header.length - 1].split(PORT_SEPARATOR)[1].split('(')[0];

                // - Try connection
                this._connect(locator, header, (err) => {
                    if (err) deferred.reject(this.error(err));
                    else deferred.resolve(true);
                });

            }

        });

        deferred.promise
            .then((res) => {
                this.log('END _addConnection(' + src.remoteAddress + PORT_SEPARATOR + src.remotePort + ') SUCCESS');

                // - notify metrics
                //this._metrics('newconnection', locator, Number(header[header.length-1].split(PORT_SEPARATOR)[1].split('(')[1].slice(0,-1)));

                if (cb) cb();
            })
            .fail((err) => {
                this.log('END _addConnection(' + src.remoteAddress + PORT_SEPARATOR + src.remotePort + ') ERROR', err);
                if (cb) cb(err);
            });
    }

    /**
     * Attempts a connection against the final destination.
     *
     * @param {string} locator - The connection locator
     * @param {Array.<string>} header - The connection header
     * @param {Function} cb - The operation callback
     */
    _connect(locator, header, cb) {

        this.log('START _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ')');

        // - calculate ephemeral port
        //
        var port = Math.floor(32768 + (61000 - 32768) * Math.random());
        this._connections[locator].port = port;

        // - obtain info from slot
        //
        var dstAddr = this._connections[locator].dstAddr;
        var dstPort = this._connections[locator].dstPort;

        var srcAddr = this._connections[locator].srcAddr;
        var srcPort = this._connections[locator].srcPort;

        this.log('- connecting to ' + dstAddr + PORT_SEPARATOR + dstPort + ' from local port ' + port + ' ...');
        var dst = net.createConnection({ port: dstPort, host: dstAddr, localPort: port });
        var src = this._connections[locator].src;

        dst.on('connect', () => {
                this.log('- event connection ' + locator + ' dst->connect');

                // Refresh slot info
                //
                this._connections[locator].dst = dst;

                // Manage connection
                //
                var deferred = Q.defer();

                // - last hop if header == [final-dst, src]
                if (header.length === 2) {

                    // - if last hop then send to origin connection state (and time)
                    //   
                    this._write(src, 'OK(' + Date.now() + ')', (err) => {
                        if (err) deferred.reject(this.error(err));
                        else deferred.resolve(true);
                    });

                } else {

                    // - if not destination router then send header
                    //
                    header.shift(); // remove next hop
                    this._write(dst, header.join(ADDR_SEPARATOR), (err) => {
                        if (err) deferred.reject(this.error(err));
                        else deferred.resolve(true);
                    });

                }

                deferred.promise
                    .then((res) => {

                        // Enable duplex piping
                        //
                        src.on('data', (data) => {
                                //this._metrics('srcdata', locator, data.length);
                                dst.write(data);
                            })
                            .on('end', () => {
                                this.log('- event connection ' + locator + ' src->end');
                                //this._metrics('srcend', locator);
                                dst.end();
                            });

                        dst.on('data', (data) => {
                                //this._metrics('dstdata', locator, data.length);
                                src.write(data);
                            })
                            .on('end', () => {
                                this.log('- event connection ' + locator + ' dst->end');
                                //this._metrics('dstend', locator);
                                src.end();
                            });

                        return Q();
                    })
                    .then((res) => {
                        this.log('END _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ') SUCCESS');

                        // Notify success: the connection has been established
                        //
                        if (cb) cb();

                    })
                    .fail((err) => {
                        this.log('END _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ') ERROR', err);

                        // Notify error: the connection has not been established
                        //
                        if (cb) cb(this.error(err));

                    });


            })
            .on('close', () => {
                this.log('- event connection ' + locator + ' dst->close');
                this._removeConnection(locator);
            })
            .on('drain', () => {
                this.log('- event connection ' + locator + ' dst->drain');
            })
            .on('error', (err) => {
                this.log('- event connection ' + locator + ' dst->error', err);

                if (header.length === 2) {

                    // If acting as destination router then send connection state (and time)
                    //
                    var deferred = Q.defer();
                    this._write(src, 'KO(' + Date.now() + ')', (err) => {
                        if (err) deferred.reject(this.error(err));
                        else deferred.resolve(true);
                    });

                    deferred.promise
                        .then((res) => {
                            this.log('- sent ack to source.');
                        })
                        .fail((err) => {
                            this.log('- unable to send nack to source', err);
                        })
                        .finally((res) => {
                            this.log('END _connect(' + locator + ',' + header.join(ADDR_SEPARATOR) + ') ERROR');
                            this._removeConnection(locator);
                            if (cb) cb(this.error('Unable to connect to destination: connection refused', err));
                        });

                } else {

                    this._removeConnection(locator);
                    if (cb) cb(this.error(err));

                }

            })
            .on('timeout', () => {
                this.log('- event connection ' + locator + ' dst->timeout');
            });

    }

    /**
     * Remove a connection.
     *
     * @param {string} locator - The connection locator
     * @param {Function} cb - The operation callback
     */
    _removeConnection(locator, cb) {

        this.log('START _removeConnection(' + locator + ')');

        if (this._connections[locator] && !this._connections[locator].removing) {

            //this._metrics('deleteconnection', locator);

            this._connections[locator].removing = true;

            this.log('END _removeConnection(' + locator + ') SUCCESS');
            if (this._connections[locator].src) this._connections[locator].src.destroy();
            if (this._connections[locator].dst) this._connections[locator].dst.destroy();
            delete this._connections[locator];
            if (cb) cb();

        }
    }


    /**
     * Reads a string from the specified input stream.
     *
     * @param {stream.Readable} src - The input stream
     * @param {Function} cb - The operation callback. It returns the requested string
     */
    _read(src, cb) {

        this.log('_read()');

        // - Read header
        this._readBytes(src, 4, (err, buff) => {
            if (err) {
                if (cb) cb(this.error(err));
                return;
            }
            var strSize = buff.readUInt32LE(0);

            this._readBytes(src, strSize, (err, buff) => {
                if (err) {
                    if (cb) cb(this.error(err));
                    return;
                }

                var str = buff.toString();

                if (cb) cb(null, str);

            });
        });
    }

    /**
     * Read the specified number of bytes from the specified input stream.
     *
     * @param {number} num - The number of bytes to read
     * @param {Function} cb - The operation callback. It returns the requested bytes
     */
    _readBytes(src, num, cb) {
        var buff = src.read(num);
        if (buff) {
            cb(null, buff);
        } else setTimeout(this._readBytes.bind(this), 0, src, num, cb);
    }

    /**
     * Writes a string to an output stream.
     *
     * @param {stream.Writable} dst - A writable stream
     * @param {string} str - The string to write
     * @param {Function} cb - The operation callback
     */
    _write(dst, str, cb) {
        var buff = new Buffer(str);
        var num = new Buffer(4);
        num.writeUInt32LE(buff.length);
        dst.write(Buffer.concat([num, buff]), cb);
    }


}


module.exports = (opts) => {
    return new TcpGateway(opts);
}