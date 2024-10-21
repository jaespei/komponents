/**
 * Utilities related with command execution.
 *
 * @author Javier Esparza Peidro <jesparza@dsic.upv.es>
 */

// standard dependencies
//
var child_process = require('child_process');
var util = require('util');

// external dependencies
//
var Q = require('q');
var _ = require('lodash');

// internal dependencies
//
var name = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : (process.env.INSTANCE_ID ? process.env.INSTANCE_ID : null);
var _log = require('./log').logger('cmd' + (name ? '<' + name + '>' : ''), { enabled: true, print: true });
var _uuid = require('./uuid').uuid;
var error = require('./error');

/**
 * Generic callback used for returning an operation result.
 *
 * @callback OperationCallback
 * @param {Object} error - If any error arises
 * @param {*} result -
 */

/**
 * Executes a command in the command-line shell. The command is supposed to launch
 * a daemon.
 *
 * @param {string} cmd - The command to execute
 * @return {string} The launched process pid
 */
function _daemon(cmd) {
    _log('_daemon(' + cmd + ')');

    return child_process.exec(cmd).pid;

}

/**
 * Executes a command in the command-line shell. The same commands are executed sequentially using
 * FIFO order.
 *
 * Support for locking commands.
 *
 * @param {string} cmd - The command to execute
 * @param {Object} [cfg] - The command configuration
 * @param {boolean} [cfg.lock] - Lock the operation
 * @param {OperationCallback} cb - The operation callback
 * @return {Object} The lock object, if specified
 */
function _run(cmd, cfg, cb) {

    _log('START _run(' + cmd + ')');

    if (!cmd) throw error('Unable to execute command: command not specified');

    if (util.isArray(cmd)) cmd = cmd.join(' && ');

    if (cfg && util.isFunction(cfg)) {
        cb = cfg;
        cfg = null;
    }
    cfg = cfg || {};

    // - check whether the command can be executed
    //
    var processor = function (command, err, stdout, stderr) {

        _log('END _run(' + command.cmd + ') ' + (err ? 'ERROR' : 'SUCCESS'));

        // - remove command from the queue
        //
        var index = _.findIndex(_commands[binary], function (item) { return item.id == command.id; });
        _commands[binary].splice(index, 1);
        _commands[binary].running = false;

        _log('_COMMANDS: ' + _.keys(_commands));
        _log('_QUEUE[' + binary + ']: ' + _.map(_commands[binary], (cmd) => {
            return JSON.stringify({ id: cmd.id, cmd: cmd.cmd, lock: !!cmd.lock });
        }));

        // - if new lock then ...
        //
        var newCommand;
        if (!_commands[binary].lock && command.lock) {

            _commands[binary].lock = command.lock;

            // - check whether other 'privileged' commands are waiting
            //
            newCommand = _.find(_commands[binary], function (_command) { return (_command.lock && _command.lock.id == _commands[binary].lock.id); });
            if (newCommand) {
                _commands[binary].running = true;
                child_process.exec(newCommand.cmd, function (err, stdout, stderr) {
                    processor(newCommand, err, stdout, stderr);
                });
            }

            // - register lock listener
            //
            _commands[binary].lock.promise.then(function (res) {

                delete _commands[binary].lock;

                if (_commands[binary].running) return;
                else {
                    if (_commands[binary].length > 0) {
                        newCommand = _commands[binary][0];
                        _commands[binary].running = true;
                        child_process.exec(newCommand.cmd, function (err, stdout, stderr) {
                            processor(newCommand, err, stdout, stderr);
                        });
                    } else delete _commands[binary];
                }
            });

        } else if (_commands[binary].lock) {

            // - check whether other 'privileged' commands are waiting
            //
            newCommand = _.find(_commands[binary], function (_command) { return (_command.lock && _command.lock.id == _commands[binary].lock.id); });
            if (newCommand) {
                _commands[binary].running = true;
                child_process.exec(newCommand.cmd, function (err, stdout, stderr) {
                    processor(newCommand, err, stdout, stderr);
                });
            }

        } else {

            if (_commands[binary].length > 0) {
                newCommand = _commands[binary][0];
                _commands[binary].running = true;
                child_process.exec(newCommand.cmd, function (err, stdout, stderr) {
                    processor(newCommand, err, stdout, stderr);
                });
            } else delete _commands[binary];

        }

        if (err && command.cb) command.cb(error('STDOUT: ' + stdout + ', STDERR: ' + stderr, err), null);
        else if (command.cb) command.cb(null, stdout);

    };

    var lock;
    if (cfg.lock) {
        if (util.isBoolean(cfg.lock)) {
            lock = Q.defer();
            lock.id = _uuid();
        } else {
            lock = cfg.lock;
        }
    }

    // - get binary of command
    //
    var binary = cfg.binary || cmd.split(' ')[0];
    var command = { id: _uuid(), cmd: cmd, lock: lock, cb: cb };

    // - insert into queue
    //
    if (_commands[binary]) _commands[binary].push(command);
    else _commands[binary] = [command];

    _log('_COMMANDS: ' + _.keys(_commands));
    _log('_QUEUE[' + binary + ']: ' + _.map(_commands[binary], (cmd) => {
        return JSON.stringify({ id: cmd.id, cmd: cmd.cmd, lock: !!cmd.lock });
    }));


    if (!_commands[binary].running) {
        _log('not running');
        if (!_commands[binary].lock || (command.lock && command.lock.id == _commands[binary].lock.id)) {
            _commands[binary].running = true;
            _log('command ' + command.cmd + ' launched for processing');
            child_process.exec(command.cmd, function (err, stdout, stderr) {
                processor(command, err, stdout, stderr);
            });
        }
    }

    return lock;
}

var _commands = {};
_run.commands = _commands;

exports.run = _run;
exports.daemon = _daemon;
