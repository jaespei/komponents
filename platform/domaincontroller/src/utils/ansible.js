//const NodeAnsible = require("node-ansible");
const child_process = require("child_process");
const path = require("path");
const Q = require("q");
const _ = require("lodash");

let error = (msg, code, cause) => {
    if (msg && !_.isString(msg)) { cause = msg; msg = code = undefined; }
    if (code && !_.isString(code)) { cause = code; code = undefined; }
    let err = new Error(msg);
    err.code = code;
    err.cause = cause;
    err.stack = cause && cause.stack ? err.stack + "\n" + cause.stack : err.stack;
    return err;
}

/**
 * Ansible wrapper.
 */
class Ansible {

    /**
     * Initialize the Ansible wrapper.
     * 
     * @param {Object} [opts] - Ansible options
     * @param {string} [opts.pathHome] - The Ansible home path (where the exec is performed)
     * @param {string} [opts.pathPlaybooks] - The playbooks path
     * @param {string} [opts.resultKey] - The playbooks specific results key
     */
    constructor(opts) {
        this.opts = opts || {};
        this.log = opts.log || ((msg) => console.log("[Ansible] " + msg));
        this.error = opts.error || error;
        this.pathHome = this.opts.pathHome || path.join(module.path, "ansible");
        this.pathPlaybooks = this.opts.pathPlaybooks || path.join(this.pathHome, "playbooks");
        this.resultKey = this.opts.resultKey || "KOMPONENTS_RESULT";
    }

    /**
     * Execute an adhoc task.
     * 
     * @param {*} cmd 
     *
    async adhoc(cmd) {
        let command = new NodeAnsible.AdHoc()
    }*/

    /**
     * Execute a playbook.
     * 
     * @param {string} name - The playbook name
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.path] - Playbook folder
     * @param {Object} [opts.vars] - Variables
     * @param {string} [opts.privateKey] - The SSH private key path
     * @param {string|Array<string>} [opts.hosts] - The target host/s 
     * @param {string|Array<string>} [opts.inventory] - The inventory (path or list of hosts)
     * @param {string} [opts.connection] - The connection type
     * @return {Object} The result of the operation, with fields .stdout, .stderr. Field 
     *                  .result is also set if the playbook includes an aggregated result
     */
    async playbook(name, opts) {
        this.log(`playbook(${name}, ${JSON.stringify(opts)})`);

        opts = opts || {};

        let cmd = ["ansible-playbook"];

        // Process options
        /*if (opts.hosts) {
            let hosts = _.isArray(opts.hosts)? opts.hosts.join(":"): opts.hosts;
            cmd.push("-e", `'komponents_hosts="${hosts}"'`);
        }
        if (opts.inventory) {
            if (_.isArray(opts.inventory)) opts.inventory = opts.inventory.join(",") + ",";
            cmd.push("-i", opts.inventory);
        } else if (opts.hosts) {
            // If adhoc hosts then force inventory to match 
            // target hosts
            let inventory =  _.isArray(opts.hosts)? opts.inventory.join(",") + ",": opts.hosts + ",";
            cmd.push("-i", inventory);
        }
        if (opts.privateKey) cmd.push("--private-key", opts.privateKey);
        if (opts.connection) cmd.push("-c", opts.connection);
        if (opts.vars) {
            for (let key in opts.vars) {
                cmd.push("-e", `'komponents_${key}="${opts.vars[key]}"'`);  
            }
        }*/

        if (opts.vars) {
            for (let key in opts.vars) {
                cmd.push("-e", `${key}="${opts.vars[key]}"`);
            }
        }

        // Append playbook name
        cmd.push(path.join(opts.path || this.pathPlaybooks, name, "playbook.yml"));
        
        this.log(cmd);
        this.log(`Executing command: ${cmd.join(" ")}`);

        // Execute command
        let deferred = Q.defer();


        /*child_process.exec(
            cmd.join(" "),
            { cwd: this.pathHome },
            (err, stdout, stderr) => {
                if (err) {
                    err.stdout = stdout;
                    err.stderr = stderr;
                    deferred.reject(err);
                } else {
                    let result = {
                        stdout: stdout,
                        stderr: stderr
                    };
                    // Try to JSON-parse result
                    try {
                        let out = JSON.parse(stdout);
                        for (let play of out.plays) {
                            let task = _.find(play.tasks, t => t.task.name == this.resultKey);
                            if (task) {
                                result.result = {};
                                for (let host in task.hosts) {
                                    result.result[host] = task.hosts[host]["ansible_facts"].result;
                                }
                                //if (Object.keys(result.result) == 1) result.result = result.result[Object.keys()[0]]
                            }
                        }

                    } catch (err) { }
                    deferred.resolve(result);
                }
            });*/
        
        let exec = child_process.spawn(cmd[0], cmd.slice(1), { cwd: this.pathHome });

        let result = { stdout: "", stderr: "" };
        exec.stdout.on("data", (data) => {
            result.stdout += data;
        });
        exec.stderr.on("data", (data) => {
            result.stderr += data;
        });
        exec.on("close", (code) => {
            if (code !== 0) {
                let err = this.error(`Error executing Ansible: ${result.stdout}`, code);
                
                // enrich error with additional info
                err.stdout = result.stdout;
                err.stderr = result.stderr;

                deferred.reject(err);
            } else {
                // Try to JSON-parse result
                try {
                    let out = JSON.parse(result.stdout);
                    for (let play of out.plays) {
                        let task = _.find(play.tasks, t => t.task.name == this.resultKey);
                        if (task) {
                            result.result = {};
                            for (let host in task.hosts) {
                                result.result[host] = task.hosts[host]["ansible_facts"].result;
                            }
                            //if (Object.keys(result.result) == 1) result.result = result.result[Object.keys()[0]]
                        }
                    }

                } catch (err) { }
                deferred.resolve(result);
            }
        });
        return deferred.promise;
    }

}

module.exports = (...opts) => {
    return new Ansible(...opts);
}