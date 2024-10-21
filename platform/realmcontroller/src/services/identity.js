const _ = require("lodash");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const Q = require("q");

const config = require("../config");

jwt.sign = Q.denodeify(jwt.sign);
jwt.verify = Q.denodeify(jwt.verify);

_.eachAsync = async (col, fn) => {
    if (col) {
        if (_.isArray(col)) {
            for (let i = 0; i < col.length; i++) await fn(col[i], i);
        } else {
            for (let key in col) await fn(col[key], key);
        }
    }
};

Q.longStackSupport = true;
Q.waitAll = function (promises) {

    var deferred = Q.defer();
    var results = [];
    Q.allSettled(promises).then(function (snapshots) {
        _.forEach(snapshots, function (snapshot) {
            if (deferred.promise.isPending() && snapshot.state == 'rejected') deferred.reject(snapshot.reason);
            else results.push(snapshot.value);
        });
        if (deferred.promise.isPending()) deferred.resolve(results);
    });
    return deferred.promise;

};

/**
 * Identify Service.
 * 
 * This service is responsible for managing identities: 
 * authentication, users and groups.
 * 
 * @author Javier Esparza-Peidro <jesparza@description.upv.es>
 */
class IdentityService {

    /**
     * Create Identity Service.
     * 
     * @param {Object} services - The remainder services
     * @param {Object} store - The store.
     * @param {Object} utils - Additional utilities
     */
    constructor(services, store, utils, opts) {
        if (!store) this._error("Unable to initialize IdentityService: missing store");
        if (!services) this._error("Unable to initialize IdentityService: missing services");
        if (!utils) this._error("Unable to initialize IdentityService: missing utilities");
        this.store = store;
        this.services = services;
        this.utils = utils;
        this.error = this.utils.error;
        this.log = opts.log || utils.log || (msg => console.log(`[IdentityService] ${msg}`));
    }


    // ------------------ authentication ------------------
    /**
     * Login onto the platform with the specified credentials.
     * 
     * @param {Object} cred - The credentials
     * @param {string} [cred.email] - The email
     * @param {string} [cred.password] - The password
     * @return {Object} The access token if success
     */
    async login(cred) {
        this.log(`login(${JSON.stringify(cred)})`);

        if (!cred) this._error('Unable to login: missing credentials');
        if (!cred.email || !cred.password) this._error('Unable to login: missing credentials data');

        // Find identity
        //
        let [user] = await this.store.search("users", { email: cred.email, password: cred.password });
        if (!user) this._error('Unable to login: authentication failed');

        user.perms = _.map(user.perms, perm => {
            let [name, value] = perm.split("=");
            let [id, right] = value.split(":");
            return { role: id, type: right == "r" ? "read" : right == "w" && "write" || "owner" };
        });

        user = {
            id: user.id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            pict: user.pict,
            groups: user.groups,
            perms: user.perms
        };

        // Return token
        let token = await jwt.sign(
            { user: user.id },
            config.secret,
            { expiresIn: "1h" }
        );
        return { user: user, token: token };
    }


    /**
     * Verifify the specified access token.
     * 
     * @param {Object} token - The access token
     * @return {Object} The authenticated role if token is valid
     */
    async verifyToken(token) {
        this.log(`verifyToken(${JSON.stringify(token)})`);

        if (!token) this._error('Unable to verify token: missing token');

        // Verify token
        try {
            let payload = await jwt.verify(token, config.secret);

            // Search user
            let [user] = await this.store.search("users", { id: payload.user });
            if (!user) this._error('Unrecognized access token');

            /*return {
                roles: (user.groups || []).concat([user.id])
            };*/
            return user;
        } catch (err) {
            this._error('Unsupported access token');
        }
    }

    /**
     * Refresh the specified access token.
     * 
     * @param {Object} token - The access token
     * @return {string} The refreshed access token if success
     */
    async refreshToken(token) {
        this.log(`refreshToken(${JSON.stringify(token)})`);

        if (!token) this._error('Unable to refresh token: missing token');

        // Verify old token
        let user = await this.verifyToken(token);

        // Return new token
        token = await jwt.sign(
            { user: user.id },
            config.secret,
            { expiresIn: "1h" }
        );
        return token;
    }

