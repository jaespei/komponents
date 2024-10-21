/**
 * This module implements a disk-based NoSQL store used in several components.
 *
 * A store implements a simple objects datastore. It contains several collections of objects.
 *
 * @author Javier Esparza Peidro <jesparza@dsic.upv.es>
 */

var util = require('util');
var fs = require('fs');
var Q = require('q');
var sqlite = require('sqlite3');
var _ = require('lodash');
var stringify = require('json-stable-stringify');
var path = require('path');

var name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
var _log = require('utils').logger('store.sqlite' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
var error = require('utils').error;

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

function _toSQLType(t) {
    if (t === 'str') return 'TEXT';
    else if (t === 'int') return 'INT';
    else if (t === 'float') return 'REAL';
    else if (t === 'bool') return 'INT';
    else if (t === 'dict') return 'TEXT';
    else if (t === 'str[]') return 'TEXT';
    else if (t === 'int[]') return 'TEXT';
    else if (t === 'float[]') return 'TEXT';
    else if (t === 'bool[]') return 'TEXT';
    else if (t === 'dict[]') return 'TEXT';
}

function _prepareStr(val, op, att) {
    if (!op) {
        val = _toStr(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + val.replace(/'/gi, "''") + "'";
        return val.indexOf('*') !== -1 ? val.replace(/\*/g, '%') : val;
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' IN (' + _.map(val, function (_val) { return _prepareStr(_val); }).join(',') + ')';
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' NOT IN (' + _.map(val, function (_val) { return _prepareStr(_val); }).join(',') + ')';
    } else if (op === 'eq') {
        val = _toStr(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + val.replace(/'/gi, "''") + "'";
        if (val.indexOf('*') !== -1)
            return att + ' LIKE ' + val.replace(/\*/g, '%');
        else if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toStr(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + val.replace(/'/gi, "''") + "'";
        if (val.indexOf('*') !== -1)
            return att + ' NOT LIKE ' + val.replace(/\*/g, '%');
        else if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else {
        val = _toStr(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + val.replace(/'/gi, "''") + "'";
        var mappings = { 'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<=' };
        if (!(op in mappings)) throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
        return att + ' ' + mappings[op] + ' ' + val;
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
        return util.isNullOrUndefined(val) ? 'NULL' : String(val);
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' IN (' + _.map(val, function (_val) { return _prepareInt(_val); }).join(',') + ')';
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' NOT IN (' + _.map(val, function (_val) { return _prepareInt(_val); }).join(',') + ')';
    } else if (op === 'eq') {
        val = _toInt(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : String(val);
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toInt(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : String(val);
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else {
        val = _toInt(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : String(val);
        var mappings = { 'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<=' };
        if (!(op in mappings)) throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
        return att + ' ' + mappings[op] + ' ' + val;
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
        return util.isNullOrUndefined(val) ? 'NULL' : String(val);
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' IN (' + _.map(val, function (_val) { return _prepareFloat(_val); }).join(',') + ')';
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' NOT IN (' + _.map(val, function (_val) { return _prepareFloat(_val); }).join(',') + ')';
    } else if (op === 'eq') {
        val = _toFloat(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : String(val);
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toFloat(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : String(val);
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else {
        val = _toFloat(obj);
        val = util.isNullOrUndefined(val) ? 'NULL' : String(val);
        var mappings = { 'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<=' };
        if (!(op in mappings)) throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
        return att + ' ' + mappings[op] + ' ' + val;
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
        return util.isNullOrUndefined(val) ? 'NULL' : (val ? '1' : '0');
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' IN (' + _.map(val, function (_val) { return _prepareBool(_val); }).join(',') + ')';
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        return att + ' NOT IN (' + _.map(val, function (_val) { return _prepareBool(_val); }).join(',') + ')';
    } else if (op === 'eq') {
        val = _toBool(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : (val ? '1' : '0');
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toBool(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : (val ? '1' : '0');
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
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
        return util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
    } else if (op === 'in') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        val = _.map(val, function (_val) {
            _val = _toDict(_val);
            return "'" + _toJSON(_val) + "'";
        });
        return '(' + att + ' = ' + val.join(' OR ' + att + ' = ') + ')';
    } else if (op === 'nin') {
        if (!util.isArray(val)) throw error('Wrong query syntax: \'in\' operator requires array');
        val = _.map(val, function (_val) {
            _val = _toDict(_val);
            return "'" + _toJSON(_val) + "'";
        });
        return 'NOT (' + att + ' = ' + val.join(' OR ' + att + ' = ') + ')';
    } else if (op === 'eq') {
        val = _toDict(val);
        return att + ' = ' + _toJSON(val);
    } else if (op === 'neq') {
        val = _toDict(val);
        return att + ' <> ' + _toJSON(val);
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toDict(obj) {
    return util.isNullOrUndefined(obj) ? null : obj;
}

function _fromDict(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? JSON.parse(obj) : obj);
}

function _prepareStrArray(val, op, att) {
    if (!op) {
        val = _toStrArray(val);
        return util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
    } else if (op === 'contains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toStr(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'ncontains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toStr(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return 'NOT (' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'containsany') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toStr(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' OR ' + att + ' LIKE ') + ')';
    } else if (op === 'eq') {
        val = _toStrArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toStrArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toStrArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toStr(_val); });
}

function _fromStrArray(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? JSON.parse(obj) : obj);
}

function _prepareIntArray(val, op, att) {
    if (!op) {
        val = _toIntArray(val);
        return util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
    } else if (op === 'contains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toInt(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'ncontains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toInt(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return 'NOT (' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'containsany') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toInt(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' OR ' + att + ' LIKE ') + ')';
    } else if (op === 'eq') {
        val = _toIntArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        return att + ' = ' + val;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toIntArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toInt(_val); });
}

function _fromIntArray(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? JSON.parse(obj) : obj);
}

function _prepareFloatArray(val, op, att) {
    if (!op) {
        val = _toFloatArray(val);
        return util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
    } else if (op === 'contains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toFloat(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'ncontains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toFloat(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return 'NOT (' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'containsany') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toFloat(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' OR ' + att + ' LIKE ') + ')';
    } else if (op === 'eq') {
        val = _toFloatArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toFloatArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toFloatArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toFloat(_val); });
}

function _fromFloatArray(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? JSON.parse(obj) : obj);
}

function _prepareBoolArray(val, op, att) {
    if (!op) {
        val = _toBoolArray(val);
        return util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
    } else if (op === 'contains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toBool(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'ncontains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toBool(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return 'NOT (' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'containsany') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toBool(_val);
            return "'%" + _toJSON(_val) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' OR ' + att + ' LIKE ') + ')';
    } else if (op === 'eq') {
        val = _toBoolArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toBoolArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toBoolArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toBool(_val); });
}

function _fromBoolArray(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? JSON.parse(obj) : obj);
}

function _prepareDictArray(val, op, att) {
    if (!op) {
        val = _toDictArray(val);
        return util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
    } else if (op === 'contains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toJSON(_toDict(_val));
            return "'%" + _val.slice(1, _val.length - 1) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'ncontains') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toJSON(_toDict(_val));
            return "'%" + _val.slice(1, _val.length - 1) + "%'";
        });
        return 'NOT (' + att + ' LIKE ' + val.join(' AND ' + att + ' LIKE ') + ')';
    } else if (op === 'containsany') {
        if (!util.isArray(val)) val = [val];
        val = _.map(val, function (_val) {
            _val = _toJSON(_toDict(_val));
            return "'%" + _val.slice(1, _val.length - 1) + "%'";
        });
        return '(' + att + ' LIKE ' + val.join(' OR ' + att + ' LIKE ') + ')';
    } else if (op === 'eq') {
        val = _toDictArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NULL';
        else
            return att + ' = ' + val;
    } else if (op === 'neq') {
        val = _toDictArray(val);
        val = util.isNullOrUndefined(val) ? 'NULL' : "'" + _toJSON(val) + "'";
        if (val === 'NULL')
            return att + ' IS NOT NULL';
        else
            return att + ' <> ' + val;
    } else throw error('Wrong query syntax, unsupported operator \'' + op + '\'');
}

function _toDictArray(obj) {
    var val = util.isArray(obj) ? obj : [obj];
    return _.map(val, function (_val) { return _toDict(_val); });
}

function _fromDictArray(obj) {
    return util.isNullOrUndefined(obj) ? null : (util.isString(obj) ? JSON.parse(obj) : obj);
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
 * Collection specification. Each entry defines an attribute in the collection.
 *
 * @typedef {Object} Collection
 */

/**
 * Attribute specification.
 *
 * @typedef {Object} Attribute
 * @property {Function} type - Type constructor
 * @property {boolean} indexed - Whether the attribute must be indexed
 */

/**
 * Creates a new store.
 *
 * @constructor
 * @classdesc Store backed by SQLite engine
 * @param {Object} [cfg] - Store configuration
 * @param {string} cfg.url - The store location
 * @param {Object} [cfg.schema] - The store schema. If not provided, the database is supposed to exist
 * @param {string} [cfg.schema.version] - The schema version
 * @param {Object} cfg.schema.collections - Dictionary containing all collections in the store {<col-name>: <col-spec>}
 *
 */
function Store(cfg) {

    _log('Store()', cfg);

    var self = this;

    cfg = cfg ? cfg : {};

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

    let index, url;
    index = self._cfg.url.indexOf(":");
    if (index != -1) self._url = self._cfg.url.slice(index + 1);
    else self._url = self._cfg.url;

    // 1. Connect to database
    //    - if the database does not exist create it
    //    - if the database exists, load stored configuration and check compatibility
    //
    var deferred = Q.defer();
    fs.access(self._url, fs.F_OK, function (err) {
        if (err) {

            // The database does not exist:
            // - if schema not specified the database can not be created
            // - if schema specified, create database
            //
            if (!self._cfg.schema) {
                deferred.reject(error('Unable to open store: database does not exist and schema not specified'));
                return;
            }
            self._create(function (err) {
                if (err) {
                    deferred.reject(error(err));
                    return;
                }
                deferred.resolve(true);
            });

        } else {

            // The database exists, open connection and load configuration
            //
            self._db = new sqlite.Database(self._url, function (err) {
                if (err) {
                    deferred.reject(error('Unable to open store', err));
                    return;
                }
                self._db.get('SELECT * FROM _cfg;', function (err, row) {
                    if (!row) {
                        // If no database configuration then create schema
                        self._create(function (err) {
                            if (err) deferred.reject(error(err));
                            else deferred.resolve(true);
                        });
                    } else {
                        var dbCfg;
                        try {
                            dbCfg = { url: row.url, schema: _fromJSON(row.schema) };
                        } catch (err) {
                            deferred.reject(error('Unable to open store: unknown schema', err));
                            return;
                        }
                        if (self._cfg.schema && self._cfg.schema.version && self._cfg.version != dbCfg.version) {
                            deferred.reject(error('Unable to open store: incompatible schema versions'));
                            return;
                        }
                        self._cfg = dbCfg;
                        deferred.resolve(true);
                    }
                });
            });
        }
    });

    // 2. Adapt configuration
    //
    return deferred.promise
        .then(function (res) {
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
            _log('END open() SUCCESS');
            return Q();            
        })
        .fail(function (err) {
            _log.error('END open() ERROR', err);
            self._error = err;
        })
        .finally(function () {
            if (self._db) self._db.close();
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

    // - add _bulk attribute to every collection
    _.forEach(self._cfg.schema.collections, function (col) {
        col._bulk = 'dict';
    });

    var deferred = Q.defer();
    if (!self._db) {
        self._db = new sqlite.Database(self._url, function (err) {
            if (err) deferred.reject(error('Unable to create store', err));
            else deferred.resolve();
        });
    } else {
        deferred.resolve();
    }

    return deferred.promise
        .then(() => {
            let deferred = Q.defer();
            var sql = "CREATE TABLE _cfg (url TEXT, schema TEXT);\n";
            sql += "INSERT INTO _cfg VALUES ('" + self._cfg.url + "','" + _toJSON(self._cfg.schema) + "');\n";
            for (var colName in self._cfg.schema.collections) {

                var strStmt = "CREATE TABLE " + colName + " (";

                var i = 0;
                col = self._cfg.schema.collections[colName];
                for (var attName in col) {
                    var isPrimaryKey = false, isUnique = false, isIndex = false;
                    if (attName[0] == '*') {
                        isPrimaryKey = true;
                        _attName = attName.slice(1);
                    } else if (attName[0] == '+') {
                        isUnique = true;
                        _attName = attName.slice(1);
                    } else if (attName[0] == '-') {
                        isIndex = true;
                        _attName = attName.slice(1);
                    } else {
                        _attName = attName;
                    }

                    strStmt += (i++ === 0 ? "" : ", ") + _attName + " " + _toSQLType(col[attName]) +
                        (isPrimaryKey ? " PRIMARY KEY" : "") +
                        (isUnique ? " UNIQUE" : "");
                }

                //strStmt += "_bulk TEXT);";
                sql += strStmt + ');\n';
            }

            _log(' - exec SQL', sql);

            self._db.exec(sql, function (err) {
                if (err) deferred.reject(error('Unable to create store', err));
                else deferred.resolve(true);
            });
            return deferred.promise;

        })
        .then(function (res) {
            _log('END create() SUCCCESS');
        })
        .fail(function (err) {
            _log.error('END create() ERROR', err);
            self.drop();
        }).nodeify(cb);

};


/**
 * Open the specified store.
 *
 * @param {Function} [cb] - The operation callback
 */
Store.prototype.open = function (cb) {

    _log('START open()');

    let self = this;

    if (self._error) throw error('Unable to open store: store not initialized');
    if (self._db) throw error('Unable to open store: store already opened');

    let deferred = Q.defer();
    self._db = new sqlite.Database(self._url, (err) => {
        if (err) deferred.reject(error(err));
        else deferred.resolve();
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

    self._db.close(function (err) {

        delete self._db;

        if (err) {
            _log.error('END close() ERROR', err);
            if (cb) cb(error('Unable to close the store', err));
            return;
        }
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
    if (self._db) {
        self.close(function (err) {
            deferred.resolve(true);
        });
    } else {
        deferred.resolve(true);
    }

    deferred.promise
        .then(function (res) {

            fs.unlink(self._cfg.url, function (err) {
                if (err) {
                    _log.error('END drop() ERROR', err);
                    if (cb) cb(error('Unable to drop store', err));
                    return;
                }
                _log('END drop() SUCCESS');
                if (cb) cb();

            });
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

    // 1. Close store
    //
    var backup = { ts: Date.now() };

    // 1. Backup schema
    //
    var deferred = Q.defer();
    self._db.all('SELECT * from _cfg;', function (err, rows) {
        if (err) deferred.reject(error(err));
        else if (rows.length === 0) deferred.reject(error('Unable to backup: schema not found'));
        else {
            backup.schema = JSON.parse(rows[0].schema);
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

    /*var reopen = false;
    var deferred = Q.defer();
    if (self._db) {
        self.close(function (err) {
            if (err) deferred.reject(error(err));
            else {
                reopen = true;
                deferred.resolve(true);
            }
        });
    } else deferred.resolve(true);

    deferred.promise
        .then(function (res) {

            // 2. Read file
            //
            var deferred = Q.defer();
            fs.readFile(self._cfg.url, function (err, data) {
                if (err) deferred.reject(error(err));
                else {
                    backup = data;
                    deferred.resolve(backup);
                }
            });
            return deferred.promise;

        })
        .then(function (res) {

            // 3. Reopen store
            //
            var deferred = Q.defer();
            if (reopen) {
                self.open(function (err) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(true);
                });
            } else deferred.resolve(true);
            return deferred.promise;

        })
        .then(function (res) {

            // 4. Convert to JSON
            //
            backup = JSON.stringify(backup);
            return Q(true);

        })
        .then(function (res) {
            _log('END backup() SUCCESS');
            if (cb) cb(null, backup);
        })
        .fail(function (err) {
            _log.error('END backup() ERROR', err);
            if (cb) cb(error(err));
        });*/

};

/**
 * Rstore the specified bckup.
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


    /*// 1. Parse from JSON
    //
    var json = JSON.parse(backup);
    if (!json.type || json.type != 'Buffer' || !json.data) throw error('Unable to restore store: unrecognized backup format');
    backup = Buffer.from(json.data);

    // 1. Close store
    //
    var reopen = false;
    var deferred = Q.defer();
    if (self._db) {
        self.close(function (err) {
            if (err) deferred.reject(error(err));
            else {
                reopen = true;
                deferred.resolve(true);
            }
        });
    } else deferred.resolve(true);

    deferred.promise
        .then(function (res) {

            // 2. Write file
            //
            var deferred = Q.defer();
            fs.writeFile(self._cfg.url, backup, function (err) {
                if (err) deferred.reject(error(err));
                else deferred.resolve(true);
            });
            return deferred.promise;

        })
        .then(function (res) {

            // 3. Reopen store
            //
            var deferred = Q.defer();
            if (reopen) {
                self.open(function (err) {
                    if (err) deferred.reject(error(err));
                    else deferred.resolve(true);
                });
            } else deferred.resolve(true);
            return deferred.promise;

        })
        .then(function (res) {
            _log('END restore() SUCCESS');
            if (cb) cb(null, backup);
        })
        .fail(function (err) {
            _log.error('END restore() ERROR', err);
            if (cb) cb(error(err));
        });*/

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
    var indexedData = {}, bulkData = {};
    for (var attName in data) {
        if (col[attName]) indexedData[attName] = data[attName];
        else bulkData[attName] = data[attName];
    }

    var strStmt = "INSERT INTO " + colName + " (" + Object.keys(indexedData).join(',');
    strStmt += Object.keys(bulkData).length > 0 ? (Object.keys(indexedData).length > 0 ? ',' : '') + ' _bulk)' : ')';
    strStmt += " VALUES (" + _.map(Object.keys(indexedData), function (attName) { return _mappers[col[attName]].prepare(indexedData[attName]); }).join(',');
    strStmt += Object.keys(bulkData).length > 0 ? (Object.keys(indexedData).length > 0 ? ',' : '') + _prepareDict(bulkData) + ')' : ')';

    _log(' - exec SQL', strStmt);
    self._db.run(strStmt, function (err) {

        if (err) {
            _log.error('END insert(' + colName + ') ERROR', err);
            if (cb) cb(error('Unable to insert', err));
            return;
        }
        _log('END insert(' + colName + ') SUCCESS');
        if (cb) cb();

    });

};

/**
 * Search the specified data.
 *
 * @param {string} colName - The collection name
 * @param {Object|Array.<Object>} [query] - The query
 * @param {Object} [opts] - Query options
 * @param {string} [opts.orderBy] - Order results by field in format '[+|-]field' (e.g. '+name')
 * @param {string} [opts.limit] - Maximum number of results
 * @param {string} [opts.offset] - Discard initial results
 * @param {string} [opts.fields] - Comma separated list of fields (if a field is prefixed with '-' it is removed)
 * @param {Function} cb - The operation callback. It returns the query results
 */
Store.prototype.search = function (colName, query, opts, cb) {

    _log('START search(' + colName + ',' + JSON.stringify(query) + ',' + JSON.stringify(opts) + ')');

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
    var fields;
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
        if (_plus.length > 0) fields = _plus;
        else fields = _.filter(Object.keys(col), function (attName) { return attName !== '*' && attName !== '+' && attName !== '-'; });

        // - remove fields to hide
        if (_minus.length > 0) fields = _.filter(fields, function (f) { return _minus.indexOf(f) === -1; });

        // - always add primary key
        if (col['*'] && fields.indexOf(col['*']) === -1) fields.push(col['*']);

        _log('- fields: ' + JSON.stringify(fields) + ',_minus: ' + JSON.stringify(_minus) + ',_plus: ' + JSON.stringify(_plus));

    } else {

        // - initialize with all fields
        fields = _.filter(Object.keys(col), function (attName) { return attName !== '*' && attName !== '+' && attName !== '-'; });
    }

    // - prepare sort
    if (opts.orderBy) {
        if (opts.orderBy[0] !== '+' && opts.orderBy[0] !== '-') throw error('Wrong sort specification');
        if (!col[opts.orderBy.slice(1)]) throw error('Unable to sort by attribute ' + opts.orderBy.slice(1));
    }

    var strQuery = "SELECT " + fields.join(", ") + " FROM " + colName;

    // - consider OR queries
    var queries = util.isArray(query) ? query : [query];

    queries.forEach(function (query, index) {

        // - process each OR
        var subqueries = [], op, att, bulk = {};
        for (var attName in query) {
            if (attName[0] === '$') {
                att = attName.split('_')[0].slice(1);
                op = attName.split('_')[1];
            } else {
                att = attName;
                op = 'eq';
            }
            if (col[att]) {
                subqueries.push(_mappers[col[att]].prepare(query[attName], op, att));
            } else {
                bulk[att] = query[attName];
            }
        }
        if (Object.keys(bulk).length > 0)
            subqueries.push(_mappers['dict'].prepare(bulk, 'eq', '_bulk'));

        if (subqueries.length)
            strQuery += (index === 0 ? " WHERE (" : " OR (") + subqueries.join(" AND ") + ")";

    });

    strQuery += (opts.orderBy ? " ORDER BY " + opts.orderBy.slice(1) + (opts.orderBy[0] == '+' ? ' ASC' : ' DESC') : "") +
        (opts.limit ? " LIMIT " + String(opts.limit) : "") +
        (opts.offset ? " OFFSET " + String(opts.offset) : "") +
        ";";

    _log(' - SQL query', strQuery);
    self._db.all(strQuery, function (err, rows) {
        if (err) {
            _log.error('END search(' + colName + ',' + JSON.stringify(query) + ',' + JSON.stringify(opts) + ') ERROR', err);
            if (cb) cb(error('Unable to search', err));
            return;
        }

        var results = [];
        for (var i = 0; i < rows.length; i++) {
            var obj = {};
            for (var j = 0; j < fields.length; j++) {
                var attName = fields[j];
                obj[attName] = _mappers[col[attName]].from(rows[i][attName]);
                if (util.isNullOrUndefined(obj[attName])) delete obj[attName];
            }
            if (obj._bulk) {
                _.assign(obj, obj._bulk);
                delete obj._bulk;
            }

            results.push(obj);
        }

        _log('END search(' + colName + ',' + JSON.stringify(query) + ',' + JSON.stringify(opts) + ') SUCCESS');
        if (cb) cb(null, results);

    });
};

/**
 * Update the specified object with the specified data.
 *
 * @param {string} colName - The collection name
 * @param {Object} data - The data to update
 * @param {Object} query - The query to select the objects to update
 * @param {Object} [opts] - Optional parameters
 * @param {boolean} [opts.atomic] - Atomic update
 * @param {Function} cb - The operation callback
 */
Store.prototype.update = function (colName, query, data, opts, cb) {

    _log('START update(' + colName + ',' + JSON.stringify(query) + ')', data);

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

    var indexedData = {}, bulkData = {};
    for (var attName in data) {
        if (col[attName]) indexedData[attName] = data[attName];
        else bulkData[attName] = data[attName];
    }

    var strStmt = "UPDATE " + colName;
    var i = 0;
    for (var attName in indexedData) {
        strStmt += (i === 0 ? " SET " : ", ") + attName + " = " + _mappers[col[attName]].prepare(indexedData[attName]);
        i++;
    }

    if (Object.keys(bulkData).length > 0) {
        strStmt += (Object.keys(indexedData).length === 0 ? " SET " : ", ") + "_bulk = " + _prepareDict(bulkData);
    }

    // - consider OR queries
    var queries = util.isArray(query) ? query : [query];

    queries.forEach(function (query, index) {

        // - process each OR
        var subqueries = [], op, att, bulk = {};
        for (var attName in query) {
            if (attName[0] === '$') {
                att = attName.split('_')[0].slice(1);
                op = attName.split('_')[1];
            } else {
                att = attName;
                op = 'eq';
            }
            if (col[att]) {
                subqueries.push(_mappers[col[att]].prepare(query[attName], op, att));
            } else {
                bulk[att] = query[attName];
            }
        }
        if (Object.keys(bulk).length > 0)
            subqueries.push(_mappers['dict'].prepare(bulk, 'eq', '_bulk'));

        if (subqueries.length)
            strStmt += (index === 0 ? " WHERE (" : " OR (") + subqueries.join(" AND ") + ")";

    });

    strStmt += ";";
    _log(' - SQL statement', strStmt);

    // - by default all SQLite statements are in auto-commit mode, so
    //   if 'atomic' update is required nothing must be done
    self._db.run(strStmt, function (err) {

        if (err) {
            _log.error('END update(' + colName + ',' + JSON.stringify(query) + ') ERROR', err);
            if (cb) cb(error('Unable to update', err));
            return;
        }

        _log('END update(' + colName + ',' + JSON.stringify(query) + ') SUCCESS');
        if (cb) cb();

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

    var strStmt = "DELETE FROM " + colName;

    // - consider OR queries
    var queries = util.isArray(query) ? query : [query];

    queries.forEach(function (query, index) {

        // - process each OR
        var subqueries = [], op, att, bulk = {};
        for (var attName in query) {
            if (attName[0] === '$') {
                att = attName.split('_')[0].slice(1);
                op = attName.split('_')[1];
            } else {
                att = attName;
                op = 'eq';
            }
            if (col[att]) {
                subqueries.push(_mappers[col[att]].prepare(query[attName], op, att));
            } else {
                bulk[att] = query[attName];
            }
        }
        if (Object.keys(bulk).length > 0)
            subqueries.push(_mappers['dict'].prepare(bulk, 'eq', '_bulk'));

        if (subqueries.length)
            strStmt += (index === 0 ? " WHERE (" : " OR (") + subqueries.join(" AND ") + ")";

    });

    strStmt += ";";
    _log(' - SQL statement', strStmt);

    self._db.run(strStmt, function (err) {

        if (err) {
            _log.error('END delete(' + colName + ',' + JSON.stringify(query) + ') ERROR', err);
            if (cb) cb(error('Unable to delete', err));
            return;
        }
        _log('END delete(' + colName + ',' + JSON.stringify(query) + ') SUCCESS');
        if (cb) cb();

    });
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
