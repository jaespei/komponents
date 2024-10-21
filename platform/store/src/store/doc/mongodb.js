/**
 * This module implements a MongoDB based NoSQL store used in several components.
 *
 * The store implements a simple objects datastore. It contains several collections of objects.
 *
 * @author Javier Esparza Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
var util = require('util');
var fs = require('fs');

// External dependencies
var Q = require('utils').q;
var MongoClient = require('mongodb').MongoClient;
var _ = require('lodash');
var stringify = require('json-stable-stringify');

var name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
var _log = require('utils').logger('store.mongodb' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
var error = require('utils').error;

// Global variables
//
var LOCK_MAXAGE = 300000; // 5 mins
var LOCK_TIMEOUT = 1000; // 1 sec
var LOCK_MAXTRIALS = 5;

/**
 * Error generated when any store related operation fails.
 *
 * @constructor
 * @param {string} message - The error message
 */
function StoreError(message) {
    this.message = message;
    Error.captureStackTrace(this, StoreError);
}
util.inherits(StoreError, Error);
StoreError.prototype.name = 'StoreError';


function _prepareStr(val, op, att) {
    _log('prepareStr(' + val + ',' + op + ',' + att + ')');
    if (!op) {
        val = _toStr(val);
        return val;
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $in: _.map(val, function (_val) { return _toStr(_val); }) };
        return tmp;
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'nin\' operator requires array');
        var tmp = {};
        tmp[att] = { $nin: _.map(val, function (_val) { return _toStr(_val); }) };
        return tmp;
    } else if (op === 'eq') {
        val = _toStr(val);
        if (val.indexOf('*') !== -1) {
            val = new RegExp('^' + val.replace(/\*/g, '.*') + '$');
        }
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toStr(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else {
        val = _toStr(val);
        var mappings = { 'gt': '$gt', 'gte': '$gte', 'lt': '$lt', 'lte': '$lte' };
        if (!(op in mappings)) throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
        var tmp = {};
        tmp[att] = {};
        tmp[att][mappings[op]] = val;
        return tmp;
    }
}

function _toStr(obj) {
    return util.isNullOrUndefined(obj) ? null : util.isString(obj) ? obj : String(obj);
}

function _fromStr(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? obj : String(obj));
}

function _prepareInt(val, op, att) {
    if (!op) {
        val = _toInt(val);
        return val;
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $in: _.map(val, function (_val) { return _toInt(_val); }) };
        return tmp;
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $nin: _.map(val, function (_val) { return _toInt(_val); }) };
        return tmp;
    } else if (op === 'eq') {
        val = _toInt(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toInt(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else {
        val = _toInt(val);
        var mappings = { 'gt': '$gt', 'gte': '$gte', 'lt': '$lt', 'lte': '$lte' };
        if (!(op in mappings)) throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
        var tmp = {};
        tmp[att] = {};
        tmp[att][mappings[op]] = val;
        return tmp;
    }
}

function _toInt(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isNumber(obj) ? Math.floor(obj) : Math.floor(Number(obj)));
}

function _fromInt(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isNumber(obj) ? Math.floor(obj) : Math.floor(Number(obj)));
}

function _prepareFloat(val, op, att) {
    if (!op) {
        val = _toFloat(val);
        return val;
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $in: _.map(val, function (_val) { return _toFloat(_val); }) };
        return tmp;
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $nin: _.map(val, function (_val) { return _toFloat(_val); }) };
        return tmp;
    } else if (op === 'eq') {
        val = _toFloat(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toFloat(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else {
        val = _toFloat(val);
        var mappings = { 'gt': '$gt', 'gte': '$gte', 'lt': '$lt', 'lte': '$lte' };
        if (!(op in mappings)) throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
        var tmp = {};
        tmp[att] = {};
        tmp[att][mappings[op]] = val;
        return tmp;
    }
}

function _toFloat(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isNumber(obj) ? obj : Number(obj));
}

function _fromFloat(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isNumber(obj) ? obj : Number(obj));
}