    /**
     * Logout .
     * 
     * @param {Object} token - The access token
     */
    async logout(token) {
        this.log(`logout(${JSON.stringify(token)})`);

        if (!token) this._error('Unable to refresh token: missing token');

        // Verify old token
        let user = await this.verifyToken(token);

    }



    // ------------------ users ------------------
    /**
     * Add a new user.
     * 
     * @param {Object} [issuer] - The operation issuer 
     * @param {Object} data - The user data
     * @param {string} data.name - The user name
     * @param {string} data.surname - The user surname
     * @param {string} data.email - The user email
     * @param {string} data.password - The user password
     * @param {string} [data.pict] - The user picture MIME type
     * @return {Object} The added user
     */
    async addUser(issuer, data) {
        this.log(`addUser(${issuer && issuer.id},${JSON.stringify(data)})`);

        if (!data) {
            data = issuer;
            issuer = undefined;
        }

        // Check properties
        if (!data) this._error('Unable to add user: missing user data');
        if (!data.name) this._error('Unable to add user: missing name');
        if (!data.surname) this._error('Unable to add user: missing surname');
        if (!data.email) this._error('Unable to add user: missing email');
        if (!data.password) this._error('Unable to add user: missing password');

        // Search another user with the same email
        //
        let users = await this.store.search("users", { email: data.email });
        if (users.length) this._error(`Unable to add user: user already exists`);

        // Add user
        //
        let userId = this.utils.uuid();
        let _user = {
            id: userId,
            ts: Date.now(),
            name: data.name,
            surname: data.surname,
            email: data.email,
            password: data.password,
            pict: data.pict || "",
            groups: [],
            perms: [
                `perm=0:o`,         // root is owner
                `perm=${userId}:o`  // user is owner
            ].concat(issuer ? `perm=${issuer.id}:o` : [])   // issuer (optional) is owner

        };

        await this.store.insert("users", _user);

        return _user;
    }

