/**
 * Utilities related with SSH.
 *
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
var util = require('util');
var fs = require('fs');

// External dependencies
var Q = require('./q');
var _ = require('lodash');

var name = process.env.INSTANCE_NAME? process.env.INSTANCE_NAME: (process.env.INSTANCE_ID? process.env.INSTANCE_ID: null);
var _log = require('./log').logger('utils.ssh' + (name? '<' + name + '>': ''), {enabled: true, print: true});
var _run = require('./cmd').run;
var _s4 = require('./uuid').s4;
var error = require('./error');

/**
 * Globals:
 * - privateKeyFile: the default private key file name
 * - publicKeyFile: the default public key file name
 */
var publicKeyFile = 'id_rsa.pub';
var privateKeyFile = 'id_rsa';

/**
 * Execute an SSH command against the specified machine.
 * To make it work, ssh keys authentication must be configured:
 * 1.- ssh-keygen generates a pair id_rsa, id_rsa.pub
 * 2.- id_rsa.pub must be copied to /root/.ssh/authorized_keys
 * 3.- id_rsa must be used to create the ssh2 connection
 *
 * @param {string} addr - The machine address
 * @param {number} port - The machine port
 * @param {Object} cred - The credentials
 * @param {number} [cred.user] - The SSH user
 * @param {number} [cred.password] - The SSH password
 * @param {number} [cred.key] - The SSH key
 * @param {string} [cred.keyFile] - The SSH key file
 * @param  {string|Array.<string>} cmd - The command to execute
 * @param  {OperationCallback} [cb] - The operation callback
 * @private
 */
function ssh(addr, port, cred, cmd, cb) {

    _log('START ssh(' + addr + ':' + port + ',' + JSON.stringify(cmd) + ')');

    if (!addr) throw error('Unable to execute SSH command: address not specified');
    if (!port) throw error('Unable to execute SSH command: port not specified');
    if (!cred) throw error('Unable to execute SSH command: credentials not specified');
    if (!cred.user) throw error('Unable to execute SSH command: user not specified');
    if (!cmd) throw error('Unable to execute SSH command: command not specified');

    var cmds;
    if (!util.isArray(cmd)) cmds = [cmd];
    else cmds = cmd;

    var deferred = Q.defer();
    var tmpKeyFile, promise;
    if (cred.key) {
        tmpKeyFile = _s4();
        fs.writeFile(tmpKeyFile, cred.key,  { mode: 384 }, function(err) {
            if (err) deferred.reject(error(err));
            else {
                promise = Q(true);
                cmds.forEach(function(cmd) {
                    promise = promise.then(function(res) {
                        var deferred = Q.defer();
                        _run('ssh -p ' + port + ' -i ' + tmpKeyFile + ' -o "StrictHostKeyChecking no" -o "PasswordAuthentication no" ' + cred.user + '@' + addr +  ' \'' + cmd + '\'', function(err, res) {
                            if (err) deferred.reject(error(err));
                            else deferred.resolve(res);
                        });
                        return deferred.promise;
                    });
                });
                promise
                .then(function(res) {
                    deferred.resolve(res);
                })
                .fail(function(err) {
                    deferred.reject(error(err));
                })
                .finally(function(res) {
                    fs.unlink(tmpKeyFile);
                });
            }
        });
    } else if (cred.password) {
        promise = Q(true);
        cmds.forEach(function(cmd) {
            promise = promise.then(function(res) {
                var deferred = Q.defer();
                _run('sshpass -p \'' + cred.password + '\' ssh -p ' + port + ' -o "StrictHostKeyChecking no" -o "PasswordAuthentication yes" ' + cred.user + '@' + addr +  ' \'' + cmd + '\'', function(err, res) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(res);
                });
                return deferred.promise;
            });
        });
        promise
        .then(function(res) {
            deferred.resolve(res);
        })
        .fail(function(err) {
            deferred.reject(error(err));
        });
    } else {
        promise = Q(true);
        cmds.forEach(function(cmd) {
            promise = promise.then(function(res) {
                var deferred = Q.defer();
                _run('ssh -p ' + port + ' -i ' + (cred.keyFile? cred.keyFile: privateKeyFile) + ' -o "StrictHostKeyChecking no" -o "PasswordAuthentication no" ' + cred.user + '@' + addr +  ' \'' + cmd + '\'', function(err, res) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(res);
                });
                return deferred.promise;
            });
        });
        promise
        .then(function(res) {
            deferred.resolve(res);
        })
        .fail(function(err) {
            deferred.reject(error(err));
        });
    }

    deferred.promise
    .then(function(res) {
        _log('END ssh(' + addr + ':' + port + ',' + JSON.stringify(cmd) + ') SUCCESS');
        if (cb) cb(null, res);
    })
    .fail(function(err) {
        _log.error('END ssh(' + addr + ':' + port + ',' + JSON.stringify(cmd) + ') ERROR', err);
        if (cb) cb(error(err));
    });

}