function _prepareBool(val, op, att) {
    if (!op) {
        val = _toBool(val);
        return val;
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $in: _.map(val, function (_val) { return _toBool(_val); }) };
        return tmp;
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $nin: _.map(val, function (_val) { return _toBool(_val); }) };
        return tmp;
    } else if (op === 'eq') {
        val = _toBool(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toBool(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toBool(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isBoolean(obj) ? obj : Boolean(obj));
}

function _fromBool(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isBoolean(obj) ? obj : Boolean(obj));
}

function _prepareDict(val, op, att) {
    if (!op) {
        val = _toDict(val);
        return val;
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $in: _.map(val, function (_val) { return _toDict(_val); }) };
        return tmp;
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        var tmp = {};
        tmp[att] = { $nin: _.map(val, function (_val) { return _toDict(_val); }) };
        return tmp;
    } else if (op === 'eq') {
        val = _toDict(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toDict(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toDict(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _fromDict(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _prepareStrArray(val, op, att) {
    if (!op) {
        val = _toStrArray(val);
        return val;
    } else if (op === 'contains') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toStr(val);
        } else {
            tmp[att] = { $all: _.map(val, function (_val) { return _toStr(_val); }) };
        }
        return tmp;
    } else if (op === 'ncontains') {
        var tmp = {};
        val = util.isArray(val) ? val : [val];
        tmp[att] = { $not: { $all: _.map(val, function (_val) { return _toStr(_val); }) } };
        return tmp;
    } else if (op === 'containsany') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toStr(val);
        } else {
            tmp[att] = { $elemMatch: { $in: _.map(val, function (_val) { return _toStr(_val); }) } };
        }
        return tmp;
    } else if (op === 'eq') {
        val = _toStrArray(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toStrArray(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toStrArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toStr(_val); });
}

function _fromStrArray(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _prepareIntArray(val, op, att) {
    if (!op) {
        val = _toIntArray(val);
        return val;
    } else if (op === 'contains') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toInt(val);
        } else {
            tmp[att] = { $all: _.map(val, function (_val) { return _toInt(_val); }) };
        }
        return tmp;
    } else if (op === 'ncontains') {
        var tmp = {};
        val = util.isArray(val) ? val : [val];
        tmp[att] = { $not: { $all: _.map(val, function (_val) { return _toInt(_val); }) } };
        return tmp;
    } else if (op === 'containsany') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toInt(val);
        } else {
            tmp[att] = { $elemMatch: { $in: _.map(val, function (_val) { return _toInt(_val); }) } };
        }
        return tmp;
    } else if (op === 'eq') {
        val = _toIntArray(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toIntArray(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toIntArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toInt(_val); });
}

function _fromIntArray(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _prepareFloatArray(val, op, att) {
    if (!op) {
        val = _toFloatArray(val);
        return val;
    } else if (op === 'contains') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toFloat(val);
        } else {
            tmp[att] = { $all: _.map(val, function (_val) { return _toFloat(_val); }) };
        }
        return tmp;
    } else if (op === 'ncontains') {
        var tmp = {};
        val = util.isArray(val) ? val : [val];
        tmp[att] = { $not: { $all: _.map(val, function (_val) { return _toFloat(_val); }) } };
        return tmp;
    } else if (op === 'containsany') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toFloat(val);
        } else {
            tmp[att] = { $elemMatch: { $in: _.map(val, function (_val) { return _toFloat(_val); }) } };
        }
        return tmp;
    } else if (op === 'eq') {
        val = _toFloatArray(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toFloatArray(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toFloatArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toFloat(_val); });
}

function _fromFloatArray(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _prepareBoolArray(val, op, att) {
    if (!op) {
        val = _toBoolArray(val);
        return val;
    } else if (op === 'contains') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toBool(val);
        } else {
            tmp[att] = { $all: _.map(val, function (_val) { return _toBool(_val); }) };
        }
        return tmp;
    } else if (op === 'ncontains') {
        var tmp = {};
        val = util.isArray(val) ? val : [val];
        tmp[att] = { $not: { $all: _.map(val, function (_val) { return _toBool(_val); }) } };
        return tmp;
    } else if (op === 'containsany') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = _toBool(val);
        } else {
            tmp[att] = { $elemMatch: { $in: _.map(val, function (_val) { return _toBool(_val); }) } };
        }
        return tmp;
    } else if (op === 'eq') {
        val = _toBoolArray(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toBoolArray(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toBoolArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toBool(_val); });
}

function _fromBoolArray(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _prepareDictArray(val, op, att) {
    if (!op) {
        val = _toDictArray(val);
        return val;
    } else if (op === 'contains') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = { $elemMatch: _toDict(val) };
        } else {
            tmp[att] = { $all: _.map(val, function (_val) { return { $elemMatch: _toDict(_val) }; }) };
        }
        return tmp;
    } else if (op === 'ncontains') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = { $not: { $elemMatch: _toDict(val) } };
        } else {
            tmp[att] = { $not: { $all: _.map(val, function (_val) { return { $elemMatch: _toDict(_val) }; }) } };
        }
        return tmp;
    } else if (op === 'containsany') {
        var tmp = {};
        if (!util.isArray(val)) {
            tmp[att] = { $elemMatch: _toDict(val) };
        } else {
            tmp.$or = _.map(val, function (_val) {
                var _or = {};
                _or[att] = { $elemMatch: _toDict(_val) };
                return _or;
            });
        }
        return tmp;
    } else if (op === 'eq') {
        val = _toDictArray(val);
        var tmp = {};
        tmp[att] = val;
        return tmp;
    } else if (op === 'neq') {
        val = _toDictArray(val);
        var tmp = {};
        tmp[att] = { $ne: val };
        return tmp;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toDictArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toDict(_val); });
}

function _fromDictArray(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}


function _toJSON(obj) {
    _log('toJSON()', obj);
    return stringify(obj);
}

function _fromJSON(s) {
    _log('fromJSON()', s);
    return JSON.parse(s);
}

