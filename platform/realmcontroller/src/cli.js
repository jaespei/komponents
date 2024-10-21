#!/usr/bin/env node

const repl = require("repl");
const fs = require("fs");

const _ = require("lodash");
const axios = require("axios");
const Q = require("q");
const YAML = require("yaml");

const app = require("./app");
const server = require("./server");
const api = require("./api");

const DOMAIN_HOST = process.env.DOMAIN_HOST || "127.0.0.1:10000";
const COMPONENT_HOST = process.env.COMPONENT_HOST || "127.0.0.1:9000";
const HOST = process.env.HOST || "127.0.0.1:8000";


let argv = process.argv.slice(2);

/**
 * Print CLI usage info.
 */
function error(msg) {
    let str = "";
    if (msg) str += msg + "\n";
    str += JSON.stringify(gopts) + "\n";
    str += `
Usage: cli.js <command> [options]
Server related commands:
    start [-h <host>] [-d <host>] [-c <host>]  Start the server
    info [-h <host>]                           List info

Auth related commands:
    login <email> <password>
    refresh
    logout

User related commands:
    user add [-u <user>] [-x key=val] [-w]
    user remove -u <user> [-w]
    user update -u <user> [-x key=val] [-w]
    user list [-q <query>] [-o <opts>]

Group related commands:
    group add [-x key=val] [-w]
    group remove -g <group> [-w]
    group update -g <group> [-x key=val] [-w]
    group list [-q <query>] [-o <opts>]

Group members related commands:
    member add -g <group> -u <user>
    member remove -g <group> -u <user>
    member list -g <group> [-q <query>] [-o <opts>]

Permission related commands:
    perm add <collection> <resource> <role> <type>
    perm remove <collection> <resource> <role> <type>
    (perm list <collection> <resource>)

Domain related commands:
    domain add -t <type> [-g <gateway>] [-f <file>] [-n <name>] [-x key=val] [-w]
    domain remove -d <domain>  [-w]
    domain list [-q <query>] [-o <opts>]

Resource related commands:
    resource add -d <domain> -t <type> [-x key=val] [-w]
    resource remove -d <domain> -r <resource> [-w]
    resource list -d domain [-q <query>] [-o <opts>]

Component related commands:
    component add -f <file> [-x key=val]
    component update -c <component> -f <file>
    component remove -c <component>
    component list [-q <query>] [-o <opts>]

Deployment related commands:
    deployment add -c <component> [-f <file>] [-w]
    deployment remove -i <instance> [-w]
    deployment list [-q <query>] [-o <opts>] [--graph]

Instance related commands:
    instance add [-p <parent>] [-s <subcomponent>] [-c <connector>] [-x key=val] [-w]
    instance remove -i <instance> [-w]
    instance list [-q <query>] [-o <opts>] [--graph]
    `;

    console.log(str);
    process.exit(-1);

}

/**
 * Execute the provided function a number of times
 *
 * @param {Function} fn - The function to execute
 * @param {Object} [opts] - Additional options
 * @param {number} [opts.retry] - The retry timeout (default 5s)
 * @param {number} [opts.count] - Max number of retries
 * @param {number} [opts.timeout] - Max waiting time (default 5m)
 */
function loop(fn, opts) {
    console.log(`loop(${JSON.stringify(opts)})`);
    opts = opts || {};
    opts.retry = opts.retry || 5000;
    opts.timeout = opts.timeout || 300000;

    let deferred = Q.defer();
    let count = 0,
        ts = Date.now();
    let wrappedFn = async () => {
        let result;
        try {
            result = await fn();
        } catch (err) {
            deferred.reject(err);
            return;
        }
        if (result) deferred.resolve(result);
        else {
            if (opts.count) {
                count++;
                if (count == opts.count) {
                    deferred.reject(new Error("Loop operation exceeded maximum number of retries"));
                    return;
                }
            }
            if (opts.timeout && Date.now() - ts > opts.timeout) {
                deferred.reject(new Error("Loop operation expired timeout"));
                return;
            }
            setTimeout(wrappedFn, opts.retry);
        }
    }
    wrappedFn();
    return deferred.promise;
}