/**
 * Copies the specified file/s to the specified machine using SSH
 *
 * @param {Object} {string} addr - The machine address
 * @param {number} port - The machine port
 * @param {Object} cred - The credentials
 * @param {string} src - The source
 * @param {string} dst - The destination
 * @param {OperationCallback} [cb] - The operation callback
 * @private
 */
function scp(addr, port, cred, src, dst, cb) {

    _log('START scp(' + addr + ':' + port + ',' + src + ',' + dst + ')');

    if (!addr) throw error('Unable to execute SCP command: address not specified');
    if (!port) throw error('Unable to execute SCP command: port not specified');
    if (!cred) throw error('Unable to execute SCP command: credentials not specified');
    if (!cred.user) throw error('Unable to execute SCP command: user not specified');
    if (!src) throw error('Unable to execute SSH command: source not specified');
    if (!dst) throw error('Unable to execute SSH command: destination not specified');

    var deferred = Q.defer();
    var tmpKeyFile, promise;
    if (cred.key) {
        tmpKeyFile = _s4();
        fs.writeFile(tmpKeyFile, function(err) {
            if (err) deferred.reject(error(err));
            else {
                _run('scp -r -P ' + port + ' -i ' + tmpKeyFile + ' -o "StrictHostKeyChecking no" -o "PasswordAuthentication no" ' + src + ' ' + cred.user + '@' + addr +  ':' + dst, function(err, res) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(res);

                    fs.unlink(tmpKeyFile);
                });
            }
        });
    } else if (cred.password) {
        _run('sshpass -p \'' + cred.password + '\' scp -r -P ' + port + ' -o "StrictHostKeyChecking no" -o "PasswordAuthentication yes" ' + src + ' ' + cred.user + '@' + addr + ':' + dst, function(err, res) {
            if (err) deferred.reject(error(err));
            else deferred.resolve(res);
        });
    } else {
        _run('scp -r -P ' + port + ' -i ' + privateKeyFile + ' -o "StrictHostKeyChecking no" -o "PasswordAuthentication no" ' + src + ' ' + cred.user + '@' + addr +  ':' + dst, function(err, res) {
            if (err) deferred.reject(error(err));
            else deferred.resolve(res);
        });
    }

    deferred.promise
    .then(function(res) {
        _log('END scp(' + addr + ':' + port + ',' + src + ',' + dst + ') SUCCESS');
        if (cb) cb(null, res);
    })
    .fail(function(err) {
        _log.error('END scp(' + addr + ':' + port + ',' + src + ',' + dst + ') ERROR', err);
        if (cb) cb(error(err));
    });
}

/**
 * Generate keys.
 *
 * If keys are specified then they are written to disk. Otherwise they are generated
 * and written to disk.
 *
 * @param {Object} cfg - Configuration
 * @param {string} [cfg.privateKey] - The private key
 * @param {string} [cfg.publicKey] - The public key
 * @param {string} [cfg.privateKeyFile] - The file where the private key must be stored
 * @param {string} [cfg.publicKeyFile] - The file where the public key must be stored
 * @param {Function} [cb] - The operation callback
 */