var _mappers = {
    str: {
        to: _toStr,
        from: _fromStr,
        prepare: _prepareStr
    },
    int: {
        to: _toInt,
        from: _fromInt,
        prepare: _prepareInt
    },
    float: {
        to: _toFloat,
        from: _fromFloat,
        prepare: _prepareFloat
    },
    bool: {
        to: _toBool,
        from: _fromBool,
        prepare: _prepareBool
    },
    dict: {
        to: _toDict,
        from: _fromDict,
        prepare: _prepareDict
    },
    'str[]': {
        to: _toStrArray,
        from: _fromStrArray,
        prepare: _prepareStrArray
    },
    'int[]': {
        to: _toIntArray,
        from: _fromIntArray,
        prepare: _prepareIntArray
    },
    'float[]': {
        to: _toFloatArray,
        from: _fromFloatArray,
        prepare: _prepareFloatArray
    },
    'bool[]': {
        to: _toBoolArray,
        from: _fromBoolArray,
        prepare: _prepareBoolArray
    },
    'dict[]': {
        to: _toDictArray,
        from: _fromDictArray,
        prepare: _prepareDictArray
    }
};


/**
 * Creates a new store.
 *
 * @constructor
 * @classdesc Store backed by SQLite engine
 * @param {Object} [cfg] - Store configuration
 * @param {string} cfg.url - The store location
 * @param {Object} cfg.schema - The store schema
 * @param {string} [cfg.schema.version] - The schema version
 * @param {Object} cfg.schema.collections - Dictionary containing all collections in the store {<col-name>: <col-spec>}
 *
 */
function Store(cfg) {

    _log('Store()', cfg);

    var self = this;

    cfg = cfg || {};

    self._cfg = {};
    for (var attName in cfg) self._cfg[attName] = cfg[attName];

}


/**
 * Initialize the specified store. 
 * If the store does not exist then it is created with the specified configuration.
 * If the store already exists then its configuration is loaded.
 *
 * @param {Function} [cb] - The operation callback
 */
Store.prototype.init = async function (cb) {
    _log(`init()`);

    var self = this;

    if (!self._cfg.url) throw error('Unable to initialize store: URL not specified');

    // 1. Connect to database
    //
    var deferred = Q.defer();
    MongoClient.connect(self._cfg.url, function (err, client) {
        if (err) deferred.reject(error(err));
        else {
            self._client = client;
            self._db = client.db();
            deferred.resolve();
        }
    });

    return deferred.promise
        .then(function (res) {

            // 2. If the database does not exist create it
            //    If the database exists, load stored configuration and check compatibility
            var deferred = Q.defer();
            self._db.collection('_cfg').find({}).toArray(function (err, cfgs) {
                if (cfgs.length === 0) {
                    // The database does not exist:
                    // - if schema not specified the database can not be created
                    // - if schema specified, create database
                    //
                    if (!self._cfg.schema) deferred.reject(error('Unable to open store: database does not exist and schema not specified'));
                    else {
                        self._create(function (err) {
                            if (err) deferred.reject(error(err));
                            else deferred.resolve(true);
                        });
                    }
                } else {
                    // The database exists, load configuration
                    //
                    var dbCfg;
                    try {
                        dbCfg = { url: cfgs[0].url, schema: _fromJSON(cfgs[0].schema) };
                    } catch (err) {
                        deferred.reject(error(err));
                        return;
                    }
                    if (self._cfg.schema && self._cfg.schema.version && self._cfg.schema.version !== dbCfg.schema.version) {
                        deferred.reject(error('Unable to open store: incompatible schema versions'));
                        return;
                    }
                    self._cfg = dbCfg;
                    deferred.resolve(true);
                }
            });
            return deferred.promise;
        })
        .then(function (res) {

            // 3. Adapt configuration
            //
            for (var colName in self._cfg.schema.collections) {
                var col = self._cfg.schema.collections[colName];
                // - create snapshot of keys
                var attNames = Object.keys(col);

                col['*'] = undefined;   // Primary key: only one
                col['+'] = [];          // Unique keys: multiple
                col['-'] = [];          // Indexed keys: multiple

                for (var i = 0; i < attNames.length; i++) {
                    var attName = attNames[i];
                    if (attName[0] == '*') {
                        col['*'] = attName.slice(1);
                        col[attName.slice(1)] = col[attName];
                        delete col[attName];
                    } else if (attName[0] == '+') {
                        col['+'].push(attName.slice(1));
                        col[attName.slice(1)] = col[attName];
                        delete col[attName];
                    } else if (attName[0] == '-') {
                        col['-'].push(attName.slice(1));
                        col[attName.slice(1)] = col[attName];
                        delete col[attName];
                    }
                }
            }
            _log('END init() SUCCESS');
            return Q();            
        })
        .fail(function (err) {
            _log.error('END init() ERROR', err);
            self._error = err;
        })
        .finally(function () {
            if (self._db) self._client.close();
            delete self._client;
            delete self._db;
        }).nodeify(cb);

}


/**
 * Creates the store.
 *
 * @param {Function} cb - The operation callback
 */
