/**
 * Utilities related with the Q promises library.
 *
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
var util = require('util');

// External dependencies
//
var Q = require('q');
var _ = require('lodash');

/*function MyQ() {
    Q.call(this);
}
util.inherits(MyQ, Q);

MyQ.prototype.waitAll = function(promises) {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises, function(settleds) {
        _.forEach(settleds, function(settled) {
            if (settled.state == 'rejected') deferred.reject(settled.reason);
            else results.push(settled.value);
        });
        if (deferred.state == 'pending') deferred.resolve(results);
    });
    return deferred.promise;
};*/

// support for long stack traces
//
Q.longStackSupport = true;

Q.waitAll = function(promises) {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then(function(snapshots) {
        _.forEach(snapshots, function(snapshot) {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};

module.exports = Q;