    /**
     * Update a user.
     * 
     * @param {Object} issuer - The operation issuer 
     * @param {string} userId - The user id
     * @param {Object} data - The user data
     * @param {string} [data.name] - The user name
     * @param {string} [data.surname] - The user surname
     * @param {string} [data.password] - The user password
     * @param {string} [data.pict] - The user picture in base64
     * @param {Array.<string>} [data.groups] - The user groups
     * @return {Object} The updated user
     */
    async updateUser(issuer, userId, data) {
        this.log(`updateUser(${issuer && issuer.id},${userId},${JSON.stringify(data)})`);

        if (!issuer) this._error(`Unable to update user: missing issuer`);
        if (!userId) this._error(`Unable to update user: missing user id`);
        if (!data) this._error(`Unable to update user: missing user data`);

        // Check permissions
        let [user] = await this.store.search(
            "users",
            {
                id: userId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!user) this._error(`Unable to update user: access denied`);

        // Check data
        let _data = {};
        if (data.name) _data.name = data.name;
        if (data.summary) _data.summary = data.summary;
        if (data.surname) _data.surname = data.surname;
        if (data.password) _data.password = data.password;
        if (data.pict) _data.pict = data.pict;
        _data.ts = Date.now();

        // Update
        await this.store.update(
            "users",
            { id: userId },
            _data
        );

        Object.assign(user, _data);
        return user;
    }

    /**
     * Remove user.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} userId - The user id
     */
    async removeUser(issuer, userId) {
        this.log(`removeUser(${issuer.id})`);

        if (!issuer) this._error(`Unable to remove user: missing issuer`);
        if (!userId) this._error(`Unable to remove user: missing user id`);

        // Check permissions
        let [user] = await this.store.search(
            "users",
            {
                id: userId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!user) this._error(`Unable to remove user: access denied`);

        /*// Remove all instances
        let instances = await this.services.deployment.listDeployments(user);
        let promises = [];
        _.each(instances, inst => {
            let perms = _.filter(
                inst.labels,
                label => {
                    if (label.startsWith("perm=")) {
                        let [role, right] = label.slice("perm=".length).split(":");
                        if (role != user.id) return true;
                    }
                    return false;
                }
            );
            if (!perms.length) {
                promises.push(
                    this.services.deployment.removeDeployment(user, inst.id)
                );
            }
        });

        // Remove all components
        let components = await this.services.component.listComponents(user);
        _.each(components, comp => {
            let perms = _.filter(
                comp.perms,
                perm => {
                    let [role, right] = perm.slice("perm=".length).split(":");
                    if (role != user.id) return true;
                    return false;
                }
            );
            if (!perms.length) {
                promises.push(
                    this.services.component.removeComponent(user, comp.id)
                );
            }
        });

        // Remove all domains
        let domains = await this.services.domain.listDomains(user);
        _.each(domains, dom => {
            let perms = _.filter(
                dom.labels,
                label => {
                    if (label.startsWith("perm=")) {
                        let [role, right] = label.slice("perm=".length).split(":");
                        if (role != user.id) return true;
                    }
                    return false;
                }
            );
            if (!perms.length) {
                promises.push(
                    this.services.domain.removeDomain(user, dom.id)
                );
            }
        });

        await Q.waitAll(promises);*/

        // Delete
        await this.store.delete(
            "users", { id: user.id }
        );

    }

    /**
     * List users.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - Determines which users must be listed
     * @param {Object} [opts] - Query options
     * @return {Array.<Object>} The users
     */
    async listUsers(issuer, query, opts) {
        this.log(`listUsers(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list users: missing issuer`);

        let users = await this.store.search("users", query, opts);
        _.each(users, user => {
            user.perms = _.map(user.perms, perm => {
                let [name, value] = perm.split("=");
                let [id, right] = value.split(":");
                return { role: id, type: right == "r" ? "read" : right == "w" && "write" || "owner" };
            });
        });
        return _.map(
            users,
            u => {
                return {
                    id: u.id,
                    name: u.name,
                    surname: u.surname,
                    email: u.email,
                    pict: u.pict,
                    groups: u.groups,
                    perms: u.perms
                };
            }
        );
    }

    // ------------------ groups ------------------
    /**
     * Add a new group.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} group - The group 
     * @param {string} group.title - The group title
     * @param {string} [group.desc] - The group description
     * @param {Array<string>} [group.labels] - The group labels
     * @param {string} [group.pict] - The group picture
     * @return {Object} The added group
     */
    async addGroup(issuer, group) {
        this.log(`addGroup(${issuer.id},${JSON.stringify(group)})`);

        // Check properties
        if (!issuer) this._error('Unable to add group: missing issuer');
        if (!group) this._error('Unable to add group: missing group data');
        if (!group.title) this._error('Unable to add group: missing title');

        let groupId = this.utils.uuid();
        let _group = {
            id: groupId,
            ts: Date.now(),
            title: group.title,
            desc: group.desc || "",
            labels: group.labels || [],
            pict: group.pict || "",
            perms: [
                `perm=0:o`,              // root is owner
                `perm=${issuer.id}:o`,   // issuer is owner
                `perm=${groupId}:r`      // group members can read
            ]
        };

        // Insert
        await this.store.insert("groups", _group);

        return _group;

        /*return {
            id: _group.id,
            ts: _group.ts,
            title: _group.title,
            desc: _group.desc,
            labels: _group.labels,
            pict: _group.pict,
        };*/
    }

    /**
     * Update group.
     * 
     * @param {Object} issuer - The operation issuer 
     * @param {string} groupId - The group id
     * @param {Object} data - The group data
     * @param {string} [data.title] - The group title
     * @param {string} [data.desc] - The group description
     * @param {string} [data.pict] - The group picture in base64
     * @param {Array<string>} [data.labels] - The group labels
     */
    async updateGroup(issuer, groupId, data) {
        this.log(`updateGroup(${issuer.id},${groupId},${JSON.stringify(data)})`);

        if (!issuer) this._error(`Unable to update group: missing issuer`);
        if (!groupId) this._error(`Unable to update group: missing group id`);
        if (!data) this._error(`Unable to update group: missing group data`);

        // Check permissions
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!group) this._error(`Unable to update group: access denied`);

        // Check data
        let _data = {};
        if (data.title) _data.title = data.title;
        if (data.desc) _data.desc = data.desc;
        if (data.pict) _data.pict = data.pict;
        if (data.labels) _data.labels = data.labels;
        _data.ts = Date.now();

        // Update
        await this.store.update(
            "groups", { id: group.id },
            _data
        );

        Object.assign(group, _data);
        return group;

        /*return {
            id: group.id,
            ts: group.ts,
            title: group.title,
            desc: group.desc,
            labels: group.labels,
            pict: group.pict,
        };*/

    }

    /**
     * Remove group.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} groupId - The group id
     */
    async removeGroup(issuer, groupId) {
        this.log(`removeGroup(${issuer.id},${groupId})`);

        if (!issuer) this._error(`Unable to remove group: missing issuer`);
        if (!groupId) this._error(`Unable to remove group: missing group id`);

        // Check permissions
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!group) this._error(`Unable to remove group: access denied`);

        // List all users belonging to the group
        let users = await this.store.search(
            "users",
            { groups: { $any: [groupId] } }
        );
        let promises = [];
        _.each(users, u => {
            u.groups = _.filter(id => id != groupId);
            promises.push(
                this.store.update("users", { id: u.id }, { groups: u.groups, ts: Date.now() })
            );
        });

        await Q.waitAll(promises);

        // Delete
        await this.store.delete(
            "groups", { id: group.id }
        );

    }