Store.prototype._create = function (cb) {

    _log('START create()');

    var self = this;

    if (!self._cfg.schema) {
        if (cb) cb(error('Unable to create store: attribute \'schema\' not specified'));
        return;
    }
    if (!self._cfg.schema.version) {
        if (cb) cb(error('Unable to create store: attribute \'version\' not specified'));
        return;
    }
    if (!self._cfg.schema.collections) {
        if (cb) cb(error('Unable to create store: attribute \'collections\' not specified'));
        return;
    }

    var deferred = Q.defer();
    self._db.collection('_cfg').insertOne({ url: self._cfg.url, schema: _toJSON(self._cfg.schema) }, function (err, _cfg) {
        if (err) deferred.reject(error(err));
        else {
            deferred.resolve(true);
        }
    });

    return deferred.promise
        .then(function (res) {
            var deferreds = [];
            _.keys(self._cfg.schema.collections).forEach(function (colName) {

                // - add extra columns
                var col = self._cfg.schema.collections[colName];
                col._lock = 'str';
                //col._lockTs = 'int';
                col._ts = 'int';

                var deferred = Q.defer();
                deferreds.push(deferred);
                self._db.createCollection(colName, function (err) {
                    if (err) deferred.reject(error(err));
                    else {
                        var _deferreds = [];
                        _.keys(col).forEach(function (attName) {
                            if (attName[0] == '*') {
                                // - primary key is mapped to _id, which is 
                                //   automatically indexed
                            } else if (attName[0] === '+' || attName[0] === '-') {
                                // - create index
                                var _deferred = Q.defer();
                                _deferreds.push(_deferred);
                                self._db.collection(colName).createIndex(attName.slice(1), function (err) {
                                    if (err) _deferred.reject(error(err));
                                    else _deferred.resolve(true);
                                });
                            }
                        });
                        Q.waitAll(_.map(_deferreds, function (_def) { return _def.promise; }))
                            .then(function (res) {
                                deferred.resolve(true);
                            })
                            .fail(function (err) {
                                deferred.reject(error(err));
                            });
                    }
                });
            });
            return Q.waitAll(_.map(deferreds, function (def) { return def.promise; }));
        })
        .then(function (res) {
            _log('END create() SUCCCESS');
        })
        .fail(function (err) {
            _log.error('END create() ERROR', err);
            self._db.dropDatabase();
        }).nodeify(cb);

};

/**
 * Open the specified store.
 *
 * @param {Function} [cb] - The operation callback
 */
Store.prototype.open = function (cb) {

    _log('START open()');

    var self = this;

    if (self._error) throw error('Unable to open store: store not initialized');
    if (self._db) throw error('Unable to open store: store already opened');

    let deferred = Q.defer();
    MongoClient.connect(self._cfg.url, function (err, client) {
        if (err) deferred.reject(error(err));
        else {
            self._client = client;
            self._db = client.db();
            deferred.resolve();
        }
    });

    return deferred.promise.nodeify(cb);

};

/**
 * Close the store.
 *
 * @param {Function} cb - The operation callback
 */
Store.prototype.close = function (cb) {

    _log('START close()');

    var self = this;

    if (!self._db) throw error('Unable to close the store: it is not open');

    self._client.close(function (err) {

        if (err) _log.error('Unable to close database');

        delete self_client;
        delete self._db;
        _log('END close() SUCCESS');
        if (cb) cb();

    });
};

/**
 * Destroy the store.
 *
 * @param {Function} cb - The operation callback
 */
Store.prototype.drop = function (cb) {

    _log('START drop()');

    var self = this;

    var deferred = Q.defer();
    if (!self._db) throw error('Unable to drop store: store closed');

    var deferred = Q.defer();
    self._db.dropDatabase(function (err) {
        if (err) deferred.reject(error(err));
        else deferred.resolve(true);
    });
    deferred.promise
        .then(function (res) {
            var deferred = Q.defer();
            self.close(function (err) {
                if (err) deferred.reject(error(err));
                else deferred.resolve(true);
            })
            return deferred.promise;
        })
        .then(function (res) {
            _log('END drop() SUCCESS');
            if (cb) cb();
        })
        .fail(function (err) {
            _log.error('END drop() ERROR', err);
            if (cb) cb(error(err));
        });
};

/**
 * Create a backup of the store.
 * 
 * @param {Function} cb - The operation callback. It returns the backup in JSON format
 */
Store.prototype.backup = function (cb) {

    _log('START backup()');

    var self = this;

    var backup = { ts: Date.now() };

    // 1. Backup schema
    //
    var deferred = Q.defer();
    self._db.collection('_cfg').find({}).toArray(function (err, cfgs) {
        if (err) deferred.reject(error(err));
        else if (cfgs.length === 0) deferred.reject(error('Unable to backup: schema not found'));
        else {
            backup.schema = JSON.parse(cfgs[0].schema);
            deferred.resolve(true);
        }
    });
    deferred.promise
        .then(function (res) {

            // 2. Backup all collections
            //
            backup.collections = {};
            var deferreds = [];
            _.keys(self._cfg.schema.collections).forEach(function (colName) {
                backup.collections[colName] = [];
                var deferred = Q.defer();
                deferreds.push(deferred);
                self.search(colName, {}, function (err, elems) {
                    if (err) deferred.reject(error(err));
                    else {
                        elems.forEach(function (elem) {
                            backup.collections[colName].push(elem);
                        });
                        deferred.resolve(true);
                    }
                });
            });
            return Q.waitAll(_.map(deferreds, function (def) { return def.promise; }));
        })
        .then(function (res) {
            _log('END backup() SUCCESS');
            if (cb) cb(null, stringify(backup));
        })
        .fail(function (err) {
            _log.error('END backup() ERROR', err);
            if (cb) cb(error(err));
        });

};

