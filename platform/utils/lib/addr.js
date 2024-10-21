/**
 * Utilities related with inet address generation.
 *
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// Standard dependencies
var util = require('util');

// External dependencies
//
var ip = require('ip');
var _ = require('lodash');

/**
 * Generates a random private subnet.
 *
 * @param {Object} [cfg] - Configuration object
 * @param {Array<string>} [cfg.exceptions] - List of subnets to avoid
 * @param {number} [cfg.prefix] - The prefix length, the number of leading 1-bits
 * @param {Array<string>} [cfg.subnets] - List of available private subnets in CIDR format. By default
 *                                        10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 are used
 * @param {number} [cfg.trials] - Max trials before finding an available subnet
 * @return {string} The generated subnet in CIDR format
 */
function _randsubnet(cfg) {

    cfg = cfg? cfg: {};
    cfg.exceptions = cfg.exceptions? cfg.exceptions: [];
    cfg.trials = cfg.trials? cfg.trials: 10;

    // 1. Check subnets to pick from
    if (!cfg.subnets) cfg.subnets = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
    cfg.subnets.forEach(function(subnet) {
        ip.cidrSubnet(subnet); // throw new Error('Unable to obtain subnet: wrong subnet specification ' + subnet);
    });

    // 2. Check prefix
    if (!cfg.prefix) cfg.prefix = 16;
    if (!util.isNumber(cfg.prefix)) throw new Error('Unable to obtain subnet: the specified prefix is not a number');

    // 3. Check exceptions
    if (!cfg.exceptions) cfg.exceptions = [];
    cfg.subnets.forEach(function(subnet) {
        ip.cidrSubnet(subnet); //) throw new Error('Unable to obtain subnet: wrong subnet specification ' + subnet);
    });

    // 4. Find available subnet
    for (var i = 0; i < cfg.subnets.length; i++) {
        var subnet = cfg.subnets[i];

        // - consider this subnet only if more generic than required
        if (ip.cidrSubnet(subnet).subnetMaskLength > cfg.prefix) {
            continue;
        }

        // - now check exceptions
        var supernet = _.find(cfg.exceptions, function(exception) { return _contains(exception, subnet); });
        if (supernet) {
            continue;
        }

        // - select a specific net in the range
        var result, fixedBits, rangeBits, range, num;
        fixedBits = ip.cidrSubnet(subnet).subnetMaskLength;
        rangeBits = cfg.prefix - fixedBits;
        range = Math.pow(2, rangeBits);

        var trials = 0;
        do {
            num = Math.floor(range*Math.random());
            result = ip.fromLong(ip.toLong(ip.cidr(subnet) + num*Math.pow(2, 32-fixedBits-rangeBits))) + '/' + cfg.prefix;
            trials++;
        } while (trials < cfg.trials && _.find(cfg.exceptions, function(exception) { return _contains(exception, result) || _contains(result, exception); }));

        if (trials < cfg.trials) return result;

    }

     throw new Error('Unable to obtain subnet: no available subnet was found');

}

function _binary(addr, len) {
    len = len? len: 32;
    var dec = ip.toLong(addr);
    var out = "";
    while(len) {
        if (len % 8 === 0) out += ' ';
        out += (dec >> --len) & 1;
    }
    return out.substring(1);
    //return Number(ip.toLong(addr)).toString(2);
}

/**
 * Calculates the AND operation of two addresses.
 *
 * @param  {string} addr1 - The first address
 * @param  {string} addr2 - The second address
 * @return {string} the result
 */
function _and(addr1, addr2) {

    addr1 = addr1.indexOf('/') != -1? ip.cidr(addr1): addr1;
    addr2 = addr2.indexOf('/') != -1? ip.cidr(addr2): addr2;

    return ip.not(ip.or(ip.not(addr1), ip.not(addr2)));

}

/**
 * Determines whether the first subnet is contained within the second subnet
 *
 * @param  {string} subnet1 - The first subnet
 * @param  {string} subnet2 - The second subnet
 * @return {boolean} true/false
 */
function _contains(subnet1, subnet2) {

    var cidr1 = ip.cidrSubnet(subnet1);
    var cidr2 = ip.cidrSubnet(subnet2);

    return ip.mask(ip.cidr(subnet2), ip.fromPrefixLen(cidr1.subnetMaskLength)) == ip.cidr(subnet1) &&
           cidr1.subnetMaskLength <= cidr2.subnetMaskLength;

}

/**
 * Generates a random ip address contained in the specified net
 *
 * @param {string} net - A subnet in cidr format
 * @param {Object} [cfg] - Configuration object
 * @param {Array<string>} [cfg.exceptions] - Addresses to avoid
 * @param {number} [cfg.trials] - Max trials before finding an available address
 * @return {string} The generated address
 */
function _randaddr(net, cfg) {

    if (!net) throw new Error('Unable to generate address: subnet not specified');

    cfg = cfg? cfg: {};
    cfg.exceptions = cfg.exceptions? cfg.exceptions: [];
    cfg.trials = cfg.trials? cfg.trials: 10;

    var subnet = ip.cidrSubnet(net);
    var addr, trial = 0;
    do {

        var firstAddr = ip.toLong(subnet.firstAddress);
        var lastAddr = ip.toLong(subnet.lastAddress);

        addr = ip.fromLong(firstAddr + Math.floor(Math.random() * (lastAddr - firstAddr)));

        /*var firstAddr = _.map(subnet.firstAddress.split('.'), function(str) { return Number(str); });
        var lastAddr = _.map(subnet.lastAddress.split('.'), function(str) { return Number(str); });

        var i = 0;
        while (firstAddr[i] == lastAddr[i] && i < 4) {
            addr[i] = firstAddr[i];
            i++;
        }

        if (i == 4) throw new Error('Unable to generate random address: no range is available');
        addr[i] = Math.floor(Math.random() * (lastAddr[i] - firstAddr[i] + 1)) + firstAddr[i];

        for (var j = ++i; j < firstAddr.length; j++) {
            addr[j] = Math.floor(Math.random() * 256);
        }*/

        trial++;

    } while (cfg.exceptions.indexOf(addr) != -1 && (!cfg.trials || trial <= cfg.trials));

    if (cfg.exceptions.indexOf(addr) != -1) throw new Error('Unable to generate random address');

    return addr;
}


exports.randaddr = _randaddr;
exports.randsubnet = _randsubnet;
exports.contains = _contains;
exports.and = _and;
exports.binary = _binary;
