/**
 * This module implements a document NoSQL store backed by a key-value engine. 
 * 
 * The key-value engine provides a common interface which may be implemented
 * by different back-end stores. The store must provide the following method
 * for opening new connections:
 * - open(url, cb): the url must meet the format "<store>:<db-name>?opt=1&opt=2"
 * Connections are objects providing the level-based methods:
 * - put(key, value, cb): (over)writes the specified entry into the store
 * - get(key, cb): if key exists, the value is returned; otherwise null
 * - del(key, cb): the entry with the specified key is deleted
 * - batch(array, cb): executes atomically the specified collection of operations 
 *                     {type ("put", "del"),key,value}
 * - iterator(opts, cb): returns an iterator to obtain the specified range of entries
 *                       the iterator contains the methods: next(), seek(), end()
 * - close(cb): close the connection
 * 
 * Internally, the store configuration is stored under key "_cfg".
 * Every object collection is stored under the path: /<colName>
 * There is always an index on the primary key, called the "primary index", under the path: /<colName>/id/<id> => ""
 * The primary index contains all the object properties under the paths: /<colName>/id/<id>/<propName> => <propValue> 
 * The primary index record finishes with an additional entry under path: /<colName>/id/<id>/<KEY_END> => ""
 * Multivalued (array-based) properites are stored under the paths: /<colName>/id/<id>/<propName>/<propValueN> => ""
 * Secondary indexes on additional properties are stored under the path: /<colName>/<propName>
 * Secondary unique indexes follow the path /<colName>/<propName>/<propValue> => <id>
 * Secondary non-unique indexes follow the path /<colName>/<propName>/<propValue>/<id>
 * 
 * Additional constraints:
 * - Every collection must have a primary key (all properties will be stored under associated path)
 * - To avoid expensive full-scans queries can only be done on indexed properties.
 *
 * @author Javier Esparza Peidro <jesparza@dsic.upv.es>
 */
const _ = require('lodash');
const Q = require('utils').q;
const util = require("util");