/**
 * Restore the specified bckup.
 * 
 * @param {string} backup - The backup in JSON format
 * @param {Function} cb - The operation callback
 */
Store.prototype.restore = function (backup, cb) {

    _log('START restore()', backup);

    var self = this;

    if (!backup || util.isFunction(backup)) throw error('Unable to restore store: backup not specified');
    if (!util.isString(backup)) throw error('Unable to restore store: unrecognized backup format');

    // 1. Parse from JSON
    //
    var backup = JSON.parse(backup);
    if (!backup.ts || !backup.schema || !backup.collections) throw error('Unable to restore store: unrecognized backup format');

    // 2. Restore schema
    //  - drop store
    //  - open store with new config
    var url = self._cfg.url;
    var deferred = Q.defer();
    self.drop(function (err) {
        if (err) deferred.reject(error(err));
        else deferred.resolve(true);
    })
    deferred.promise
        .then(function (res) {
            var cfg = {
                url: url,
                schema: backup.schema
            };
            var deferred = Q.defer();
            self.open(cfg, function (err) {
                if (err) deferred.reject(error(err));
                else deferred.resolve(true);
            })
            return deferred.promise;
        })
        .then(function (res) {

            // 3. Restore all collections
            // 
            var deferreds = [];
            for (var colName in backup.collections) {
                var col = backup.collections[colName];
                col.forEach(function (elem) {
                    var deferred = Q.defer();
                    deferreds.push(deferred);
                    self.insert(colName, elem, function (err) {
                        if (err) deferred.reject(error(err));
                        else deferred.resolve(true);
                    });
                });
            }
            return Q.waitAll(_.map(deferreds, function (def) { return def.promise; }));
        })
        .then(function (res) {
            _log('END restore() SUCCESS');
            if (cb) cb(null, backup);
        })
        .fail(function (err) {
            _log.error('END restore() ERROR', err);
            if (cb) cb(error(err));
        });

};


/**
 * Insert the specified object.
 *
 * @param {string} colName - The collection name
 * @param {Object} data - The object to insert
 * @param {Function} cb - The operation callback
 */
Store.prototype.insert = function (colName, data, cb) {

    _log('START insert(' + colName + ')', data);

    var self = this;

    if (!colName) throw error('Unable to insert: collection name not specified');
    if (!data) throw error('Unable to insert: data not specified');
    if (!self._db) throw error('Unable to insert: store closed');
    if (!self._cfg.schema.collections[colName]) throw error('Unable to insert: collection ' + colName + ' not found');

    var col = self._cfg.schema.collections[colName];

    // - check primary key
    if (col['*'] && util.isNullOrUndefined(data[col['*']])) throw error('Unable to insert: primary key attribute not set');

    // - convert data
    var safeData = {};
    for (var attName in data) {
        if (col[attName]) safeData[self._mapAtt(colName, attName)] = _mappers[col[attName]].to(data[attName]);
        else safeData[attName] = data[attName];
    }

    // - insert into collection
    var deferred = Q.defer();
    self._db.collection(colName).insert(safeData, function (err) {
        if (err) deferred.reject(error(err));
        else deferred.resolve(true);
    });
    deferred.promise
        .then(function (res) {
            _log('END insert(' + colName + ') SUCCESS');
            if (cb) cb();
        })
        .fail(function (err) {
            _log.error('END insert(' + colName + ') ERROR', err);
            if (cb) cb(error(err));
        });

};

/**
 * Search the specified data.
 *
 * @param {string} colName - The collection name
 * @param {Object|Array.<Object>} [query] - The query
 * @param {Object} [opts] - Query options
 * @param {string} [opts.lock] - Set a lock on query results
 * @param {string} [opts.unlock] - Unset lock on query results
 * @param {string} [opts.orderBy] - Order results by field in format '[+|-]field' (e.g. '+name')
 * @param {string} [opts.limit] - Maximum number of results
 * @param {string} [opts.offset] - Discard initial results
 * @param {string} [opts.fields] - Comma-separated list of fields (fields prefixed by '-' are hidden)
 * @param {Function} cb - The operation callback. It returns the query results
 */
