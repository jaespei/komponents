import util from './util';
import _ from 'lodash';

let { asyncResult } = util;

//------------------------------ INIT ------------------------------- 
let icons = {
    //lb: '<path d="M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z" />',
    /*lb: `<path
    d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"
    id="path3884" />
 <g
    aria-label="LB"
    style="font-style:normal;font-weight:normal;font-size:9.33519745px;line-height:1.25;font-family:sans-serif;letter-spacing:0px;word-spacing:0px;fill:#000000;fill-opacity:1;stroke:none;stroke-width:0.23337993"
    id="text3896">
   <path
      d="M 6.9697989,8.6665151 H 7.8905557 V 14.697016 H 11.204368 V 15.47191 H 6.9697989 Z"
      style="stroke-width:0.23337993"
      id="path62" />
   <path
      d="m 13.086906,12.221913 v 2.493336 h 1.476857 q 0.742987,0 1.098527,-0.3054 0.360098,-0.309957 0.360098,-0.943547 0,-0.638149 -0.360098,-0.93899 -0.35554,-0.305399 -1.098527,-0.305399 z m 0,-2.7987364 v 2.0511904 h 1.362902 q 0.674614,0 1.002805,-0.250701 0.332748,-0.255259 0.332748,-0.774894 0,-0.5150768 -0.332748,-0.7703361 Q 15.124422,9.4231766 14.449808,9.4231766 Z M 12.166149,8.6665151 h 2.352032 q 1.052945,0 1.62272,0.4375874 0.569775,0.4375873 0.569775,1.2443895 0,0.624473 -0.291725,0.993688 -0.291725,0.369214 -0.856942,0.460378 0.679172,0.145862 1.052945,0.610799 0.378331,0.460378 0.378331,1.153225 0,0.91164 -0.619916,1.408484 -0.619915,0.496844 -1.764024,0.496844 h -2.443196 z"
      style="stroke-width:0.23337993"
      id="path64" />
 </g>`*/
    lb: "ks-connector-lb",
    ps: "ks-connector-ps",
    ms: "ks-connector-ms"
}

function init() {
    /*************** Components **************
     * 
     * Fields:
     * - {string} component.type - The component type (basic, composite)
     * - {string} component.name - The component name
     * - {string} component.title - The component title
     * - {string} [component.summary] - The component summary
     * - {string} [component.desc] - The component description
     * - {Array.<string>} [component.tags] - The component tags
     * - {Array.<string>} [component.labels] - The component labels
     * - {string} [component.model] - The component model
     * - {string} [component.layout] - The component  layout
     * - {string} [component.pict] - The component picture in base64
     * - {Array.<Object>} [component.perms] - The component picture in base64
     */
    // @core components
    localStorage.setItem("/components/lb", JSON.stringify({
        id: "lb",
        type: "basic",
        name: "LoadBalancer",
        title: "Load Balancer",
        summary: "Load Balancer native connector",
        desc: "This Load Balancer must be provided by the target platform",
        labels: ["tag=@core", "tag=@connector", `@icon=${icons.lb}`],
        model: {
            type: 'basic',
            name: `LoadBalancer`,
            durability: 'stateless',
            runtime: 'docker',
            source: 'komponents/loadbalancer',
            cardinality: '[:]',
            volumes: {},
            endpoints: {},
            events: {}
        },
        perms: [{ role: '1', type: 'owner' }]
    }));


}

init();



//------------------------------ USERS -------------------------------


/*************** Auth **************/
async function login(cred) {
    return {
        token: '1',
        user: {
            id: '1',
            name: "Admin",
            surname: "",
            email: "admin@komponents.com",
            pict: "",
            perms: [{
                role: '1',
                type: 'owner'
            }],
            groups: []
        }
    }

}

async function logout(token) {

}


// ------------------ users ------------------
/**
     * List users.
     * 
     * @param {string} token - The access token
     * @param {Object} [query] - Determines which users must be listed
     * @param {Object} [opts] - Query options
     * @return {Array<Object>} The users
     */
async function listUsers(token, query, opts) {
    util.log(`listUsers(${JSON.stringify(query)}, ${JSON.stringify(opts)})`);

    return [{
        id: '1',
        name: "Admin",
        surname: "",
        email: "admin@komponents.com",
        pict: "",
        perms: [{
            role: '1',
            type: 'owner'
        }],
        groups: []
    }]
}


//------------------------------ COMPONENTS -------------------------------


/**
 * Add a new component.
 * 
 * @param {string} token - The access token
 * @param {Object} component - The component data
 * @param {string} component.model - The component model
 * @param {string} component.layout - The component layout
 * @return {Object} The created component data
 */
async function addComponent(token, component) {
    util.log(`addcomponent(${JSON.stringify(component)})`);
    component.id = "" + Date.now();
    component.perms = [{ role: "1", type: "owner" }];
    localStorage.setItem(`/components/${component.id}`, JSON.stringify(component));
    return component;
}

/**
 * Update the specified component with the specified data.
 * 
 * @param {string} token - The access token
 * @param {string} componentId - The component id
 * @param {Object} data - The data to update
 */
async function updateComponent(token, componentId, data) {
    util.log(`updateComponent(${componentId},${JSON.stringify(data)})`);

    let comps = await listComponents(token, { id: componentId });
    if (!comps.length) throw new Error("Unable to find component");

    let component = comps[0];
    for (let att in data) {
        component[att] = _.cloneDeep(data[att]);
    }
    localStorage.setItem(`/components/${component.id}`, JSON.stringify(component));

    return component;
}

/**
 * Remove component.
 * 
 * @param {string} token - The access token
 * @param {Object} componentId - The component id
 */
async function removeComponent(token, componentId) {
    util.log(`removeComponent(${componentId})`);

    localStorage.removeItem(`/components/${componentId}`);
}


/**
 * List the specified components.
 * 
 * @param {string} token - The access token
 * @param {Object} [query] - The query
 * @param {Object} [opts] - Additional options
 * @return {Object} The query results
 */
async function listComponents(token, query, opts) {
    util.log(`listComponents(${JSON.stringify(query)},${JSON.stringify(opts)})`);

    let result = [];
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (!key.startsWith("/components/")) continue;
        let comp = JSON.parse(localStorage.getItem(key));
        let matches = true;
        for (let key in query) {
            matches = false;
            let values = [];
            if (Array.isArray(query[key])) {
                values = query[key];
            } else if (typeof (query[key] == 'object') && query[key]["$in"]) {
                values = query[key]["$in"];
            } else if (typeof (query[key] == 'object') && query[key]["$any"]) {
                values = query[key]["$any"];
            } else {
                values = [query[key]];
            }
            for (let val of values) {
                if (_.isArray(comp[key])) matches = comp[key].includes(val);
                else if (typeof (comp[key]) == "string" || comp[key] instanceof String) matches = comp[key].indexOf(val) != -1;
                else matches = (comp[key] == val);
                if (matches) break;
            }
            if (!matches) break;
        }
        if (matches) result.push(comp);
    }
    util.log(`listComponents(${JSON.stringify(query)},${JSON.stringify(opts)}) -> ${JSON.stringify(result)}`);
    return result;
}



export default {
    login,
    logout,
    listUsers,
    addComponent,
    updateComponent,
    removeComponent,
    listComponents
};