let name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
let _log = require('utils').logger('store.kv' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
const error = require('utils').error;

// Special keys
const KEY_CFG = '$cfg';
const KEY_END = '\uffff';
const KEY_SEP = "/";
const KEY_ESCAPE = "%";

var LOCK_TIMEOUT = 1000; // 1 sec

/**
 * Builds a key from the different path segments.
 * 
 * @param {...string} args The different path segments
 * @return {String} The key
 */
function key(...args) {
    if (args.length && !args[0].startsWith(KEY_SEP)) return `${KEY_SEP}` + args.join(KEY_SEP);
    else return args.join(KEY_SEP);
}

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

// ----------------------- Converter functions

function _toStr(val) {
    if (_.isNull(val) || _.isUndefined(val)) return "null";
    else if (_.isString(val)) return val;
    else if (_.isArray(val)) {
        // - encode array
        return JSON.stringify(val);
    } else if (_.isObject(val)) {
        // - encode object
        // - deterministic stringify (convert to array)
        let array = [];
        Object.keys(val).sort((k1, k2) => k1.localeCompare(k2)).forEach(key => {
            array.push([key, val[key]]);
        });
        return JSON.stringify(array);
    } else return String(val);

}

function _toInt(val) {
    if (_.isNull(val) || _.isUndefined(val)) return null;
    else if (val == "null") return null;
    else if (_.isNumber(val)) return Math.floor(val);
    else if (_.isString(val)) return parseInt(val);
    else return Math.floor(Number(val));
}

function _toFloat(val) {
    if (_.isNull(val) || _.isUndefined(val)) return null;
    else if (val == "null") return null;
    else if (_.isNumber(val)) return val;
    else if (_.isString(val)) return parseFloat(val);
    else return Number(val);
}

function _toBool(val) {
    if (_.isNull(val) || _.isUndefined(val)) return null;
    else if (val == "null") return null;
    else if (_.isBoolean(val)) return val;
    else if (_.isString(val) && val.toLowerCase() == "true") return true;
    else if (_.isString(val) && val.toLowerCase() == "false") return false;
    else return Boolean(val);
}

function _toDict(val) {
    if (_.isNull(val) || _.isUndefined(val)) return null;
    else if (val == "null") return null;
    else if (_.isObject(val)) return val;
    else if (_.isString(val)) {
        let dict = {};
        JSON.parse(val).forEach((elem) => {
            dict[elem[0]] = elem[1];
        });
        return dict;
    } else return new Object(val);
}

function _toArray(val, converter) {
    if (_.isNull(val) || _.isUndefined(val)) return null;
    else if (val == "null") return null;
    else if (_.isArray(val) && !converter) return val;
    else if (_.isArray(val) && converter) {
        return _.map(val, (elem) => converter(elem));
    } else if (_.isString(val)) {
        return JSON.parse(val);
    } else return new Array(val);
}

function _toJSON(obj) {
    return JSON.stringify(obj);
}

function _fromJSON(s) {
    return JSON.parse(s);
}


// For each supported data type:
// - _<type>ToRaw(val): transforms data type to serializable form
// - _rawTo<Type>(val): transforms serializable form to data type
// - _prepare<Type>(val): transforms data type to query form
// - _unprepare<Type>(val): transforms query form to data type

// -------- str
function _strToRaw(val) {
    let str = _toStr(val);
    return Buffer.from(str);
}

function _rawToStr(val) {
    let ret = val.toString();
    return ret == "null" ? null : ret;
}

function _prepareStr(val) {
    let str = _toStr(val);
    return str.replace(new RegExp(KEY_ESCAPE, "g"), `${KEY_ESCAPE}${KEY_ESCAPE}`).replace(new RegExp(KEY_SEP, "g"), `{${KEY_ESCAPE}}`);
}

function _unprepareStr(val) {
    let str = val.replace(new RegExp(`{${KEY_ESCAPE}}`, "g"), KEY_SEP).replace(new RegExp(`${KEY_ESCAPE}${KEY_ESCAPE}`, "g"), KEY_ESCAPE);
    return str == "null" ? null : str;
}
// -------- int
function _intToRaw(val) {
    let num = _toInt(val);
    let str = _toStr(num);
    return Buffer.from(str);
}

function _rawToInt(val) {
    let ret = val.toString();
    return _toInt(ret);
}

function _prepareInt(val) {
    let num = _toInt(val);
    let str = _toStr(num);
    return str.replace(new RegExp(KEY_ESCAPE, "g"), `${KEY_ESCAPE}${KEY_ESCAPE}`).replace(new RegExp(KEY_SEP, "g"), `{${KEY_ESCAPE}}`);
}

function _unprepareInt(val) {
    let str = val.replace(new RegExp(`{${KEY_ESCAPE}}`, "g"), KEY_SEP).replace(new RegExp(`${KEY_ESCAPE}${KEY_ESCAPE}`, "g"), KEY_ESCAPE);
    return _toInt(str);
}
// -------- float
function _floatToRaw(val) {
    let num = _toFloat(val);
    let str = _toStr(num);
    return Buffer.from(str);
}

function _rawToFloat(val) {
    let ret = val.toString();
    return _toFloat(ret);
}

function _prepareFloat(val) {
    let num = _toFloat(val);
    let str = _toStr(num);
    return str.replace(new RegExp(KEY_ESCAPE, "g"), `${KEY_ESCAPE}${KEY_ESCAPE}`).replace(new RegExp(KEY_SEP, "g"), `{${KEY_ESCAPE}}`);
}

function _unprepareFloat(val) {
    let str = val.replace(new RegExp(`{${KEY_ESCAPE}}`, "g"), KEY_SEP).replace(new RegExp(`${KEY_ESCAPE}${KEY_ESCAPE}`, "g"), KEY_ESCAPE);
    return str == "null" ? null : parseFloat(str);
}
// -------- bool
function _boolToRaw(val) {
    let bool = _toBool(val);
    let str = _toStr(bool);
    return Buffer.from(str);
}

function _rawToBool(val) {
    let ret = val.toString();
    return _toBool(ret);
}

function _prepareBool(val) {
    let bool = _toBool(val);
    let str = _toStr(bool);
    return str.replace(new RegExp(KEY_ESCAPE, "g"), `${KEY_ESCAPE}${KEY_ESCAPE}`).replace(new RegExp(KEY_SEP, "g"), `{${KEY_ESCAPE}}`);
}

function _unprepareBool(val) {
    let str = val.replace(new RegExp(`{${KEY_ESCAPE}}`, "g"), KEY_SEP).replace(new RegExp(`${KEY_ESCAPE}${KEY_ESCAPE}`, "g"), KEY_ESCAPE);
    return str == "null" ? null : str == "true" && true || false;
}
// -------- dict
function _dictToRaw(val) {
    let dict = _toDict(val);
    let str = _toStr(dict);
    return Buffer.from(str);
}

function _rawToDict(val) {
    let ret = val.toString();
    return _toDict(ret);
}

function _prepareDict(val) {
    let dict = _toDict(val);
    let str = _toStr(dict);
    return str.replace(new RegExp(KEY_ESCAPE, "g"), `${KEY_ESCAPE}${KEY_ESCAPE}`).replace(new RegExp(KEY_SEP, "g"), `{${KEY_ESCAPE}}`);
}

function _unprepareDict(val) {
    let str = val.replace(new RegExp(`{${KEY_ESCAPE}}`, "g"), KEY_SEP).replace(new RegExp(`${KEY_ESCAPE}${KEY_ESCAPE}`, "g"), KEY_ESCAPE);
    return _toDict(str);
}
// -------- array
function _arrayToRaw(val, converter) {
    let array = _toArray(val, converter);
    let str = _toStr(array);
    return Buffer.from(str);
}

function _rawToArray(val, converter) {
    let ret = val.toString();
    return _toArray(ret, converter);
}

function _prepareArray(val, converter) {
    let array = _toArray(val, converter);
    let str = _toStr(array);
    return str.replace(new RegExp(KEY_ESCAPE, "g"), `${KEY_ESCAPE}${KEY_ESCAPE}`).replace(new RegExp(KEY_SEP, "g"), `{${KEY_ESCAPE}}`);
}

function _unprepareArray(val, converter) {
    let str = val.replace(new RegExp(`{${KEY_ESCAPE}}`, "g"), KEY_SEP).replace(new RegExp(`${KEY_ESCAPE}${KEY_ESCAPE}`, "g"), KEY_ESCAPE);
    return _toArray(str, converter);
}

let _mappers = {
    str: {
        convert: _toStr,
        to: _strToRaw,
        from: _rawToStr,
        prepare: _prepareStr,
        unprepare: _unprepareStr
    },
    int: {
        convert: _toInt,
        to: _intToRaw,
        from: _rawToInt,
        prepare: _prepareInt,
        unprepare: _unprepareInt
    },
    float: {
        convert: _toFloat,
        to: _floatToRaw,
        from: _rawToFloat,
        prepare: _prepareFloat,
        unprepare: _unprepareFloat
    },
    bool: {
        convert: _toBool,
        to: _boolToRaw,
        from: _rawToBool,
        prepare: _prepareBool,
        unprepare: _unprepareBool
    },
    dict: {
        convert: _toDict,
        to: _dictToRaw,
        from: _rawToDict,
        prepare: _prepareDict,
        unprepare: _unprepareDict
    },
    "str[]": {
        convert: (val) => _toArray(val, _toStr),
        to: (val) => _arrayToRaw(val, _toStr),
        from: (val) => _rawToArray(val, _toStr),
        prepare: (val) => _prepareArray(val, _toStr),
        unprepare: (val) => _unprepareArray(val, _toStr)
    },
    "int[]": {
        convert: (val) => _toArray(val, _toInt),
        to: (val) => _arrayToRaw(val, _toInt),
        from: (val) => _rawToArray(val, _toInt),
        prepare: (val) => _prepareArray(val, _toInt),
        unprepare: (val) => _unprepareArray(val, _toInt)
    },
    "float[]": {
        convert: (val) => _toArray(val, _toFloat),
        to: (val) => _arrayToRaw(val, _toFloat),
        from: (val) => _rawToArray(val, _toFloat),
        prepare: (val) => _prepareArray(val, _toFloat),
        unprepare: (val) => _unprepareArray(val, _toFloat)
    },
    "bool[]": {
        convert: (val) => _toArray(val, _toBool),
        to: (val) => _arrayToRaw(val, _toBool),
        from: (val) => _rawToArray(val, _toBool),
        prepare: (val) => _prepareArray(val, _toBool),
        unprepare: (val) => _unprepareArray(val, _toBool)
    },
    "dict[]": {
        convert: (val) => _toArray(val, _toDict),
        to: (val) => _arrayToRaw(val, _toDict),
        from: (val) => _rawToArray(val, _toDict),
        prepare: (val) => _prepareArray(val, _toDict),
        unprepare: (val) => _unprepareArray(val, _toDict)
    }
}



/**
 * Creates a new store.
 *
 * @constructor
 * @classdesc Store backed by SQLite engine
 * @param {Object} cfg - Store configuration
 * @param {string} cfg.url - The store location
 * @param {Object} [cfg.schema] - The store schema
 * @param {string} [cfg.schema.version] - The schema version
 * @param {Object} [cfg.schema.collections] - Dictionary containing all collections in the store {<col-name>: <col-spec>}
 */
function Store(cfg) {
    _log(`Store(${JSON.stringify(cfg)})`);

    this._cfg = {};
    for (let attName in cfg) this._cfg[attName] = cfg[attName];

    this._locks = {};

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

    if (!this._cfg.url) throw error('Unable to initialize store: URL not specified');

    let driverName, url = this._cfg.url;
    let paths = url.split(":");
    if (paths.length == 1) {
        url = this._cfg.url = "level:" + paths[0];
        driverName = "level";
    } else if (paths.length == 2) {
        if (paths[0] == "kv") {
            url = this._cfg.url = "level:" + paths[1];
            driverName = "level";
        } else driverName = paths[0];
    } else {
        if (paths[0] == "kv") {
            url = this._cfg.url = paths.slice(1).join(":");
            driverName = paths[1];
        } else driverName = paths[0];
    }

    try {
        // Import driver library
        this._driver = require(`./${driverName}`);
        if (!this._driver) throw new Error(`Unable to open store: unknown store type ${driverName}`);

        // Open connection against the backend
        this._db = await this._driver.open(url, this._cfg);

        // Get database schema
        let _cfg = await this._db.get(KEY_CFG);

        if (_cfg) {
            // If database exists then check compatibility
            _cfg = _fromJSON(_cfg);
            if (this._cfg.schema && this._cfg.schema.version && this._cfg.schema.version != _cfg.schema.version)
                throw error('Unable to open store: incompatible schema versions');

            // [TODO] Check more attributes ¿?

            // Set store configuration
            //this._cfg = _cfg;
            this._cfg.schema = _cfg.schema;

        } else {

            // If database does not exist then create schema
            await this._create({ schema: this._cfg.schema });

        }

        // Adapt configuration
        _.each(this._cfg.schema.collections, (col, colName) => {
            // - create snapshot of keys
            var attNames = Object.keys(col);

            col['*'] = undefined; // Primary key: only one
            col['+'] = []; // Unique keys: multiple
            col['-'] = []; // Indexed keys: multiple

            for (let i = 0; i < attNames.length; i++) {
                let attName = attNames[i];
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
        });

        if (cb) cb();

    } catch (err) {
        if (cb) cb(error(err))
        throw error(err);
    } finally {
        if (this._db) this._db.close();
        delete this._db;
    }
}


/**
 * Creates the store.
 *
 * @param {Object} cfg - The database configuration
 */
Store.prototype._create = async function (cfg) {
    _log('_create()');
    if (!cfg.schema) throw error('Unable to create store: attribute \'schema\' not specified');
    if (!cfg.schema.version) throw error('Unable to create store: attribute \'version\' not specified');
    if (!cfg.schema.collections) throw error('Unable to create store: attribute \'collections\' not specified');

    // Store configuration
    await this._db.put(
        KEY_CFG, _toJSON({ /*url: cfg.url,*/ schema: cfg.schema }),
        {preventHA: true}
    );

    // Create initial structure
    let operations = [];
    for (let colName in cfg.schema.collections) {

        // - get next collection
        let col = cfg.schema.collections[colName];

        // - add extra properties (for enabling locks)
        col._lock = "str";
        col._ts = "int";

        let hasPrimaryKey = false;

        // - create anchor entries to mark collection and attribute beginning and end        
        operations.push({ type: "put", key: key(colName), value: "" }); // collection begin
        for (let propName in col) {
            if (propName[0] == "*") {
                hasPrimaryKey = true;
                propName = propName.slice(1);
                operations.push({ type: "put", key: key(colName, propName), value: "" }); // pk begin
                operations.push({ type: "put", key: key(colName, propName, KEY_END), value: "" }); // pk end
            }
        }
        operations.push({ type: "put", key: key(colName, KEY_END), value: "" }); // collection  end

        if (!hasPrimaryKey) throw error(`Unable to create store: collection ${colName} does not have primary key`);

        // [TODO] Check constraints in schema:
        // - unique keys on primitive attributes
        // - etc.

    }
    await this._db.batch(operations, {preventHA: true});

}



/**
 * Open the specified store.
 *
 * @param {Function} [cb] - Optional operation callback
 */
Store.prototype.open = async function (cb) {
    _log(`open()`);

    if (this._error) throw error('Unable to open store: store not initialized');
    if (this._db) throw error('Unable to open store: store already opened');

    try {

        // Open connection against the backend
        this._db = await this._driver.open(this._cfg.url, this._cfg);
        if (cb) cb();

    } catch (err) {

        if (this._db) this._db.close();
        delete this._db;

        if (cb) cb(error(err));
        throw error(err);
    }
};



/**
 * Close the store.
 *
 * @param {Function} cb - The operation callback
 */
Store.prototype.close = async function (cb) {
    _log('close()');

    if (!this._db) throw error('Unable to close the store: it is not open');
    await this._db.close();
    delete this._db;
    if (cb) cb();
};

/**
 * Insert the specified object.
 *
 * @param {string} colName - The collection name
 * @param {Object} data - The object to insert
 * @param {Function} cb - The operation callback
 */
Store.prototype.insert = async function (colName, data, cb) {
    _log(`insert(${colName},${JSON.stringify(data)})`);
    if (!colName) throw error('Unable to insert: collection name not specified');
    if (!data) throw error('Unable to insert: data not specified');
    if (!this._db) throw error('Unable to insert: store closed');
    if (!this._cfg.schema.collections[colName]) throw error(`Unable to insert: collection ${colName} not found`);

    var col = this._cfg.schema.collections[colName];

    // - check primary key
    if (col['*'] && util.isNullOrUndefined(data[col['*']])) throw error('Unable to insert: primary key attribute not set');

    // - check/convert data ?¿
    var safeData = {};
    Object.assign(safeData, data);
    /*for (var attName in data) {
        if (col[attName]) safeData[attName] = _mappers[col[attName]].to(data[attName]);
        else safeData[attName] = data[attName];
    }*/

    try {
        // - check unique indexes (primary key + additional)
        let promises = [];
        promises.push(this._db.get(key(colName, col['*'], _mappers[col[col["*"]]].prepare(safeData[col['*']]))));
        for (let indexedCol of col['+']) {
            if (safeData[indexedCol]) promises.push(this._db.get(key(colName, indexedCol, _mappers[col[indexedCol]].prepare(safeData[indexedCol]))));
        }

        // - if we obtain another object with the same key then notify duplicity
        let results = await Q.waitAll(promises);
        for (let res of results) {
            if (res) throw error("Unable to insert: duplicated key");
        }

        // Insert into collection
        let operations = [];
        // - primary key
        let primaryKey = key(colName, col["*"], _mappers[col[col["*"]]].prepare(safeData[col["*"]]));
        operations.push({ type: "put", key: primaryKey, value: _mappers[col[col["*"]]].to(safeData[col["*"]]) });
        // - regular properties
        for (let propName in safeData) {
            if (propName != col["*"]) operations.push({ type: "put", key: key(primaryKey, propName), value: _mappers[col[propName]].to(safeData[propName]) });
        }
        // - end of record
        operations.push({ type: "put", key: key(primaryKey, KEY_END), value: "" });

        // - secondary unique indexes
        for (let indexedProp of col["+"]) {
            if (safeData[indexedProp])
                operations.push({
                    type: "put",
                    key: key(colName, indexedProp, _mappers[col[indexedProp]].prepare(safeData[indexedProp])),
                    value: _mappers[col[col["*"]]].to(safeData[col["*"]])
                });
        }

        // - secondary non-unique indexes
        for (let indexedProp of col["-"]) {
            if (safeData[indexedProp]) {
                // - multivalued attribute
                let converter = col[indexedProp].slice(-2) == "[]" ? col[indexedProp].slice(0, -2) : col[indexedProp];
                let values = _.isArray(safeData[indexedProp]) ? safeData[indexedProp] : [safeData[indexedProp]];
                for (let value of values) {
                    operations.push({
                        type: "put",
                        key: key(colName, indexedProp, _mappers[converter].prepare(value), _mappers[col[col["*"]]].prepare(safeData[col["*"]])),
                        value: _mappers[col[col["*"]]].to(safeData[col["*"]])
                    });
                }

            }
        }

        // - execute batck operations
        await this._db.batch(operations);

        if (cb) cb();
    } catch (err) {
        console.log(err.stack);
        if (cb) cb(error(err));
        throw error(err);
    }

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
 * @param {string} [opts.seek] - Enables seek (keyset) search
 * @param {string} [opts.fields] - Comma-separated list of fields (fields prefixed by '-' are hidden)
 * @param {Function} cb - The operation callback. It returns the query results
 */
Store.prototype.search = async function (colName, query, opts, cb) {
    _log(`search(${colName},${JSON.stringify(query)},${JSON.stringify(opts)})`);

    if (!colName) throw error('Unable to search: collection name not specified');
    query = query || {};
    if (_.isFunction(query)) {
        cb = query;
        query = {};
    }
    opts = opts || {};
    if (_.isFunction(opts)) {
        cb = opts;
        opts = {};
    }
    if (!this._db) throw error('Unable to search: store closed');
    if (!this._cfg.schema.collections[colName]) throw error(`Unable to search: collection ${colName} not found`);

    // - get collection to consult
    let col = this._cfg.schema.collections[colName];

    // - prepare fields to obtain
    var fields;
    if (opts.fields) {
        // - classify fields to show/hide
        var _minus = [],
            _plus = [];
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

    } else {

        // - initialize with all fields
        fields = _.filter(Object.keys(col), function (attName) { return attName !== '*' && attName !== '+' && attName !== '-'; });
    }
    _log('- fields: ' + JSON.stringify(fields) + ',_minus: ' + JSON.stringify(_minus) + ',_plus: ' + JSON.stringify(_plus));


    // - prepare sort
    if (opts.orderBy) {
        if (opts.orderBy[0] !== '+' && opts.orderBy[0] !== '-') throw error('Wrong sort specification');
        if (!col[opts.orderBy.slice(1)]) throw error('Unable to sort by attribute ' + opts.orderBy.slice(1));
    }


    // 1. Process input query
    //
    // [TODO] check query is correct
    // - $eq-like and $gt-like operators only with primitive attributes
    // - $any, $all only with array attributes
    // - etc.

    // - prepare/check query
    let safeQuery = {};
    for (let attName in query) {
        if (_.isObject(query[attName])) {
            safeQuery[attName] = query[attName];
        } else {
            safeQuery[attName] = { "$eq": query[attName] };
        }
        for (let op in safeQuery[attName]) {
            if (["$eq", "$ne", "$in", "$gt", "$gte", "$lt", "$lte"].includes(op) && col[attName].slice(-2) == "[]")
                throw error(`Unable to search: query operator ${op} not supported on array-like attributes`);
            if (["$any", "$all"].includes(op) && col[attName].slice(-2) != "[]")
                throw error(`Unable to search: query operator ${op} not supported on non array-like attributes`);
            if (op == "$in") {
                if (!_.isArray(safeQuery[attName][op])) throw error(`Unable to search: operator ${op} requires array value`);
                for (let i = 0; i < safeQuery[attName][op].length; i++) {
                    safeQuery[attName][op][i] = _mappers[col[attName]].convert(safeQuery[attName][op][i]);
                }
            } else if (["$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$any", "$all"].includes(op)) {
                safeQuery[attName][op] = _mappers[col[attName]].convert(safeQuery[attName][op]);
            } else throw error(`Unable to search: query operator ${op} not supported`);

        }
    }

    _log(` - Safe query: ${JSON.stringify(safeQuery)}`);

    // Strategy (query planner): 
    // - we first identify the primary search method (it should be the subquery
    //   with more possibilities of obtaining the smallest results)
    //   priority 1: primary index with $eq, $in
    //   priority 2: secondary index with $eq, $in, $all, $any
    //   priority 3: primary index with $gt, $gte, $lt, $lte
    //   priority 4: secondary index with $gt, $gte, $lt, $lte
    //   priority 5: primary/secondary index with $ne, $nin or no index (full scan)
    // - the primary search method should provide a collection of ids to check
    // - for each id the remainder subqueries are checked

    // Identify indexes included in query, and assign priority
    let indexes = [];
    for (let attName in safeQuery) {
        for (let op in safeQuery[attName]) {
            if (attName == col["*"] && ["$eq", "$in"].includes(op)) {
                indexes.push({
                    priority: 1,
                    att: attName,
                    op: op,
                    sort: opts.orderBy && opts.orderBy.endsWith(attName)
                });
            } else if ((col['+'].includes(attName) || col['-'].includes(attName)) && ["$eq", "$in", "$all", "$any"].includes(op)) {
                indexes.push({
                    priority: 2,
                    att: attName,
                    op: op,
                    sort: opts.orderBy && opts.orderBy.endsWith(attName)
                });
            } else if (attName == col["*"] && ["$gt", "$gte", "$lt", "$lte"].includes(op)) {
                // - compact ranges
                let index = _.find(indexes, (i => i.att == attName && i.priority == 3));
                if (index) {
                    index.op = [index.op, op];
                } else {
                    indexes.push({
                        priority: 3,
                        att: attName,
                        op: op,
                        sort: opts.orderBy && opts.orderBy.endsWith(attName)
                    });
                }
            } else if ((col['+'].includes(attName) || col['-'].includes(attName)) && ["$gt", "$gte", "$lt", "$lte"].includes(op)) {
                // - compact ranges
                let index = _.find(indexes, (i => i.att == attName && i.priority == 4));
                if (index) {
                    index.op = [index.op, op];
                } else {
                    indexes.push({
                        priority: 4,
                        att: attName,
                        op: op,
                        sort: opts.orderBy && opts.orderBy.endsWith(attName)
                    });
                }
            }

        }
    }

    // Sort indexes by priority
    indexes.sort((i1, i2) => { return i1.priority > i2.priority ? 1 : -1 });

    _log(` - Indexes: ${JSON.stringify(indexes)}`);

    let seek, results = [];
    if (indexes.length && [1, 2].includes(indexes[0].priority)) {
        _log(" - primary/secondary $eq-like index");

        // - primary/secondary index with $eq-like operator
        let values = _.isArray(safeQuery[indexes[0].att][indexes[0].op]) ? safeQuery[indexes[0].att][indexes[0].op] : [safeQuery[indexes[0].att][indexes[0].op]];

        // - if $all operator then we obtain only the first element, and then _objectMatch makes the rest
        if (indexes[0].op == "$all") values = [values[0]];

        for (let value of values) {
            let scanOpts = {
                gte: opts.seek || key(colName, indexes[0].att, _mappers[col[indexes[0].att]].prepare(value))
            };
            let iterator = this._db.iterator(scanOpts);
            let obj, more = true,
                count = 0;
            do {
                obj = await this._nextObject(iterator, colName, indexes[0].att, value);
                if (obj) {
                    // - avoid repetitions
                    if (!results.find((elem) => elem[col["*"]] == obj[col["*"]])) {
                        if (this._objectMatch(obj, safeQuery)) {
                            if (!opts.offset || opts.offset <= count) results.push(obj);
                            count++;
                        }
                        if (opts.limit && opts.limit == results.length) more = false;
                    }
                } else more = false;
            } while (more);
            // - set follow-up seek
            if (obj) {
                seek = await iterator.next();
                if (seek) seek = seek.key.toString();
            }
            /* await */
            await iterator.end();
            if (opts.limit && opts.limit == results.length) break;
        }
    } else if (indexes.length && [3, 4].includes(indexes[0].priority)) {
        _log(" - primary/secondary $gt-like index");
        // - primary/secondary index with $gt-like operator
        let scanOpts = {};
        // - ranges?
        let ops = _.isArray(indexes[0].op) ? indexes[0].op : [indexes[0].op];
        for (let op of ops) {
            // - set iterator ranges
            if (indexes[0].att == col["*"] && op == "$lte") {
                // - if pk then direct lookup, modify ranges
                scanOpts[op.slice(1)] = key(colName, indexes[0].att, _mappers[col[indexes[0].att]].prepare(safeQuery[indexes[0].att][op]), KEY_END);
            } else {
                scanOpts[op.slice(1)] = key(colName, indexes[0].att, _mappers[col[indexes[0].att]].prepare(safeQuery[indexes[0].att][op]));
            }
            //-  set min limit
            if (["$lt", "$lte"].includes(op)) {
                if (!ops.includes("$gt") && !ops.includes("$gte"))
                    scanOpts.gt = key(colName, indexes[0].att);
            }
        }
        if (opts.seek) {
            delete scanOpts.gt;
            scanOpts.gte = opts.seek;
        }

        let iterator = this._db.iterator(scanOpts);
        let obj, more = true,
            count = 0;
        do {
            obj = await this._nextObject(iterator, colName, indexes[0].att);
            if (obj) {
                if (this._objectMatch(obj, safeQuery)) {
                    if (!opts.offset || opts.offset <= count) results.push(obj);
                    count++;
                }
                if (opts.limit && opts.limit == results.length) more = false;
            } else more = false;
        } while (more);
        // - set follow-up seek
        if (obj) {
            seek = await iterator.next();
            if (seek) seek = seek.key.toString();
        }
        /* await */
        iterator.end();
    } else {
        _log(" - no relevant indexes: full scan");
        // - no appropriate index, perform full scan on collection
        let scanOpts = {
            gt: key(colName, col["*"]),
            lt: key(colName, col["*"], KEY_END),
            reverse: opts.orderBy == `-${col["*"]}`
        };
        if (opts.seek) {
            delete scanOpts.gt;
            scanOpts.gte = opts.seek;
        }
        let iterator = this._db.iterator(scanOpts);
        let obj, more = true,
            count = 0;
        do {
            obj = await this._nextObject(iterator, colName);
            if (obj) {
                // - check additional subqueries
                if (this._objectMatch(obj, safeQuery)) {
                    if (!opts.offset || opts.offset <= count) results.push(obj);
                    count++;
                }
                more = !opts.limit || results.length < opts.limit;
            } else more = false;
        } while (more);
        // - set follow-up seek
        if (obj) {
            seek = await iterator.next();
            if (seek) seek = seek.key.toString();
        }
        // - close iterator
        /* await */
        iterator.end();

    }

    // -------- Check locks ---------
    if (opts.lock || opts.unlock) {
        let locks = [];
        let err;
        for (let result of results) {
            let lock = this._locks[`${colName}.${result[col["*"]]}`];
            if (opts.lock &&
                lock &&
                Date.now() - lock.ts < LOCK_TIMEOUT &&
                lock.id != opts.lock) {
                err = error('Unable to acquire/release lock');
                break;
            }
            if (opts.lock) {
                this._locks[`${colName}.${result[col["*"]]}`] = {
                    id: opts.lock,
                    ts: Date.now()
                };
                locks.push(`${colName}.${result[col["*"]]}`);
            } else if (opts.unlock) {
                delete this._locks[`${colName}.${result[col["*"]]}`];
            }
        }
        if (err && opts.lock) {
            for (let lock of locks) delete this._locks[lock];
            throw err;
        }
    }

    return opts.hasOwnProperty("seek") ?
        { seek: seek, results: results } :
        results;
    /*return Q(
        opts.hasOwnProperty("seek") ? { seek: seek, results: results } :
        results
    ).nodeify(cb);*/

};

/**
 * Checks whether the object matches the specified query.
 * 
 * @param {Object} obj - The object to check
 * @param {Object} query - The query to match
 */
Store.prototype._objectMatch = function (obj, query) {
    //_log(`_objectMatch(${JSON.stringify(obj)},${JSON.stringify(query)})`);

    query = query || {};
    let match = true;
    for (let attName in query) {
        for (let op in query[attName]) {
            let value = query[attName][op];
            switch (op) {
                case "$eq":
                    match = obj[attName] == value;
                    break;
                case "$ne":
                    match = obj[attName] != value;
                    break;
                case "$gt":
                    match = obj[attName] > value;
                    break;
                case "$gte":
                    match = obj[attName] >= value;
                    break;
                case "$lt":
                    match = obj[attName] < value;
                    break;
                case "$lte":
                    match = obj[attName] <= value;
                    break;
                case "$in":
                    match = value.includes(obj[attName]);
                    break;
                case "$nin":
                    match = !value.includes(obj[attName]);
                    break;
                case "$all":
                    for (let val of value) {
                        match = obj[attName].includes(val);
                        if (!match) break;
                    }
                    break;
                case "$any":
                    for (let val of value) {
                        match = obj[attName].includes(val);
                        if (match) break;
                    }
                    break;
                default:
                    throw new Error(`Query operator ${op} not supported`);
            }
            if (!match) break;
        }
        if (!match) break;
    }
    return match;
};


/**
 * Obtain the next object of the specified collection from the
 * specified iterator.
 * 
 * @param {Object} iterator - The source iterator
 * @param {string} colName - The collection name
 * @param {string} [indexName] - The index name. Primary key if omitted 
 * @param {string} [indexValue] - The index value
 */
Store.prototype._nextObject = async function (iterator, colName, indexName, indexValue) {
    //_log(`_nextObject(${colName},${indexName},${indexValue})`);

    let col = this._cfg.schema.collections[colName];
    indexName = indexName || col["*"];
    try {
        let entry = await iterator.next();
        if (entry) {
            // Parse key
            let k = entry.key.toString().split(KEY_SEP).slice(1); // remove first ""

            // End of collection?
            if (k.length < 3 || k[0] != colName || k[1] != indexName ||
                (indexValue && k[2] != indexValue) ||
                (!iterator.opts.reverse && k[2] == KEY_END)) return undefined;

            // New object present            
            let obj = {};
            if (indexName != col["*"]) {
                // if secondary index, then obtain ref and reset data to obtain object data
                let id = _mappers[col[col["*"]]].from(entry.value);
                let opts = {
                    gte: key(colName, col["*"], id),
                    lte: key(colName, col["*"], id, KEY_END)
                };
                iterator = this._db.iterator(opts);
                entry = await iterator.next();
                /*// Detect dead ref?
                k = entry.key.toString().split(KEY_SEP).slice(1); // remove first ""
                if (k.length < 3 || k[0] != colName || k[1] != indexName ||
                    (indexValue && k[2] != indexValue) ||
                    (!iterator.opts.reverse && k[2] == KEY_END)) return undefined;*/

            }

            // - if forward iterator then get primary key
            if (!iterator.opts.reverse) obj[col["*"]] = _mappers[col[col["*"]]].from(entry.value);

            // - feed object with remainder properties
            let more = true;
            do {
                entry = await iterator.next();
                if (entry) {
                    k = entry.key.toString().split(KEY_SEP).slice(1);
                    if (k[0] != colName || k[1] != col["*"] || k[2] == KEY_END) more = false;
                    else if (!iterator.opts.reverse && k[3] == KEY_END) more = false;
                    else if (iterator.opts.reverse && k.length <= 3) {
                        // - if reverse iterator then get primary key
                        obj[col["*"]] = _mappers[col[col["*"]]].from(entry.value);
                        more = false; // beginning of object
                    }
                    if (more) obj[k[3]] = _mappers[col[k[3]]].from(entry.value);
                } else more = false;
            } while (more);

            if (indexName != col["*"]) {
                // if secondary index, then close add-hoc iterator
                /* await */
                await iterator.end();
            }

            return obj;

        } else {
            return null;
        }
    } catch (err) {
        return Q.reject(error(err));
    }

};


/**
 * Obtain the object with the specified primary key.
 * 
 * @param {string} colName - The collection name
 * @param {string} id - The searched identifier 
 *
Store.prototype._findObjectByPrimaryKey = async function (colName, id) {
    _log(`START _searchByPrimaryKey(${colName},${id})`);

    try {
        let col = this._cfg.schema.collections[colName];

        let opts = {
            gte: key(colName, col["*"], id),
            lte: key(colName, col["*"], id, KEY_END)
        };

        // retrieve iterator from key-value store
        let iterator = this._db.iterator(opts);

        // retrieve unique object
        let obj = await this._nextObject(iterator, colName);

        // close iterator
        //let end = Q.denodeify(iterator.end.bind(iterator));
        /*await iterator.end();

        return obj;

    } catch (err) {
        return Q.reject(error(err));
    }

};*/


/**
 * Update the specified object with the specified data.
 *
 * @param {string} colName - The collection name
 * @param {Object} data - The data to update
 * @param {Object} query - The query to select the objects to update
 * @param {Object} [opts] - Optional parameters
 * @param {string} [opts.lock] - Set a lock on query results
 * @param {string} [opts.unlock] - Unset lock on query results
 * @param {Function} cb - The operation callback
 */
Store.prototype.update = async function (colName, query, data, opts, cb) {
    _log(`update(${colName},${JSON.stringify(query)},${JSON.stringify(data)},${JSON.stringify(opts)})`);

    if (!colName) throw error('Unable to update: collection name not specified');
    if (!query) throw error('Unable to update: query not specified');
    if (!data || Object.keys(data).length === 0) throw error('Unable to update: data to update not specified');

    if (opts && _.isFunction(opts)) {
        cb = opts;
        opts = {};
    }
    opts = opts || {};

    if (!this._db) throw error('Unable to update: store closed');
    if (!this._cfg.schema.collections[colName]) throw error(`Unable to update: collection ${colName} not found`);

    let col = this._cfg.schema.collections[colName];

    // Check data
    if (data.hasOwnProperty(col["*"])) throw error(`Unable to update: primary key ${col["*"]} can not be updated`);

    /*// Convert data
    //
    var safeData = {};
    for (let attName in data) {
        if (col[attName]) safeData[attName] = _mappers[col[attName]].to(data[attName]);
        else safeData[attName] = data[attName];
    }*/

    try {

        // Search objects
        let results = await this.search(colName, query, opts);
        for (obj of results) {
            // Update each object atomically
            let operations = [];
            for (let attName in data) {
                // - update primary index
                operations.push({
                    type: "put",
                    key: key(colName, col["*"], _mappers[col[col["*"]]].prepare(obj[col["*"]]), attName),
                    value: _mappers[col[attName]].to(data[attName])
                });

                // - update secondary unique indexes
                if (col["+"].includes(attName)) {
                    // - get object with the new value
                    if (data[attName] != null) {
                        let id = await this._db.get(key(colName, attName, _mappers[col[attName]].prepare(data[attName])));
                        if (id) throw error(`Unable to update: duplicated unique key ${attName}`);
                    }
                    if (obj[attName]) {
                        // - if previous value, then delete
                        operations.push({
                            type: "del",
                            key: key(colName, attName, _mappers[col[attName]].prepare(obj[attName]))
                        });
                    }
                    if (data[attName] != null) {
                        operations.push({
                            type: "put",
                            key: key(colName, attName, _mappers[col[attName]].prepare(data[attName])),
                            value: _mappers[col[col["*"]]].prepare(obj[col["*"]])
                        });
                    }
                }

                // - update secondary non-unique indexes
                if (col["-"].includes(attName)) {
                    if (obj[attName]) {
                        // - if previous value/s, then delete
                        // [TODO] intelligent update on multivalued atts??
                        let values = _.isArray(obj[attName]) ? obj[attName] : [obj[attName]];
                        for (let value of values) {
                            operations.push({
                                type: "del",
                                key: key(colName, attName, _mappers[col[attName]].prepare(value), _mappers[col[col["*"]]].prepare(obj[col["*"]]))
                            });
                        }
                    }
                    if (data[attName] != null) {
                        let values = _.isArray(data[attName]) ? data[attName] : [data[attName]];
                        for (let value of values) {
                            let converter = col[attName].slice(-2) == "[]" ? col[attName].slice(0, -2) : col[attName];
                            operations.push({
                                type: "put",
                                key: key(colName, attName, _mappers[converter].prepare(value), _mappers[col[col["*"]]].prepare(obj[col["*"]])),
                                value: _mappers[col[col["*"]]].prepare(obj[col["*"]])
                            });
                        }
                    }
                }

            }
            await this._db.batch(operations);
        }
        if (cb) cb();

    } catch (err) {
        if (cb) cb(error(err));
        throw error(err);
    }

};

/**
 * Delete the specified object from the datastore.
 *
 * @param {string} colName - The collection name
 * @param {string} query - The query to select the objects to delete
 * @param {Function} cb - The operation callback
 */
Store.prototype.delete = async function (colName, query, cb) {
    _log(`delete(${colName},${JSON.stringify(query)})`);

    if (!colName) throw error('Unable to delete: collection name not specified');
    if (_.isFunction(query)) {
        cb = query;
        query = undefined;
    }
    query = query || {};

    if (!this._db) throw error('Unable to delete: store closed');
    if (!this._cfg.schema.collections[colName]) throw error(`Unable to delete: collection ${colName} not found`);

    let col = this._cfg.schema.collections[colName];
    try {
        // Search objects
        let results = await this.search(colName, query);
        for (obj of results) {
            // Delete everything
            let operations = [];

            let primaryKey = key(colName, col["*"], _mappers[col[col["*"]]].prepare(obj[col["*"]]));

            // We begin with primary index
            operations.push({ type: "del", key: primaryKey }); // record beginning
            for (let attName in obj) {
                operations.push({ type: "del", key: key(primaryKey, attName) });
            }
            // - end of record
            operations.push({ type: "del", key: key(primaryKey, KEY_END) });

            // - secondary unique indexes
            for (let attName of col["+"]) {
                if (obj[attName]) {
                    operations.push({
                        type: "del",
                        key: key(colName, attName, _mappers[col[attName]].prepare(obj[attName]))
                    });
                }
            }

            // - secondary non-unique indexes
            for (let attName of col["-"]) {
                if (obj[attName]) {
                    let values = _.isArray(obj[attName]) ? obj[attName] : [obj[attName]];
                    for (let value of values) {
                        operations.push({
                            type: "del",
                            key: key(colName, attName, _mappers[col[attName]].prepare(value), _mappers[col[col["*"]]].prepare(obj[col["*"]]))
                        });
                    }
                }
            }
            await this._db.batch(operations);
        }
        if (cb) cb();

    } catch (err) {
        if (cb) cb(error(err));
        throw error(err);
    }

};

/**
 * Execute native command.
 * 
 * @param {String} cmdName - The command name
 * @param {*} cmdData - The command data
 */
Store.prototype.execute = async function (cmdName, cmdData) {
    _log(`execute(${cmdName},${JSON.stringify(cmdData)})`);

    if (!this._db) throw error('Unable to execute command: store closed');
    if (this._db.execute) await this._db.execute(cmdName, cmdData);

}



/**
 * Destroy the store.
 *
 * @param {Function} cb - The operation callback
 */
Store.prototype.drop = function (cb) { };

/**
 * Create a backup of the store.
 * 
 * @param {Function} cb - The operation callback. It returns the backup in JSON format
 */
Store.prototype.backup = function (cb) { };

/**
 * Restore the specified bckup.
 * 
 * @param {string} backup - The backup in JSON format
 * @param {Function} cb - The operation callback
 */
Store.prototype.restore = function (backup, cb) { };

module.exports = async (url, opts, cb) => {
    if (_.isFunction(opts)) {
        cb = opts;
        opts = undefined;
    }
    opts = opts || {};
    opts.url = url;

    // Create store
    let st = new Store(opts);

    // Initialize store
    await st.init();

    if (cb) cb(null, st);
    return st;

}