Store.prototype.search = function (colName, query, opts, cb) {

    _log('START search(' + colName + ',' + JSON.stringify(query) + (util.isFunction(opts) ? '' : ',' + JSON.stringify(opts)) + ')');

    var self = this;

    if (!colName) throw error('Unable to search: collection name not specified');
    if (!query) query = {};
    if (util.isFunction(query)) {
        cb = query;
        query = {};
    }
    if (!opts) opts = {};
    if (util.isFunction(opts)) {
        cb = opts;
        opts = {};
    }
    if (!self._db) throw error('Unable to search: store closed');
    if (!self._cfg.schema.collections[colName]) throw error('Unable to search: collection ' + colName + ' not found');

    // - get collection to consult
    var col = self._cfg.schema.collections[colName];

    // - prepare fields to obtain
    var fields = {};
    if (opts.fields) {
        // - classify fields to show/hide
        var _minus = [], _plus = [];
        _.map(opts.fields.split(','), function (f) { return f.trim(); }).forEach(function (f) {
            if (f.length > 0) {
                if (f[0] === '-') _minus.push(f.slice(1));
                else if (f[0] === '+') _plus.push(f.slice(1));
                else _plus.push(f);
            }
        });

        // - initialize with fields to show
        if (_plus.length > 0) {
            _plus.forEach(function (f) { fields[f] = 1; });
        }

        // - remove fields to hide
        if (_minus.length > 0) {
            _minus.forEach(function (f) { fields[f] = 0; });
        }

        // - always add primary key
        if (col['*'] && fields[col['*']] === 0) fields[col['*']] = 1;

        _log('- fields: ' + JSON.stringify(fields) + ',_minus: ' + JSON.stringify(_minus) + ',_plus: ' + JSON.stringify(_plus));

    }

    // - prepare sort
    if (opts.orderBy) {
        if (opts.orderBy[0] !== '+' && opts.orderBy[0] !== '-') throw error('Wrong sort specification');
        if (!col[opts.orderBy.slice(1)]) throw error('Unable to sort by attribute ' + opts.orderBy.slice(1));
    }

    // 1. Process input query
    //

    // - consider OR queries
    var queries = util.isArray(query) ? query : [query];
    var safeQueries = [];
    queries.forEach(function (query, index) {

        // - process each OR
        var subqueries = [], op, att;
        for (var attName in query) {
            if (attName[0] === '$') {
                att = attName.split('_')[0].slice(1);
                op = attName.split('_')[1];
            } else {
                att = attName;
                op = 'eq';
            }
            if (col[att]) {
                subqueries.push(_mappers[col[att]].prepare(query[attName], op, self._mapAtt(colName, att)));
            } else {
                var subquery = {};
                subquery[att] = query[attName];
                subqueries.push(subquery);
            }
        }

        var safeQuery = {};
        subqueries.forEach(function (subquery) {
            _.assign(safeQuery, subquery);
        });
        safeQueries.push(safeQuery);
    });

    _log('safeQueries:' + JSON.stringify(safeQueries));

    if (safeQueries.length > 1) {
        query = { $or: safeQueries };
    } else {
        query = safeQueries[0];
    }

    /**
     * Set locks:
     * - first make query
     * - second set/unset locks on results
     * - if all locks are not set then unset locks and
     *   repeat operation
     */
    var deferred = Q.defer();
    var results, count = 0;
    var set_locks = function () {

        count++;

        // - set up cursor
        var cursor = self._db.collection(colName).find(query, fields);
        if (opts.offset) cursor = cursor.skip(opts.offset);
        if (opts.limit) cursor = cursor.limit(opts.limit);
        if (opts.orderBy) {
            var orderBy = {};
            orderBy[opts.orderBy.slice(1)] = (opts.orderBy[0] === '+' ? 1 : -1);
            cursor = cursor.sort(orderBy);
        }

        // - execute query
        _log('- executing query: ' + JSON.stringify(query));
        cursor.toArray(function (err, _results) {
            if (err) deferred.reject(error(err));
            else {
                results = _results;
                if (opts.lock) {
                    // - set locks
                    var now = Date.now();
                    var ids = results.map((obj) => obj._id);
                    var q = {
                        _id: { $in: ids },
                        $or: [
                            { _lock: null },      // no lock
                            { _lock: opts.lock }, // same lock
                            { _ts: { $lt: now - LOCK_MAXAGE } } // lock expired
                        ]
                    };
                    var update = { _lock: opts.lock, _ts: now };
                    _log('- executing update: ' + JSON.stringify(q));
                    self._db.collection(colName).updateMany(q, { $set: update }, (err, res) => {
                        _log(res);
                        if (err) deferred.reject(error(err));
                        else if (res.result.n === results.length) deferred.resolve(results);
                        else {
                            // unset locks and repeat
                            q = { _lock: opts.lock, _ts: now };
                            update = { _lock: null, _ts: null };
                            self._db.collection(colName).updateMany(q, { $set: update }, (err, res) => {
                                if (err) deferred.reject(error(err));
                                else if (count >= LOCK_MAXTRIALS) deferred.reject(error('Unable to set locks: max trials exceeded'));
                                else setTimeout(set_locks, LOCK_TIMEOUT);
                            });
                        }
                    });
                } else {
                    // - do nothing
                    deferred.resolve(results);
                }
            }
        });
        return deferred.promise;

    };

    // 2. Execute query (and optionally set/unset locks)
    //
    set_locks();

    deferred.promise
        .then((res) => {

            // 3. Unset locks
            //
            var deferred = Q.defer();
            if (opts.unlock) {
                // - unset locks
                var ids = results.map((obj) => obj._id);
                var q = { _id: { $in: ids }, _lock: opts.unlock };
                var update = { _lock: null, _ts: null };
                _log('- executing update: ' + JSON.stringify(q));
                self._db.collection(colName).updateMany(q, { $set: update }, (err, res) => {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(results);
                });
            } else deferred.resolve(true);

            return deferred.promise;

        })
        .then(function (res) {

            // 4. Map results
            //
            results = _.map(results, function (_result) {
                var result = {};
                for (var att in _result) {
                    if (att === '_lock' || att === '_ts') continue;
                    else if (col[self._unmapAtt(colName, att)])
                        result[self._unmapAtt(colName, att)] = _mappers[col[self._unmapAtt(colName, att)]].from(_result[att]);
                    else
                        result[att] = _result[att];
                }
                return result;
            });
            return Q(results);
        })
        .then(function (res) {
            _log('END search(' + colName + ',' + JSON.stringify(query) + (util.isFunction(opts) ? '' : ',' + JSON.stringify(opts)) + ')');
            if (cb) cb(null, results);
        })
        .fail(function (err) {
            _log.error('END search(' + colName + ',' + JSON.stringify(query) + (util.isFunction(opts) ? '' : ',' + JSON.stringify(opts)) + ')', err);
            if (cb) cb(error(err));
        });
};