/**
 * REPL context
 */
let context = {
    help() {
        error();
    },
    error(err) {
        if (err.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.log(`ERROR: status=${err.response.status}, data=${JSON.stringify(err.response.data, undefined, 4)}`);
        }
        /*else if (err.request) {
                   // The request was made but no response was received
                   // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                   // http.ClientRequest in node.js
                   console.log(`ERROR: request=${err.request}`);
               }*/
        else {
            // Something happened in setting up the request that triggered an Error
            console.log(`ERROR: type=${err.type}, message=${err.message}, stack=${err.stack}`);
        }
    },
    cb(res) {
        if (res instanceof Error) context.error(res);
        else console.log(JSON.stringify(res, undefined, 4));
    },
    async exit() {
        process.exit(0);
    },
    async start(opts) {
        if (context.server) throw new Error("Unable to start: server already running");

        opts = opts || gopts || {};
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");
        opts.domainHost = opts.domainHost || DOMAIN_HOST;
        [opts.domainAddr, opts.domainPort] = opts.domainHost.split(":");
        opts.componentHost = opts.componentHost || COMPONENT_HOST;
        [opts.componentAddr, opts.componentPort] = opts.componentHost.split(":");

        console.log(`Applying opts: ${JSON.stringify(opts)}`);

        // Start app
        context.app = await app(opts);

        // Start server
        context.server = server(context.app, opts);
        context.server.start();
    },
    async stop(opts) {
        opts = opts || gopts || {};

        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts: ${JSON.stringify(opts)}`);

        try {
            await axios.delete(`http://${opts.addr}:${opts.port}/`);
        } catch (err) {
            context.error(err);
        }


    },
    async info(opts) {
        opts = opts || gopts || {};

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts: ${JSON.stringify(opts)}`);

        try {
            let { data } = await axios(`http://${opts.addr}:${opts.port}/`);
            console.log(JSON.stringify(data, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },

    async login(opts) {
        opts = opts || gopts || {};
        if (!opts.email || !opts.password) error("Missing credentials");
        let cred = {
            email: opts.email,
            password: opts.password
        };


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, spec=${JSON.stringify(cred)}`);

        try {
            let result = await api(opts).login(cred);
            fs.writeFileSync("token", result.token);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async refresh(opts) {
        opts = opts || gopts || {};

        let token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${JSON.stringify(token)}`);

        try {
            let result = await api(opts).refreshToken(token);
            fs.writeFileSync("token", result);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async logout(opts) {
        opts = opts || gopts || {};

        let token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${JSON.stringify(token)}`);

        try {
            let result = await api(opts).refreshToken(token);
            fs.unlinkSync("token");
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async addUser(opts) {
        opts = opts || gopts || {};
        let data = {};

        // extra options
        _.each(opts.extra, opt => {
            domain[opt.key] = opt.value;
        });
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}, data=${JSON.stringify(data)}`);

        try {
            let result = await api(opts).addUser(token, data);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async updateUser(opts) {
        opts = opts || gopts || {};
        if (!opts.user) error("Missing user");
        let data = {};
        // extra options
        _.each(opts.extra, opt => {
            domain[opt.key] = opt.value;
        });
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}, data=${JSON.stringify(data)}`);

        try {
            let result = await api(opts).updateUser(token, opts.user, data);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async removeUser(opts) {
        opts = opts || gopts || {};
        if (!opts.user) error("Missing user");
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}`);

        try {
            let result = await api(opts).removeUser(token, opts.user);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async listUser(opts) {
        context.listUsers(opts);
    },
    async listUsers(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result = await api(opts).listUsers(token, q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },

    async addGroup(opts) {
        opts = opts || gopts || {};
        let data = {
            title: opts.title,
            desc: opts.desc,
            labels: opts.labels && JSON.parse(opts.labels) || undefined,
            pict: opts.pict
        };
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}, data=${JSON.stringify(data)}`);

        try {
            let result = await api(opts).addGroup(token, data);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async updateGroup(opts) {
        opts = opts || gopts || {};
        if (!opts.group) error("Missing group");
        let data = {
            title: opts.title,
            desc: opts.desc,
            labels: opts.labels && JSON.parse(opts.labels) || undefined,
            pict: opts.pict
        };
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}, data=${JSON.stringify(data)}`);

        try {
            let result = await api(opts).updateGroup(token, opts.group, data);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async removeGroup(opts) {
        opts = opts || gopts || {};
        if (!opts.group) error("Missing group");
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}`);

        try {
            let result = await api(opts).removeGroup(token, opts.group);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async listGroup(opts) {
        context.listGroups(opts);
    },
    async listGroups(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result = await api(opts).listGroups(token, q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },

    async addMember(opts) {
        opts = opts || gopts || {};
        if (!opts.group) error("Missing group");
        if (!opts.user) error("Missing user");
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}`);

        try {
            let result = await api(opts).addGroupMember(token, opts.group, opts.user);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async removeMember(opts) {
        opts = opts || gopts || {};
        if (!opts.group) error("Missing group");
        if (!opts.user) error("Missing user");
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}`);

        try {
            let result = await api(opts).removeGroupMember(token, opts.group, opts.user);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async listMember(opts) {
        context.listMembers(opts);
    },
    async listMembers(opts) {
        opts = opts || gopts || {};
        if (!opts.group) error("Missing group");
        let q = opts.query || {};
        let o = opts.opts || {};
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();


        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result = await api(opts).listGroupMembers(token, opts.group, q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },

    async addPerm(opts) {
        opts = opts || gopts || {};
        if (!opts.collection) error("Missing collection");
        if (!opts.resource) error("Missing resource");
        if (!opts.role) error("Missing role");
        if (!opts.type) error("Missing type");
        let perm = {
            role: opts.role,
            type: opts.type
        };
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        let fn = `add${opts.collection[0].toUpperCase()}${opts.collection.slice(1)}Perm`;

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}, perm=${JSON.stringify(perm)}`);

        try {
            let result = await api(opts)[fn](token, opts.resource, perm);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async removePerm(opts) {
        opts = opts || gopts || {};
        if (!opts.collection) error("Missing collection");
        if (!opts.resource) error("Missing resource");
        if (!opts.role) error("Missing role");
        if (!opts.type) error("Missing type");
        let perm = {
            role: opts.role,
            type: opts.type
        };
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        let fn = `remove${opts.collection[0].toUpperCase()}${opts.collection.slice(1)}Perm`;

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, token=${token}, perm=${JSON.stringify(perm)}`);

        try {
            let result = await api(opts)[fn](token, opts.resource, perm);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    /*async listPerm(opts) {
        context.listPerms(opts);
    },
    async listPerms(opts) {
        opts = opts || gopts || {};
        if (!opts.collection) error("Missing collection");
        if (!opts.resource) error("Missing resource");
        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        let fn = `list${opts.collection[0].toUpperCase()}${opts.collection.slice(1)}Perms`;

        if (context.server) {
            let result = await context.app.services[service][fn](token, opts.resource);
            console.log(JSON.stringify(result, undefined, 4));
        } else {
            // remote connect
            opts.host = opts.host || HOST;
            [opts.addr, opts.port] = opts.host.split(":");

            console.log(`Applying opts=${JSON.stringify(opts)}`);

            try {
                let result = await api(opts)[fn](token, opts.resource);
                console.log(JSON.stringify(result, undefined, 4));
            } catch (err) {
                context.error(err);
            }

        }
    },*/

    async addDomain(opts) {
        opts = opts || gopts || {};
        if (!opts.type) error("Missing domain type");

        let domain = {
            type: opts.type,
            name: opts.name,
            gateway: opts.gateway
        };
        if (opts.file) domain.kubeconfig = fs.readFileSync(opts.file).toString();

        // extra options
        _.each(opts.extra, opt => {
            domain[opt.key] = opt.value;
        });

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, domain=${JSON.stringify(domain)}`);

        try {
            let result = await api(opts).addDomain(token, domain);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            [result] = await api(opts).listDomains(token, { id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },
    async removeDomain(opts) {
        opts = opts || gopts || {};
        if (!opts.domain) error("Missing domain");

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, domain=${JSON.stringify(opts.domain)}`);

        try {
            let result = await api(opts).removeDomain(token, opts.domain);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },
    async listDomain(opts) {
        context.listDomains(opts);
    },
    async listDomains(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result = await api(opts).listDomains(token, q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async addResource(opts) {
        opts = opts || gopts || {};
        if (!opts.domain) error("Missing domain");
        if (!opts.type) error("Missing resource type");

        let resource = {
            domain: opts.domain,
            type: opts.type
        };

        // extra options
        _.each(opts.extra, opt => {
            resource[opt.key] = opt.value;
        });

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, resource=${JSON.stringify(resource)}`);

        try {
            let result = await api(opts).addResource(token, opts.domain, resource);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            [result] = await api(opts).listResources(token, domainId, { id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }
    },

    async removeResource(opts) {
        opts = opts || gopts || {};
        if (!opts.domain) error("Missing domain");
        if (!opts.resource) error("Missing resource");

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, resource=${JSON.stringify(opts.resource)}`);

        try {
            let result = await api(opts).removeResource(token, opts.domain, opts.resource);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactioById(token, result);
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },
    async listResource(opts) {
        context.listResources(opts);
    },
    async listResources(opts) {
        opts = opts || gopts || {};

        if (!opts.domain) error("Missing domain");

        let q = opts.query || {};
        let o = opts.opts || {};

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result = await api(opts).listResources(token, opts.domain, q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async addComponent(opts) {
        opts = opts || gopts || {};

        // if (!opts.file) error("Missing file");

        let component = {};
        // extra options
        _.each(opts.extra, opt => {
            component[opt.key] = opt.value;
        });

        if (opts.file) {
            let file = YAML.parse(fs.readFileSync(opts.file).toString());
            if (file.model) Object.assign(component, file);
            else component.model = file;
        }

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, component=${JSON.stringify(component)}`);

        try {
            let result = await api(opts).addComponent(token, component);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            [result] = await api(opts).listComponents(token, { id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }
    },

    async updateComponent(opts) {
        opts = opts || gopts || {};

        if (!opts.component) error("Missing component");

        let data = {};
        // extra options
        _.each(opts.extra, opt => {
            data[opt.key] = opt.value;
        });

        if (opts.file) {
            let file = YAML.parse(fs.readFileSync(opts.file).toString());
            if (file.model) Object.assign(data, file);
            else data.model = file;
        }

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, component=${opts.component}, data=${JSON.stringify(data)}`);

        try {
            let result = await api(opts).updateComponent(token, opts.component, data);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            [result] = await api(opts).listComponents(token, { id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }
    },

    async removeComponent(opts) {
        opts = opts || gopts || {};
        if (!opts.component) error("Missing component");

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, component=${JSON.stringify(opts.component)}`);

        try {
            let result = await api(opts).removeComponent(token, opts.component);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },
    async listComponent(opts) {
        context.listComponents(opts);
    },
    async listComponents(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result = await api(opts).listComponents(token, q, o);
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }
    },


    async addDeployment(opts) {
        opts = opts || gopts || {};

        if (!opts.component) error("Missing component");

        let deployment;
        if (opts.file) deployment = YAML.parse(fs.readFileSync(opts.file).toString());

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, component=${opts.component}, deployment=${JSON.stringify(deployment)}`);

        try {
            let result = await api(opts).addDeployment(token, opts.component, deployment);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            [result] = await api(opts).listDeployments(token, { id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }
    },

    async removeDeployment(opts) {
        opts = opts || gopts || {};
        if (!opts.instance) error("Missing instance");

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, instance=${opts.instance}`);

        try {
            let result = await api(opts).removeDeployment(token, opts.instance);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }


    },
    async listDeployment(opts) {
        context.listDeployments(opts);
    },
    async listDeployments(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result;
            if (opts.graph) {
                result = await api(opts).listGraphs(token, q, o);
            } else {
                result = await api(opts).listDeployments(token, q, o);
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },

    async addInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.file && !opts.parent) error("Missing instance data");
        let spec = {
            parent: opts.parent,
            subcomponent: opts.subcomponent,
            connector: opts.connector
        };
        if (opts.file) {
            let deployment = YAML.parse(fs.readFileSync(opts.file).toString());
            spec.model = deployment.model || deployment;
            spec.deployment = deployment.model ? deployment : {};
        }

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, spec=${JSON.stringify(spec)}`);

        try {
            let result = await api(opts).addInstance(token, spec);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            [result] = await api(opts).listInstances({ id: tx.target });
                            return result;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },
    async removeInstance(opts) {
        opts = opts || gopts || {};
        if (!opts.instance) error("Missing instance");

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect

        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, instance=${JSON.stringify(opts.instance)}`);

        try {
            let result = await api(opts).removeInstance(token, opts.instance);
            if (opts.wait) {
                console.log("Waiting ...");
                try {
                    result = await loop(async () => {
                        let tx = await api(opts).findTransactionById(token, result);
                        if (tx.state == "Completed") {
                            return true;
                        } else if (tx.state == "Aborted") {
                            throw new Error(tx.err);
                        }
                    });
                } catch (err) {
                    context.error(err);
                }
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },
    async listInstance(opts) {
        context.listInstances(opts);
    },
    async listInstances(opts) {
        opts = opts || gopts || {};
        let q = opts.query || {};
        let o = opts.opts || {};

        let token;
        if (fs.existsSync("token")) token = fs.readFileSync("token").toString();

        // remote connect
        opts.host = opts.host || HOST;
        [opts.addr, opts.port] = opts.host.split(":");

        console.log(`Applying opts=${JSON.stringify(opts)}, query=${JSON.stringify(q)}, opts=${JSON.stringify(o)}`);

        try {
            let result;
            if (opts.graph) {
                result = await api(opts).listGraphs(token, q, o);
            } else {
                result = await api(opts).listInstances(token, q, o);
            }
            console.log(JSON.stringify(result, undefined, 4));
        } catch (err) {
            context.error(err);
        }

    },


};

// Process CLI
let cmd, gopts = {};
while (argv.length) {
    switch (argv[0]) {
        case "start":
        case "info":
        case "refresh":
        case "logout":
            cmd = argv[0];
            argv.shift();
            break;
        case "login":
            cmd = argv[0];
            argv.shift();
            if (!argv.length) error();
            gopts.email = argv[0];
            argv.shift();
            if (!argv.length) error();
            gopts.password = argv[0];
            argv.shift();
            break;
        case "perm":
            cmd = argv[0];
            argv.shift();
            if (!argv.length) error();
            cmd = argv.shift() + cmd.charAt(0).toUpperCase() + cmd.slice(1);
            if (!argv.length) error();
            gopts.collection = argv[0];
            argv.shift();
            if (!argv.length) error();
            gopts.resource = argv[0];
            argv.shift();
            if (argv.length) {
                gopts.role = argv[0];
                argv.shift();
            }
            if (argv.length) {
                gopts.type = argv[0];
                argv.shift();
            }
            break;
        case "user":
        case "group":
        case "member":
        case "domain":
        case "resource":
        case "component":
        case "deployment":
        case "instance":
            {
                let tmp = argv.shift();
                if (!argv.length) error();
                switch (argv[0]) {
                    case "add":
                    case "remove":
                    case "update":
                    case "list":
                        cmd = argv.shift() + tmp.charAt(0).toUpperCase() + tmp.slice(1);
                        break;
                    default:
                        error();
                }
                break;
            }
        case "-h":
        case "--host":
            argv.shift();
            if (!argv.length) error();
            gopts.host = argv[0];
            argv.shift();
            break;
        case "-s":
        case "--subcomponent":
            argv.shift();
            if (!argv.length) error();
            gopts.subcomponent = argv[0];
            argv.shift();
            break;
        case "-c":
        case "--component":
        case "--connector":
            argv.shift();
            if (!argv.length) error();
            gopts.connector = gopts.component = argv[0];
            argv.shift();
            break;
        case "-p":
        case "--parent":
            argv.shift();
            if (!argv.length) error();
            gopts.parent = argv[0];
            argv.shift();
            break;
        case "-q":
        case "--query":
            argv.shift();
            if (!argv.length) error();
            gopts.query = JSON.parse(argv[0]);
            argv.shift();
            break;
        case "-o":
        case "--opts":
            argv.shift();
            if (!argv.length) error();
            gopts.opts = JSON.parse(argv[0]);
            argv.shift();
            break;
        case "-i":
        case "--instance":
            argv.shift();
            if (!argv.length) error();
            gopts.instance = argv[0];
            argv.shift();
            break;
        case "-f":
        case "--file":
            argv.shift();
            if (!argv.length) error();
            gopts.file = argv[0];
            argv.shift();
            break;
        case "-g":
        case "--group":
            argv.shift();
            if (!argv.length) error();
            gopts.group = argv[0];
            argv.shift();
            break;
        case "-t":
        case "--type":
            argv.shift();
            if (!argv.length) error();
            gopts.type = argv[0];
            argv.shift();
            break;
        case "-d":
        case "--domain":
            argv.shift();
            if (!argv.length) error();
            gopts.domain = argv[0];
            argv.shift();
            break;
        case "-u":
        case "--user":
            argv.shift();
            if (!argv.length) error();
            gopts.user = argv[0];
            argv.shift();
            break;
        case "--graph":
            gopts.graph = true;
            argv.shift();
            break;
        case "-x":
        case "--extra":
            /*argv.shift();
            if (!argv.length) error();
            let [key, value] = argv[0].split("=");
            gopts[key] = value;*/
            argv.shift();
            gopts.extra = gopts.extra || [];
            let [key, value] = argv[0].split("=");
            if (!value) error("Missing key=value in -x option");
            gopts.extra.push({ key: key, value, value });
            argv.shift();
            break;
        case "-w":
        case "--wait":
            argv.shift();
            gopts.wait = true;
            break;
        default:
            if (argv[0].startsWith("--")) {
                if (argv.length > 1) {
                    gopts[argv[0].slice(2)] = argv[1];
                    argv.shift();
                    argv.shift();
                } else {
                    gopts[argv[0].slice(2)] = true;
                }
            } else if (argv[0].startsWith("-")) {
                if (argv.length > 1) {
                    gopts[argv[0].slice(1)] = argv[1];
                    argv.shift();
                    argv.shift();
                } else {
                    gopts[argv[0].slice(1)] = true;
                }
            } else error(`Unsupported option ${argv[0]}`);
    }
}


if (cmd) {
    let f = async () => {
        console.log(`Applying cmd=${cmd}, gopts=${JSON.stringify(gopts)}`);
        await context[cmd].apply(context, gopts);
        if (cmd == "start") {
            let cli = repl.start({ prompt: "realm > " });
            Object.assign(cli.context, context);
            context = cli.context;

            /*cli.on('exit', () => {
                console.log('Exiting ...');
                if (context.server) context.stop();
                process.exit();
            });*/

        }
    }
    f();
} else error("No command");