import axios from "axios";

class RealmAPI {

    /**
     * Create Realm Controller API proxy.
     * 
     * @param {Object} opts - Additional options
     * @param {stirng} opts.host - The server host in format <addr>:<port>
     * @param {string} opts.addr - The server address
     * @param {number} opts.port - The server port
     */
    constructor(opts) {
        this.opts = opts;
        this.opts.host = this.opts.host || `${this.opts.addr}:${this.opts.port}`;
        [this.opts.addr, this.opts.port] = this.opts.host.split(":");
        this.log = opts.log || (msg => console.log(`[RealmAPI] ${msg}`));
    }


    // ------------------ authentication ------------------
    /**
     * Login onto the platform with the specified credentials.
     * 
     * @param {Object} cred - The credentials
     * @param {string} [cred.user] - The user
     * @param {string} [cred.password] - The password
     * @return {Object} The access token if success
     */
    async login(cred) {
        this.log(`login(${JSON.stringify(cred)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/sessions`,
                cred
            );
            return result;
        } catch (err) {
            this._error(err);
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

        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/sessions`, {}, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Logout .
     * 
     * @param {Object} token - The access token
     */
    async logout(token) {
        this.log(`logout(${JSON.stringify(token)})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/sessions`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    // ------------------ users ------------------

    /**
     * Add a new user.
     * 
     * @param {string} token - The access token
     * @param {Object} data - The user data
     * @param {string} data.name - The user name
     * @param {string} data.surname - The user surname
     * @param {string} data.email - The user email
     * @param {string} data.password - The user password
     * @param {string} [data.pict] - The user picture MIME type
     * @return {Object} The added user
     */
    async addUser(token, data) {
        this.log(`addUser(${token},${JSON.stringify(data)})`);

        if (!data) {
            data = token;
            token = undefined;
        }
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/users`,
                data,
                token ? { headers: { "Authorization": `Bearer ${token}` } } : undefined
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Update a user.
     * 
     * @param {string} token - The access token
     * @param {string} userId - The user to update
     * @param {Object} data - The user data
     * @param {string} [data.name] - The user name
     * @param {string} [data.surname] - The user surname
     * @param {string} [data.password] - The user password
     * @param {string} [data.pict] - The user picture in base64
     * @param {Array.<string>} [data.groups] - The user groups
     * @return {Object} The updated user
     */
    async updateUser(token, userId, data) {
        this.log(`updateUser(${token},${userId},${JSON.stringify(data)})`);
        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/users/${userId}`,
                data, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove user.
     * 
     * @param {string} token - The access token
     * @param {string} userId - The instance
     */
    async removeUser(token, userId) {
        this.log(`removeUser(${token},${userId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/users/${userId}`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List users.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - Determines which users must be listed
     * @param {Object} [opts] - Query options
     * @return {Array<Object>} The users
     */
    async listUsers(token, query, opts) {
        this.log(`listUsers(${token},${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/users`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    // ------------------ groups ------------------

    // ------------------ groups ------------------
    /**
     * Add a new group.
     * 
     * @param {string} token - The access token
     * @param {Object} group - The group 
     * @param {string} group.title - The group title
     * @param {string} [group.desc] - The group description
     * @param {Array<string>} [group.labels] - The group labels
     * @param {string} [group.pict] - The group picture
     * @return {Object} The added group
     */
    async addGroup(token, group) {
        this.log(`addGroup(${token},${JSON.stringify(group)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/groups`,
                group, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Update group.
     * 
     * @param {string} token - The access token
     * @param {string} groupId - The group id
     * @param {Object} data - The group data
     * @param {string} [data.title] - The group title
     * @param {string} [data.desc] - The group description
     * @param {string} [data.pict] - The group picture in base64
     * @param {Array<string>} [data.labels] - The group labels
     */
    async updateGroup(token, groupId, data) {
        this.log(`updateGroup(${token},${groupId},${JSON.stringify(data)})`);

        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}`,
                data, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove group.
     * 
     * @param {string} token - The access token
     * @param {string} groupId - The group id
     */
    async removeGroup(token, groupId) {
        this.log(`removeGroup(${token},${groupId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List groups.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - Determines which groups must be listed
     * @param {Object} [opts] - Query options
     * @return {Array.<Object>} The users
     */
    async listGroups(token, query, opts) {
        this.log(`listGroups(${token},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/groups`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Add the specified user to the specified group.
     * 
     * @param {string} token - The access token
     * @param {string} groupId - The group id
     * @param {string} userId - The user id
     */
    async addGroupMember(token, groupId, userId) {
        this.log(`addGroupMember(${token},${groupId},${userId})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}/members`, { userId: userId }, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified group member.
     * 
     * @param {string} token - The access token
     * @param {string} groupId - The group id
     * @param {string} userId - The user id 
     */
    async removeGroupMember(token, groupId, userId) {
        this.log(`removeGroupMember(${token},${groupId},${userId}`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}/members/${userId}`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }


    /**
     * List the specified group members.
     * 
     * @param {string} token - The access token
     * @param {string} groupId - The group id
     * @param {Object} [query] - Determines which groups must be listed
     * @param {Object} [opts] - Query options
     */
    async listGroupMembers(token, groupId, query, opts) {
        this.log(`listGroupMembers(${token},${groupId})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}/members`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Add the specified permission to the group.
     * 
     * @param {string} token - The access token
     * @param {string} groupId - The group id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addGroupPerm(token, groupId, perm) {
        this.log(`addGroupPerm(${token},${groupId},${JSON.stringify(perm)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}/perms`,
                perm, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified permission from the group.
     * 
     * @param {string} token - The access token
     * @param {string} groupId- The group id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeGroupPerm(token, groupId, perm) {
        this.log(`removeGroupPerm(${token},${groupId},${JSON.stringify(perm)})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/groups/${groupId}/perms`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    data: perm
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }


    // ------------------ transacions ------------------
    /**
     * Find the specified transaction.
     * 
     * @param {string} token - The access token
     * @param {string} txId - The transaction id
     * @return {Array<Object>} The query results
     */
    async findTransactionById(token, txId) {
        this.log(`findTransactionById(${token},${txId})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/transactions/${txId}`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }


    // ------------------ domains ------------------

    /**
     * Add a new domain.
     * 
     * @param {string} token - The access token
     * @param {Object} domain - The domain data
     * @param {string} domain.type - The domain type
     * @return {string} The started transaction id
     */
    async addDomain(token, domain) {
        this.log(`addDomain(${token},${JSON.stringify(domain)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains`,
                domain, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Update domain.
     * 
     * @param {string} token - The access token
     * @param {string} domainId - The domain identifier
     * @param {Object} data - The domain data
     * @return {Object} The updated domain
     */
    async updateDomain(token, domainId, data) {
        this.log(`updateDomain(${token},${domainId},${JSON.stringify(data)})`);

        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`,
                data, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified domain.
     * 
     * @param {string} token - The access token
     * @param {string} domainId - The domain id
     */
    async removeDomain(token, domainId) {
        this.log(`removeDomain(${token},${domainId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}`, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * List the specified domains.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listDomains(token, query, opts) {
        this.log(`listDomains(${token},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Add a new resource to the specified domain.
     * 
     * @param {string} token - The access token
     * @param {string} domainId - The domain
     * @param {Object} resource - The resource data
     */
    async addResource(token, domainId, resource) {
        this.log(`addResource(${token},${domainId}, ${JSON.stringify(resource)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}/resources`,
                resource, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * Remove the specified resource.
     * 
     * @param {string} token - The access token
     * @param {stirng} domainId - The domain id
     * @param {string} resourceId - The resource id
     */
    async removeResource(token, domainId, resourceId) {
        this.log(`removeResource(${token},${domainId},${resourceId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}/resources/${resourceId}`, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified resources of the specified domain.
     * 
     * @param {string} token - The access token
     * @param {string} domainId - The domain id
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listResources(token, domainId, query, opts) {
        this.log(`listResources(${token},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/domains/${domainId}/resources`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    // ------------------ components ------------------
    /**
     * Add a new component.
     * 
     * @param {string} token - The access token
     * @param {Object} component - The component data
     * @param {string} component.model - The component model
     * @param {string} component.layout - The component layout
     * @return {Object} The created component data
     */
    async addComponent(token, component) {
        this.log(`addComponent(${token},${JSON.stringify(component)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/components`,
                component, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Update the specified component with the specified data.
     * 
     * @param {string} token - The access token
     * @param {string} componentId - The component id
     * @param {Object} data - The data to update
     */
    async updateComponent(token, componentId, data) {
        this.log(`updateComponent(${token},${componentId},${JSON.stringify(data)})`);

        try {
            let { data: result } = await axios.put(
                `http://${this.opts.addr}:${this.opts.port}/components/${componentId}`,
                data, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove component.
     * 
     * @param {string} token - The access token
     * @param {Object} componentId - The component id
     */
    async removeComponent(token, componentId) {
        this.log(`removeComponent(${token},${componentId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/components/${componentId}`, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * List the specified components.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listComponents(token, query, opts) {
        this.log(`listComponents(${token},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/components`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Add the specified permission to the component.
     * 
     * @param {string} token - The access token
     * @param {string} componentId- The component id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addComponentPerm(token, componentId, perm) {
        this.log(`addComponentPerm(${token},${componentId},${JSON.stringify(perm)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/components/${componentId}/perms`,
                perm, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified permission from the component.
     * 
     * @param {string} token - The access token
     * @param {string} componentId- The component id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeComponentPerm(token, componentId, perm) {
        this.log(`removeComponentPerm(${token},${componentId},${JSON.stringify(perm)})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/components/${componentId}/perms`, { headers: { "Authorization": `Bearer ${token}` }, data: perm }
            );
            return result;
        } catch (err) {
            this._error(err);
        }


    }


    // ------------------ deployments ------------------

    /**
     * Add new deployment.
     * 
     * @param {string} token - The access token
     * @param {string} componentId - The component id
     * @param {Object} [deployment] - The deployment data
     * @param {Object} [deployment.labels] - The deployment user labels
     * @param {Object} [deployment.variables] - The deployment variables {name: value}
     * @param {Object} [deployment.entrypoints] - The deployment entrypoints {name: {protocol, path?}}
     * @param {Array<string>} [deployment.domains] - The deployment target domains
     * @return {string} The operation identifier
     */
    async addDeployment(token, componentId, deployment) {
        this.log(`addDeployment(${token},${componentId},${JSON.stringify(deployment)})`);

        let payload = {
            componentId: componentId,
            deployment: deployment
        }
        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/deployments`,
                payload, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified deployment.
     * 
     * @param {string} token - The access token
     * @param {string} instanceId - The instance id
     */
    async removeDeployment(token, instanceId) {
        this.log(`removeDeployment(${token},${instanceId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/deployments/${instanceId}`, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * List the specified deployments.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listDeployments(token, query, opts) {
        this.log(`listDeployments(${token},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/deployments`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Add the specified permission to the deployment.
     * 
     * @param {string} token - The access token
     * @param {string} instanceId- The instance id
     * @param {Object} perm - The permission to add
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async addDeploymentPerm(token, instanceId, perm) {
        this.log(`addDeploymentPerm(${token},${instanceId},${JSON.stringify(perm)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/deployments/${instanceId}/perms`,
                perm, { headers: { "Authorization": `Bearer ${token}` } }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    /**
     * Remove the specified permission from the instance.
     * 
     * @param {string} token - The access token
     * @param {string} instanceId- The instance id
     * @param {Object} perm - The permission to remove
     * @param {string} perm.role - The target role
     * @param {string} perm.type - The permission type ("read", "write")
     */
    async removeDeploymentPerm(token, instanceId, perm) {
        this.log(`removeDeploymentPerm(${token},${instanceId},${JSON.stringify(perm)})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/deployments/${instanceId}/perms`, {
                    headers: { "Authorization": `Bearer ${token}` },
                    data: perm
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }


    }



    // ------------------ instances ------------------

    /**
     * Add new instance. 
     * 
     * @param {string} token - The access token
     * @param {Object} spec - The instance specification
     * @param {string} [spec.parent] - The instance parent
     * @param {string} [spec.subcomponent] - The subcomponent name
     * @param {string} [spec.connector] - The connector name
     * @param {Object} [spec.deployment] - The instance deployment data
     * @param {Object} [spec.deployment.variables] - The instance variables
     * @param {Object} [spec.deployment.entrypoints] - The instance entrypoints
     * @param {Array<string>} [spec.deployment.domains] - The instance target domains
     * @param {Array<string>} [spec.deployment.labels] - The instance labels
     * @param {Object} [spec.model] - The instance model
     */
    async addInstance(token, spec) {
        this.log(`addInstance(${token},${JSON.stringify(spec)})`);

        try {
            let { data: result } = await axios.post(
                `http://${this.opts.addr}:${this.opts.port}/instances`,
                spec, {
                    headers: { "Authorization": `Bearer ${token}` }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }


    /**
     * Remove the specified instance.
     * 
     * @param {string} token - The access token
     * @param {string} instanceId - The instance
     */
    async removeInstance(token, instanceId) {
        this.log(`removeInstance(${token},${instanceId})`);

        try {
            let { data: result } = await axios.delete(
                `http://${this.opts.addr}:${this.opts.port}/instances/${instanceId}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    /**
     * List the specified instances.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listInstances(token, query, opts) {
        this.log(`listInstances(${token},${JSON.stringify(query)},${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/instances`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: { "Authorization": `Bearer ${token}` }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }
    }

    // ------------------ graphs ------------------
    /**
     * List the specified graphs.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - The query
     * @param {Object} [opts] - Additional options
     * @return {Object} The query results
     */
    async listGraphs(token, query, opts) {
        this.log(`listGraphs(${token},${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

        try {
            let { data: result } = await axios.get(
                `http://${this.opts.addr}:${this.opts.port}/graphs`, {
                    params: {
                        query: JSON.stringify(query || {}),
                        opts: JSON.stringify(opts || {})
                    },
                    headers: { "Authorization": `Bearer ${token}` }
                }
            );
            return result;
        } catch (err) {
            this._error(err);
        }

    }

    _error(err) {
        this.log(`ERROR: ${err.message}, ${err.stack}`);
        if (err.response) {
            let err0 = new Error();
            err0.type = err.response.data && err.response.data.type || "RealmError";
            err0.message = err.response.data && err.response.data.message || err.message;
            err0.cause = err;
            err0.stack = err.response.data && err.response.data.stack || err.stack;
            throw err0;
        } else {
            throw err;
        }

    }



}

export default new RealmAPI({
    //host: "192.168.1.20:8000"
    host: "127.0.0.1:8000"
});