/**
 * Update the specified object with the specified data.
 *
 * @param {string} colName - The collection name
 * @param {Object} query - The query to select the objects to update
 * @param {Object} data - The data to update
 * @param {Object} [opts] - Optional parameters
 * @param {string} [opts.lock] - Set a lock on query results
 * @param {string} [opts.unlock] - Unset lock on query results
 * @param {Function} cb - The operation callback
 */
Store.prototype.update = function (colName, query, data, opts, cb) {

    _log('START update(' + colName + ',' + JSON.stringify(query) + (util.isFunction(opts) ? '' : ',' + JSON.stringify(opts)) + ')', data);

    var self = this;

    if (!colName) throw error('Unable to update: collection name not specified');
    if (!query) throw error('Unable to update: query not specified');
    if (!data || Object.keys(data).length === 0) throw error('Unable to update: data to update not specified');

    if (opts && _.isFunction(opts)) {
        cb = opts;
        opts = {};
    }
    opts = opts ? opts : {};

    if (!self._db) throw error('Unable to update: store closed');
    if (!self._cfg.schema.collections[colName]) throw error('Unable to update: collection ' + colName + ' not found');

    var col = self._cfg.schema.collections[colName];

    // 1. Process input query
    //

    // - consider OR queries
    var queries = util.isArray(query) ? query : [query];
    var safeQueries = [];
    queries.forEach(function (query, index) {

        // - process each OR
        var subqueries = [], op, att;
        for (var attName in query) {
            if (attName[0] === '$') {
                att = attName.split('_')[0].slice(1);
                op = attName.split('_')[1];
            } else {
                att = attName;
                op = 'eq';
            }
            if (col[att]) {
                subqueries.push(_mappers[col[att]].prepare(query[attName], op, self._mapAtt(colName, att)));
            } else {
                var subquery = {};
                subquery[att] = query[attName];
                subqueries.push(subquery);
            }
        }

        var safeQuery = {};
        subqueries.forEach(function (subquery) {
            _.assign(safeQuery, subquery);
        });
        safeQueries.push(safeQuery);
    });

    if (safeQueries.length > 1) {
        query = { $or: safeQueries };
    } else {
        query = safeQueries[0];
    }

    // 2. Convert data
    //
    var safeData = {};
    for (var attName in data) {
        if (col[attName]) safeData[self._mapAtt(colName, attName)] = _mappers[col[attName]].to(data[attName]);
        else safeData[attName] = data[attName];
    }

    /**
     * Set locks:
     * - first make query
     * - second set/unset locks on results
     * - if all locks are not set then unset locks and
     *   repeat operation
     */
    var deferred = Q.defer();
    var results, count = 0;
    var set_locks = function () {

        count++;

        if (opts.lock) {
            self._db.collection(colName).find(query).toArray((err, _results) => {
                if (err) deferred.reject(error(err));
                else {
                    results = _results;
                    // - set locks
                    var now = Date.now();
                    var ids = results.map((obj) => obj._id);
                    var q = { $and: [{}, {}] };
                    q.$and[0]._id = { $in: ids };
                    q.$and[1].$or = [
                        { _lock: null },      // no lock
                        { _lock: opts.lock }, // same lock
                        { _ts: { $lt: now - LOCK_MAXAGE } } // lock expired
                    ];
                    var update = { _lock: opts.lock, _ts: now };
                    _log('- executing update: ' + JSON.stringify(q));
                    self._db.collection(colName).updateMany(q, { $set: update }, (err, res) => {
                        _log(res);
                        if (err) deferred.reject(error(err));
                        else if (res.result.n === results.length) deferred.resolve(results);
                        else {
                            // unset locks and repeat
                            q = { _lock: opts.lock, _ts: now };
                            update = { _lock: null, _ts: null };
                            self._db.collection(colName).updateMany(q, { $set: update }, (err, res) => {
                                if (err) deferred.reject(error(err));
                                else if (count >= LOCK_MAXTRIALS) deferred.reject(error('Unable to set locks: max trials exceeded'));
                                else setTimeout(set_locks, LOCK_TIMEOUT);
                            });
                        }
                    });
                }
            });
        } else {
            deferred.resolve(true);
        }
        return deferred.promise;

    };

    // 3. Set locks
    //
    set_locks();

    deferred.promise
        .then((res) => {

            // 4. Update collection
            //
            var deferred = Q.defer();
            if (opts.lock) {
                var ids = results.map((obj) => obj._id);
                var _query = { _id: { $in: ids } };
                self._db.collection(colName).updateMany(_query, { $set: safeData }, function (err, res) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(true);
                });
            } else {
                self._db.collection(colName).updateMany(query, { $set: safeData }, function (err, res) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(true);
                });
            }
            return deferred.promise;

        })
        .then((res) => {

            // 5. Unlock objects
            //
            var deferred = Q.defer();
            if (opts.unlock) {
                if (opts.lock) {
                    var ids = results.map((obj) => obj._id);
                    var _query = { _id: { $in: ids }, _lock: opts.unlock };
                    var update = { _lock: null, _ts: null };
                    self._db.collection(colName).updateMany(_query, update, function (err, res) {
                        if (err) deferred.reject(error(err));
                        else deferred.resolve(true);
                    });
                } else {

                    if (query.$or) {
                        query.$or.forEach((subquery) => {
                            subquery._lock = opts.unlock;
                        })
                    } else {
                        query._lock = opts.unlock;
                    }
                    var update = { _lock: null, _ts: null };
                    self._db.collection(colName).updateMany(query, { $set: update }, function (err, res) {
                        if (err) deferred.reject(error(err));
                        else deferred.resolve(true);
                    });
                }
            } else deferred.resolve(true);

            return deferred.promise;

        })
        .then(function (res) {
            _log('END update(' + colName + ',' + JSON.stringify(query) + (util.isFunction(opts) ? '' : ',' + JSON.stringify(opts)) + ') SUCCESS');
            if (cb) cb();
        })
        .fail(function (err) {
            _log.error('END update(' + colName + ',' + JSON.stringify(query) + (util.isFunction(opts) ? '' : ',' + JSON.stringify(opts)) + ') ERROR', err);
            if (cb) cb(error(err));
        });

};