    /**
     * List groups.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {Object} [query] - Determines which groups must be listed
     * @param {Object} [opts] - Query options
     * @return {Array.<Object>} The users
     */
    async listGroups(issuer, query, opts) {
        this.log(`listGroups(${issuer.id},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        if (!issuer) this._error(`Unable to list groups: missing issuer`);

        query = query || {};
        query.perms = { $any: this.utils.perms.read(issuer) }

        let result = await this.store.search("groups", query, opts);
        _.each(result, group => {
            group.perms = _.map(group.perms, perm => {
                let [name, value] = perm.split("=");
                let [id, right] = value.split(":");
                return { role: id, type: right == "r" ? "read" : right == "w" && "write" || "owner" };
            });
        });
        return result;

        /*return _.map(
            await this.store.search("groups", query, opts),
            group => {
                return {
                    id: group.id,
                    ts: group.ts,
                    title: group.title,
                    desc: group.desc,
                    labels: group.labels,
                    pict: group.pict,
                }
            }
        );*/
    }



    /**
     * Add the specified user to the specified group.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} groupId - The group id
     * @param {string} userId - The user id
     */
    async addGroupMember(issuer, groupId, userId) {
        this.log(`addGroupMember(${issuer.id},${groupId},${userId})`);

        if (!issuer) this._error(`Unable to add group member: missing issuer`);
        if (!groupId) this._error(`Unable to add group member: missing group id`);
        if (!userId) this._error(`Unable to add group member: missing user id`);

        // Check permissions
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!group) this._error(`Unable to add group member: access denied`);

        // Obtain user
        let [user] = await this.store.search(
            "users",
            { id: userId }
        );
        if (!user) this._error(`Unable to add group member: user not found`);

        // Update user's group
        if (!user.groups.includes(group.id)) {
            user.groups.push(group.id);
            await this.store.update(
                "users",
                { id: user.id },
                { groups: user.groups, ts: Date.now() }
            );
        }

    }

    /**
     * Remove the specified group member.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} groupId - The group id
     * @param {string} userId - The user id 
     */
    async removeGroupMember(issuer, groupId, userId) {
        this.log(`removeGroupMember(${issuer.id},${groupId},${userId}`);

        if (!issuer) this._error(`Unable to remove group member: missing issuer`);
        if (!groupId) this._error(`Unable to remove group member: missing group id`);
        if (!userId) this._error(`Unable to remove group member: missing user id`);

        // Check permissions
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.read(issuer) }
            }
        );
        if (!group) this._error(`Unable to remove group member: access denied`);

        // Obtain user
        let [user] = await this.store.search(
            "users",
            { id: userId }
        );
        if (!user) this._error(`Unable to remove group member: user not found`);

        // Update user's group
        user.groups = _.filter(gid => gid != group.id);
        await this.store.update(
            "users",
            { id: user.id },
            { groups: user.groups, ts: Date.now() }
        );

    }

    /**
     * List the specified group members.
     * 
     * @param {Object} issuer - The operation issuer
     * @param {string} groupId - The group id
     * @param {Object} [query] - Determines which groups must be listed
     * @param {Object} [opts] - Query options
     */
    async listGroupMembers(issuer, groupId, query, opts) {
        this.log(`listGroupMembers(${issuer.id},${groupId})`);

        if (!issuer) this._error(`Unable to list group members: missing issuer`);
        if (!groupId) this._error(`Unable to list group members: missing group id`);

        // Check permissions
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.read(issuer) }
            }
        );
        if (!group) this._error(`Unable to list group members: access denied`);

        // List all users belonging to the group
        query = query || {};
        query.groups = { $any: [groupId] };
        return await this.listUsers(issuer, query, opts);

    }


    // ------------------ permissions ------------------
    /**
     * Add the specified permission to the group.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} groupId - The group id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addGroupPerm(issuer, groupId, perm) {
        this.log(`addGroupPerm(${issuer.id},${groupId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to add permission: missing issuer`);
        if (!groupId) this._error(`Unable to add permission: missing group id`);
        if (!perm) this._error(`Unable to add permission: missing permission`);
        if (!perm.role) this._error(`Unable to add permission: missing permission role`);
        if (!perm.type) this._error(`Unable to add permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to add permission: unsupported permission type ${perm.type}`)

        // Check access
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!group) this._error(`Unable to add permission: access denied`);

        let perms = group.perms.concat(`perm=${perm.role}:${perm.type.charAt(0)}`);

        // Update
        await this.store.update(
            "groups",
            { id: groupId },
            { perms: perms, ts: Date.now() }
        );

    }

    /**
     * Remove the specified permission from the group.
     * 
     * @param {Object} issuer - The issuer
     * @param {string} groupId- The group id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeGroupPerm(issuer, groupId, perm) {
        this.log(`removeGroupPerm(${issuer.id},${groupId},${JSON.stringify(perm)})`);

        if (!issuer) this._error(`Unable to remove permission: missing issuer`);
        if (!groupId) this._error(`Unable to remove permission: missing group id`);
        if (!perm) this._error(`Unable to remove permission: missing permission`);
        if (!perm.role) this._error(`Unable to remove permission: missing permission role`);
        if (!perm.type) this._error(`Unable to remove permission: missing permission type`);
        if (!["read", "write"].includes(perm.type)) this._error(`Unable to remove permission: unsupported permission type ${perm.type}`);

        // Check access
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.write(issuer) }
            }
        );
        if (!group) this._error(`Unable to remove permission: access denied`);

        let perms = _.filter(
            group.perms,
            p => {
                let [name, value] = p.split("=");
                let [role, right] = value.split(":");
                if (role == perm.role && right == perm.type.charAt(0)) return false;
                return true;
            }
        );

        // Update
        await this.store.update(
            "groups",
            { id: groupId },
            { perms: perms, ts: Date.now() }
        );

    }

    /**
     * List the specified permissions
     * 
     * @param {Object} issuer - The issuer
     * @param {string} groupId- The group id
     */
    async listGroupPerms(issuer, groupId) {
        this.log(`listGroupPerms(${issuer.id},${groupId})`);

        if (!issuer) this._error(`Unable to list permissions: missing issuer`);
        if (!groupId) this._error(`Unable to list permissions: missing group id`);

        // Check access
        let [group] = await this.store.search(
            "groups",
            {
                id: groupId,
                perms: { $any: this.utils.perms.read(issuer) }
            }
        );
        if (!group) this._error(`Unable to list permissions: access denied`);

        _.each(result, inst => {
            let perms = _.filter(inst.labels, label => label.startsWith("perm="));
            inst.perms = _.map(perms, perm => {
                let [name, value] = perm.split("=");
                let [id, right] = value.split(":");
                return { role: id, type: right == "r" ? "read" : right == "w" && "write" || "owner" };
            });
        });

        return _.map(group.perms, perm => {
            let [name, value] = perm.split("=");
            let [id, right] = value.split(":");
            return { role: id, type: right == "r" ? "read" : right == "w" && "write" || "owner" };
        });

    }


    _error(err) {
        if (_.isString(err)) {
            let err0 = new Error(err);
            err0.type = "IdentityError";
            throw err0;
        } else if (err.response) {
            let err0 = new Error();
            err0.type = err.response.data && err.response.data.type || "IdentityError";
            err0.message = err.response.data && err.response.data.message || err.message;
            err0.cause = err;
            err0.stack = err.response.data && err.response.data.stack || err.stack;
            throw err0;
        } else {
            throw err;
        }

    }


}

module.exports = (...opts) => {
    return new IdentityService(...opts);
}