function keys(cfg, cb) {

    _log('START keys(' + JSON.stringify(cfg) + ')');

    if (cfg && util.isFunction(cfg)) {
        cb = cfg;
        cfg = {};
    }

    if (cfg) {
        if (cfg.privateKey && !cfg.publicKey) throw error('Unable to generate keys: keypair wrongly specified');
        if (!cfg.privateKey && cfg.publicKey) throw error('Unable to generate keys: keypair wrongly specified');
    } else {
        cfg = {};
    }

    cfg.privateKeyFile = cfg.privateKeyFile? cfg.privateKeyFile: privateKeyFile;
    cfg.publicKeyFile = cfg.publicKeyFile? cfg.publicKeyFile: publicKeyFile;

    var deferred = Q.defer();
    if (cfg.privateKey) {
        var deferredPriv = Q.defer();
        var deferredPub = Q.defer();
        fs.writeFile(cfg.privateKeyFile, cfg.privateKey, function(err) {
            if (err) deferredPriv.reject(error(err));
            else deferredPriv.resolve(true);
        });
        fs.writeFile(cfg.publicKeyFile, cfg.publicKey, function(err) {
            if (err) deferredPub.reject(error(err));
            else deferredPub.resolve(true);
        });
        Q.waitAll([deferredPriv.promise, deferredPub.promise])
        .then(function(res) {
            deferred.resolve(true);
        })
        .fail(function(err) {
            deferred.reject(error(err));
        });
    } else {
        fs.access(cfg.privateKeyFile, fs.F_OK, function(err) {
            if (err) {
                _run('ssh-keygen -t rsa -f ' + cfg.privateKeyFile + ' -N \'\'', function(err, res) {
                    if (err) deferred.reject(error(err));
                    else {
                        var deferredPriv = Q.defer();
                        var deferredPub = Q.defer();
                        fs.readFile(cfg.privateKeyFile, function(err, data) {
                            if (err) deferredPriv.reject(error(err));
                            else {
                                cfg.privateKey = data;
                                deferredPriv.resolve(true);
                            }
                        });
                        fs.readFile(cfg.publicKeyFile, function(err, data) {
                            if (err) deferredPub.reject(error(err));
                            else {
                                cfg.publicKey = data;
                                deferredPub.resolve(true);
                            }
                        });
                        Q.waitAll([deferredPriv.promise, deferredPub.promise])
                        .then(function(res) {
                            deferred.resolve(true);
                        })
                        .fail(function(err) {
                            deferred.reject(error(err));
                        });
                    }
                });
            } else {
                var deferredPriv = Q.defer();
                var deferredPub = Q.defer();
                fs.readFile(cfg.privateKeyFile, function(err, data) {
                    if (err) deferredPriv.reject(error(err));
                    else {
                        cfg.privateKey = data;
                        deferredPriv.resolve(true);
                    }
                });
                fs.readFile(cfg.publicKeyFile, function(err, data) {
                    if (err) deferredPub.reject(error(err));
                    else {
                        cfg.publicKey = data;
                        deferredPub.resolve(true);
                    }
                });
                Q.waitAll([deferredPriv.promise, deferredPub.promise])
                .then(function(res) {
                    deferred.resolve(true);
                })
                .fail(function(err) {
                    deferred.reject(error(err));
                });
            }
        });
    }

    deferred.promise
    .then(function(res) {
        _log('END keys(' + JSON.stringify(cfg) + ') SUCCESS');
        if (cb) cb();
    })
    .fail(function(err) {
        _log.error('END keys(' + JSON.stringify(cfg) + ') ERROR', err);
        if (cb) cb(error(err));
    });

}

exports.ssh = ssh;
exports.scp = scp;
exports.keys = keys;