/**
 * Delete the specified object from the datastore.
 *
 * @param {string} colName - The collection name
 * @param {string} query - The query to select the objects to delete
 * @param {Function} cb - The operation callback
 */
Store.prototype.delete = function (colName, query, cb) {

    _log('START delete(' + colName + ',' + JSON.stringify(query) + ')');

    var self = this;

    if (!colName) throw error('Unable to delete: collection name not specified');
    if (!query) query = {};
    if (util.isFunction(query)) {
        cb = query;
        query = {};
    }
    if (!self._db) throw error('Unable to delete: store closed');
    if (!self._cfg.schema.collections[colName]) throw error('Unable to delete: collection ' + colName + ' not found');

    var col = self._cfg.schema.collections[colName];

    // 1. Process input query
    //

    // - consider OR queries
    var queries = util.isArray(query) ? query : [query];
    var safeQueries = [];
    queries.forEach(function (query, index) {

        // - process each OR
        var subqueries = [], op, att;
        for (var attName in query) {
            if (attName[0] === '$') {
                att = attName.split('_')[0].slice(1);
                op = attName.split('_')[1];
            } else {
                att = attName;
                op = 'eq';
            }
            if (col[att]) {
                subqueries.push(_mappers[col[att]].prepare(query[attName], op, self._mapAtt(colName, att)));
            } else {
                var subquery = {};
                subquery[att] = query[attName];
                subqueries.push(subquery);
            }
        }

        var safeQuery = {};
        subqueries.forEach(function (subquery) {
            _.assign(safeQuery, subquery);
        });
        safeQueries.push(safeQuery);
    });

    if (safeQueries.length > 1) {
        query = { $or: safeQueries };
    } else {
        query = safeQueries[0];
    }


    // 2. Delete collection
    //
    var deferred = Q.defer();
    self._db.collection(colName).deleteMany(query, function (err) {
        if (err) deferred.reject(error(err));
        else deferred.resolve(true);
    });
    deferred.promise
        .then(function (res) {
            _log('END delete(' + colName + ',' + JSON.stringify(query) + ') SUCCESS');
            if (cb) cb();
        })
        .fail(function (err) {
            _log.error('END delete(' + colName + ',' + JSON.stringify(query) + ') ERROR', err);
            if (cb) cb(error(err));
        });


};

Store.prototype._mapAtt = function (col, att) {
    var self = this;
    // - if primary key map to MongoDB _id 
    return self._cfg.schema.collections[col]['*'] === att ? '_id' : att;
};

Store.prototype._unmapAtt = function (col, att) {
    var self = this;
    // - if _id then map to primary key
    return att === '_id' ? self._cfg.schema.collections[col]['*'] : att;
};


module.exports = function (url, opts, cb) {
    if (_.isFunction(opts)) {
        cb = opts;
        opts = undefined;
    }
    opts = opts || {};
    opts.url = url;
    // Create store
    let st = new Store(opts);
    // Initialize store
    st.init(cb);

    return st;
}
