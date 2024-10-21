/**
 * Internal sub-API for enabling LevelDB-compliant key-value stores access. 
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
const Q = require('q');
const levelup = require('levelup');
const asyncResult = require('utils').asyncResult;

const name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
const _log = require('utils').logger('store.level' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
const error = require('utils').error;

/**
 * Open a new connection against the key-value store.
 * 
 * @param {string} url - The database URL
 */
async function open(url, opts, cb) {
    _log(`open(${url})`);

    let index, con = {};
    if ((index = url.indexOf(":")) != -1) {
        con.type = url.slice(0, index);
        con.type = con.type == "level" ? "leveldown" : con.type;
        con.url = url.slice(index + 1);
    } else {
        con.type = "leveldown";
        con.url = url;
    }

    let engine = require(con.type);
    
    let deferred = Q.defer();
    levelup(engine(con.url), (err, db) => {
        if (err) deferred.reject(error(err));
        else {
            // we wrap the connection, and modify methods conveniently
            // - get() will not throw any error if the key is not found, it will 
            //   just return undefined
            // - iterator() must return async iterators
            // - each iterator stores its opts (the reverse property is important)
            // - iterator.next() must return one single successful parameter instead 
            //   of two (key,value)

            con.db = db;
            Object.assign(con, {
                put: con.db.put.bind(con.db),
                get: async(key, opts, cb) => {
                    let value;
                    try {
                        value = await con.db.get(key, opts, cb);
                    } catch (err) {
                        if (!err.notFound) throw error(err);
                    }
                    return value;
                },
                del: con.db.del.bind(con.db),
                batch: con.db.batch.bind(con.db),
                iterator: (opts) => {
                    //_log(`iterator(${JSON.stringify(opts)})`);
                    let it = con.db.iterator(opts);
                    return {
                        it: it,
                        opts: opts,
                        next: cb => {
                            let deferred = Q.defer();
                            it.next((err, key, value) => {
                                //_log('it.next()');
                                if (err) deferred.reject(error(err));
                                else if (!err && !key) deferred.resolve();
                                else deferred.resolve({ key: key, value: value });
                                //_log(`end it.next() ${err? err.message: key && key.toString()}`);
                            });
                            return deferred.promise.nodeify(cb);
                        },
                        seek: it.seek.bind(it),
                        end: cb => {
                            let deferred = Q.defer();
                            it.end(err => {
                                if (err) deferred.reject(error(err));
                                deferred.resolve();
                            });
                            return deferred.promise.nodeify(cb);
                        }
                    };
                },
                close: con.db.close.bind(con.db),
            });
            deferred.resolve(con);
        }
    });
    return deferred.promise.nodeify(cb);
}


exports.open = open;