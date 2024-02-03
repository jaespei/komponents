#!/usr/bin/env node

/**
 * Deployer of high-level MSA models to different target platforms.
 * 
 * @module deployer
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const child_process = require("child_process");

const _ = require("lodash");
const YAML = require("yaml");
const commandExists = require("command-exists").sync;

const Q = require("q");
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

const yargs = require("yargs/yargs");
const { hideBin } = require('yargs/helpers')

const winston = require("winston");
let logger = winston.createLogger({
    level: "debug",
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console(),
        //new winston.transports.File({ filename: 'combined.log' })
    ]
});

const targets = require("./targets");
const ajv = new (require("ajv"))();
ajv.addSchema(require("../schemas/basic.json"), "basic");
ajv.addSchema(require("../schemas/composite.json"), "composite");
ajv.addSchema(require("../schemas/deployment.json"), "deployment");

const models = {};


/**
 * Main function called when this file is used as a script.
 */
function main() {
    yargs(hideBin(process.argv))
        .scriptName("deployer")
        .usage("$0 <cmd> [args]")
        .command('validate [url]', 'Validate specification ', (yargs) => {
            return yargs
                .positional('url', {
                    describe: 'Specification location',

                })
        }, async (argv) => {

            let opts = argv;
            logger = opts.logger = winston.createLogger({
                level: argv.verbose == 0 ? "warn" : (argv.verbose == 1 ? "info" : (argv.verbose == 2 ? "debug" : "silly")),
                format: winston.format.simple(),
                transports: [
                    new winston.transports.Console(),
                    //new winston.transports.File({ filename: 'combined.log' })
                ]
            });

            try {
                await validate(opts)
            } catch (err) {
                console.error(err.stack);
            }
        })
        .command('translate [url] [opts]', 'Translate specification.', (yargs) => {
            return yargs
                .positional('url', {
                    describe: 'Specification location',
                    //default: 5000
                })
                .option('target', {
                    alias: "t",
                    describe: "The target platform",
                    choices: ['k8s', 'compose'],
                    default: "k8s",
                    type: "string"
                })
                .option('output', {
                    alias: "o",
                    describe: "The output directory",
                    default: "out",
                    type: "string"
                })
                .option('storage', {
                    alias: "s",
                    describe: "The volumes storage url",
                    default: "file://./volumes",
                    type: "string"
                })
                .option('registry', {
                    alias: "r",
                    describe: "The registry URL where built images will be registered",
                    type: "string"
                })
        }, async (argv) => {

            let opts = argv;
            logger = opts.logger = winston.createLogger({
                level: argv.verbose == 0 ? "warn" : (argv.verbose == 1 ? "info" : (argv.verbose == 2 ? "debug" : "silly")),
                format: winston.format.simple(),
                transports: [
                    new winston.transports.Console(),
                    //new winston.transports.File({ filename: 'combined.log' })
                ]
            });

            try {
                // Translate model
                await translate(opts)
            } catch (err) {
                console.error(err.stack);
            }

        })
        .command('deploy [url]', 'Deploy specification ', (yargs) => {
            return yargs
                .positional('url', {
                    describe: 'Specification location'
                })
                .option('target', {
                    alias: "t",
                    describe: "The target platform",
                    choices: ['k8s', 'compose'],
                    default: "k8s",
                    type: "string"
                })
                .option('output', {
                    alias: "o",
                    describe: "The output directory",
                    default: "out",
                    type: "string"
                })
                .option('storage', {
                    alias: "s",
                    describe: "The volumes storage url",
                    default: "file://./volumes",
                    type: "string"
                })
                .option('registry', {
                    alias: "r",
                    describe: "The registry URL where built images will be registered",
                    type: "string"
                })
        }, async (argv) => {

            let opts = argv;
            logger = opts.logger = winston.createLogger({
                level: argv.verbose == 0 ? "warn" : (argv.verbose == 1 ? "info" : (argv.verbose == 2 ? "debug" : "silly")),
                format: winston.format.simple(),
                transports: [
                    new winston.transports.Console(),
                    //new winston.transports.File({ filename: 'combined.log' })
                ]
            });

            try {
                // Deploy model
                await deploy(opts)
            } catch (err) {
                console.error(err.stack);
            }

        })
        .command('undeploy [url]', 'Undeploy specification ', (yargs) => {
            return yargs
                .positional('url', {
                    describe: 'Specification location'
                })
                .option('target', {
                    alias: "t",
                    describe: "The target platform",
                    choices: ['k8s', 'compose'],
                    default: "k8s",
                    type: "string"
                })
                .option('output', {
                    alias: "o",
                    describe: "The output directory",
                    default: "out",
                    type: "string"
                })
                .option('storage', {
                    alias: "s",
                    describe: "The volumes storage url",
                    default: "file://./volumes",
                    type: "string"
                })
                .option('registry', {
                    alias: "r",
                    describe: "The registry URL where built images will be registered",
                    type: "string"
                })
        }, async (argv) => {
            try {

                let opts = argv;
                logger = opts.logger = winston.createLogger({
                    level: argv.verbose == 0 ? "warn" : (argv.verbose == 1 ? "info" : (argv.verbose == 2 ? "debug" : "silly")),
                    format: winston.format.simple(),
                    transports: [
                        new winston.transports.Console(),
                        //new winston.transports.File({ filename: 'combined.log' })
                    ]
                });

                try {
                    // Undeploy model
                    await undeploy(opts)
                } catch (err) {
                    console.error(err.stack);
                }

            } catch (err) {
                console.error(err.stack);
            }

        })

        .option('verbose', {
            alias: 'v',
            type: 'boolean',
            description: 'Run with verbose logging'
        })
        .count('verbose')
        .help()
        .argv


}

/**
 * Validate model. If the model is invalid an exception is thrown.
 * 
 * @param {Object} opts - Options
 * @param {string} opts.url - The specification URL
 * @return {Object} The resolved model
 */
async function validate(opts) {
    console.error(`- Validating model ${opts.url}`);

    if (!opts.url) throw new Error("Missing model URL");

    let spec;
    if (_.isString(opts.url)) {
        spec = await _fetchUrl(opts.url, opts);
        spec = YAML.parse(spec);
    } else spec = opts.url;

    // 1. Validate deployment syntax
    let validate = ajv.getSchema("deployment");
    if (!validate(spec)) {
        throw new Error(YAML.stringify(validate.errors));
    }

    // 2. Validate composite component
    let model = await _validateComponent(spec, spec.model, {prefix: "", parent: null});

    console.error(`- The model is apparently valid :-)`);

    return model;
}


/**
 * Translate model. 
 * 
 * @param {Object} opts - Options
 * @param {string} opts.url - The specification URL
 * @param {string} opts.target - Target platform
 * @param {string} opts.volumes - Volumes url
 * @param {string} opts.output - Output folder
 * @param {string} opts.storage - Volume storage
 * @param {string} opts.registry - Image registry
 * @returns A dictionary with all the translated artifacts
 */
async function translate(opts) {

    // 1. Validate parameters
    let [_schema, _path] = opts.storage.split("://");
    if (!_path) {
        _path = _schema;
        _schema = "file";
    }
    if (!["file", "nfs"].includes(_schema)) throw new Error(`Unsupported schema ${schema} for volumes storage`);

    opts.storage = `${_schema}://${_path}`;

    // 2. Validate model
    let validated = await validate(opts);

    // 3. Translate deployment
    console.error(`- Translating model`);
    let artifacts = await targets[opts.target].translateDeployment(
        validated,
        opts
    );

    // 4. Translate composite
    artifacts.push(... await _translateComposite(
        validated,
        opts)
    );

    // 5. Pack artifacts
    artifacts = await targets[opts.target].packArtifacts(artifacts, opts);

    if (fs.existsSync(opts.output)) {
        fs.rmSync(opts.output, { recursive: true, force: true });
    }
    fs.mkdirSync(opts.output);
    for (let i = 0; i < artifacts.length; i++) {
        let artifact = artifacts[i];
        //let fileName = path.join(opts.output, i + "." + (artifact.prefix? artifact.prefix + ".": "") + artifact.name + artifact.suffix);
        let fileName = path.join(opts.output, (artifact.prefix ? artifact.prefix + "." : "") + artifact.name + artifact.suffix);
        fs.writeFileSync(fileName, artifact.content);
    }

    console.error(`- The model has been correctly translated (in ${opts.output} folder) :-)`);

    return artifacts;
}

/**
 * Deploy model to the target platform.
 * 
 * @param {Object} opts - Options
 * @param {string} opts.url - The specification URL
 * @param {string} opts.target - Target platform
 * @param {string} opts.volumes - Volumes url
 * @param {string} opts.output - Output folder
 * @param {string} opts.storage - Volume storage
 * @param {string} opts.registry - Image registry
 */
async function deploy(opts) {

    // 1. Translate model
    let artifacts = await translate(opts);

    console.error(`- Deploying model`);

    // 2. Deploy artifacts
    await targets[opts.target].deployArtifacts(
        artifacts,
        opts
    );

    console.error(`- The model has been correctly deployed :-)`);

}

/**
 * Undeploy model from the target platform.
 * 
 * @param {Object} opts - Options
 * @param {string} opts.url - The specification URL
 * @param {string} opts.target - Target platform
 * @param {string} opts.volumes - Volumes url
 * @param {string} opts.output - Output folder
 * @param {string} opts.storage - Volume storage
 * @param {string} opts.registry - Image registry
 */
async function undeploy(opts) {


    // 1. Translate model
    let artifacts = await translate(opts);

    console.error(`- Undeploying model`);

    // 2. Deploy artifacts
    await targets[opts.target].undeployArtifacts(
        artifacts,
        opts
    );

    console.error(`- The model has been correctly undeployed :-)`);

}

/**
 * Validate the given component deployment. * 
 * This involves:
 * 1. Validate the syntax of this component spec (using JSON Schema)
 * 2. Resolve this model, evaluating and propagating variabes down the hierarchy
 * 3. Register the resolved model in a global table
 * 4. Validate subcomponents recursively
 * 
 * @param {Object} deployment - The deployment data
 * @param {Object} model - The component model
 * @param {Object} opts - Additional options
 * @param {string} opts.prefix - The current prefix in the components hierarchy
 * @param {Object} opts.parent - The parent model
 */
async function _validateComponent(deployment, model, opts) {
    logger.debug(`_validateComponent(${JSON.stringify(deployment)},${JSON.stringify(model)})`)

    // Validate syntax
    let validate = ajv.getSchema(model.type);
    if (!validate(model)) {
        throw new Error(YAML.stringify(validate.errors));
    }

    // Resolve model
    model = await _resolveModel(deployment, model, opts);

    // Validate subcomponents
    for (let subcompName in model.subcomponents) {
        let subcomp = model.subcomponents[subcompName];
        let subcompType = model.imports[subcomp.type];

        // Validate subcomponent deployment
        await _validateComponent(
            subcomp,
            subcompType,
            {
                prefix: opts.prefix ? `${opts.prefix}.${model.name}` : model.name,
                parent: model,
                atts: { tag: "component" }
            }
        );
    }

    // Validate connectors
    for (let conName in model.connectors) {
        let con = model.connectors[conName];
        let conType = model.imports[con.type];

        // Validate connector deployment
        if (conType) await _validateComponent(
            con,
            conType,
            {
                prefix: opts.prefix ? `${opts.prefix}.${model.name}` : model.name,
                parent: model,
                atts: { tag: "connector" }
            }
        );

    }
    return model;

}

/**
 * Translates the specified composite model to platform artifacts.
 * 
 * @param {Object} model - The model to translate
 * @param {Object} opts  - Additional options
 * @returns {Array<Object>} - The translated artifacts
 */
async function _translateComposite(model, opts) {
    logger.debug(`_translateComposite(${(model.prefix ? model.prefix + "." : "")}${model.name})`);

    let artifacts = [];

    // 1. Apply topological order
    let nodes = _topologicalOrder(model, opts);

    // 2. Translate subcomponents/connectors in order
    for (let node of nodes) {
        if (node.type == "subcomponent") {
            let subcompName = node.name;
            let subcomp = model.subcomponents[subcompName];
            //let subcompType = model.imports[subcomp.type];   
            let subcompType = models[`${model.prefix ? model.prefix + "." : ""}${model.name}.${subcompName}`];
            let subcompArtifacts = [];
            if (subcompType.type == "basic") {

                // - Calculate adjacents
                let adjacents = _findAllComponentAdjacents(subcomp, subcompType, opts);
                subcompArtifacts = await targets[opts.target].translateBasic(subcompType, adjacents, opts);

            } else {
                subcompArtifacts = await _translateComposite(subcompType, opts)
            }
            artifacts.push(...subcompArtifacts);

        } else {
            let conName = node.name;
            let con = model.connectors[conName];
            let conType = models[`${model.prefix ? model.prefix + "." : ""}${model.name}.${conName}`];
            let adjacents = _findConnectorAdjacents(con, model, opts);
            let conInput = _findConnectorInput(con, model, opts);
            if (conType) {
                // - translate first user-defined connector
                let compArtifacts = [];
                if (conType.type == "basic") {
                    conType.entrypoint = con.entrypoint || conType.entrypoint || {
                        protocol: conInput.protocol,
                        publish: false
                    };
                    compArtifacts = await targets[opts.target].translateBasic(conType, adjacents, opts);
                } else {
                    /*conType.entrypoint = con.entrypoint || conType.entrypoint || { 
                        protocol:  adjacents[0].endpoint.protocol,
                        publish: false
                    };*/
                    compArtifacts = await _translateComposite(conType, opts);
                }
                artifacts.push(...compArtifacts);
            }
            if (!conType || conType.type == "basic") {
                // - translate later native/basic connector
                let conArtifacts = await targets[opts.target].translateConnector(con, conType, model, conInput, adjacents, opts);
                artifacts.push(...conArtifacts);
            }

        }
    }

    return artifacts;

}


/**
 * Calculate topological order of the specified composite model.
 *  
 * @param {Object} model - The composite model
 * @returns {Array<Object>} - The sorted list of nodes {type,name}
 */
function _topologicalOrder(model, opts) {
    logger.debug(`_topologicalOrder(${(model.prefix ? model.prefix + "." : "")}${model.name})`);

    // Mark all nodes as unvisited
    let allNodes = [];
    allNodes.push(
        ...(_.map(model.connectors, (con, conName) => {
            return { type: "connector", name: conName, visited: false }
        })),
        ...(_.map(model.subcomponents, (subcomp, subcompName) => {
            return { type: "subcomponent", name: subcompName, visited: false }
        }))
    );

    /**
     * Visit node recursively.
     * 
     * @param {Object} node - The node to visit
     * @param {Array<Object>} nodes - The list of sorted nodes 
     */
    let visitNode = function (node, nodes) {

        // 1. Mark as visited
        _.find(allNodes, (n) => n.type == node.type && n.name == node.name).visited = true;

        // 2. Look for adjacent nodes
        if (node.type == "subcomponent") {
            // - If subcomponent then look for connectors
            for (let conName in model.connectors) {
                let con = model.connectors[conName];
                if (con.inputs) {
                    for (let input of con.inputs) {
                        if (input.subcomponent == node.name) {
                            if (!_.find(allNodes, (n) => n.type == "connector" && n.name == conName).visited)
                                visitNode({ type: "connector", name: conName }, nodes);
                        }
                    }
                }
            }
        } else {
            // - If connector then look for outputs
            let con = model.connectors[node.name];
            if (con.outputs) {
                for (let output of con.outputs) {
                    //let [targetName, targetEp] = output.split(".");
                    if (!_.find(allNodes, (n) => n.type == "subcomponent" && n.name == output.subcomponent).visited)
                        visitNode({ type: "subcomponent", name: output.subcomponent }, nodes);
                }
            }
        }

        // 3. Add to list of sorted nodes
        nodes.push(node)
    }

    // Obtain initial nodes, that is, all nodes with no incoming edges
    let initNodes = [];
    _.each(model.connectors, (con, conName) => {
        if (!con.inputs || con.inputs.length == 0) initNodes.push({ type: "connector", name: conName });
    });
    _.each(model.subcomponents, (subcomp, subcompName) => {
        let found = false;
        for (let conName in model.connectors) {
            let con = model.connectors[conName];
            for (let output of con.outputs) {
                if (output.subcomponent == subcompName) {
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (!found) initNodes.push({ type: "subcomponent", name: subcompName });
    });

    let sorted = [];
    for (let node of initNodes) {
        if (!_.find(allNodes, (n) => n.type == node.type && n.name == node.name).visited)
            visitNode(node, sorted);
    }
    logger.debug(` ---> order: ${JSON.stringify(sorted)})`);

    return sorted;
}

/**
 * Look for connector input adjacent.
 * 
 * @param {Object} con - The connector data
 * @param {Object} parent - The parent model
 * @param {Object} opts - Additional options
 * @returns {Object} - The adjacent information
 */
function _findConnectorInput(con, parent, opts) {
    logger.debug(`_findConnectorInput(${(parent.prefix ? parent.prefix + "." : "")}${parent.name}.${con.name})`);

    let type;
    let endpoint = _.find(parent.endpoints, (ep) => ep.type == "in" && ep.mapping == con.name);
    while (endpoint && parent.prefix && parent.tag == "connector") {//} && parent.prefix) {
        type = parent;
        parent = models[parent.prefix];
        con = _.find(parent.connectors, (con) => con.name == type.name);
        endpoint = _.find(parent.endpoints, (ep) => ep.type == "in" && ep.mapping == con.name);
    }
    let conInput;
    if (!endpoint) {
        // - we are a connector which is not composite input
        let subcomp = parent.subcomponents[con.inputs[0].subcomponent];
        let subcompType = models[`${parent.prefix ? parent.prefix + "." : ""}${parent.name}.${subcomp.name}`];
        conInput = {
            endpoint: subcompType.endpoints[con.inputs[0].endpoint],
            protocol: subcompType.endpoints[con.inputs[0].endpoint].protocol,
            type: subcompType.type,
            prefix: `${parent.prefix ? parent.prefix + "." : ""}${parent.name}`,
            name: subcomp.name
        };
    } else {
        conInput = {
            endpoint: endpoint,
            protocol: endpoint.protocol,
            type: "unknown",
            prefix: "",
            name: "unknown"
        };
    }
    /*} else if (!parent.prefix) {
        conInput = {
            endpoint: endpoint,
            protocol: endpoint.protocol,
            type: "unknown",
            prefix: "",
            name: "unknown"
        }
    } else {
        conInput = {
            endpoint: endpoint,
            protocol: endpoint.protocol,
            type: "unknown",
            prefix: `${parent.prefix? parent.prefix + ".": ""}${parent.name}`,
            name: "unknown"
        };*/


    logger.debug(` ---> conInput=${JSON.stringify(conInput)}`);
    return conInput;
}

/**
 * Look for composite input adjacent.
 * 
 * @param {Object} deployment - The deployment information
 * @param {Object} model - The model
 * @param {Object} endpoint - The endpoint to explore
 * @param {Object} opts - Additional options
 * @returns {Object} - The adjacent information
 */
function _findCompositeInput(deployment, model, endpoint, opts) {
    logger.debug(`_findCompositeInput(${(model.prefix ? model.prefix + "." : "")}${model.name},${endpoint.name})`);

    // - if composite, we need to go deeper in the hierarchy
    //   until we either find a 'basic' or a 'connector'
    let conName = endpoint.mapping;
    let conType = models[`${model.prefix ? model.prefix + "." : ""}${model.name}.${conName}`];
    while (conType && conType.type == "composite") {
        conName = _.find(conType.endpoints, (ep) => ep.type == "in").mapping;
        model = conType;
        conType = models[`${model.prefix ? model.prefix + "." : ""}${model.name}.${conName}`];
    }
    let adjacent = {
        endpoint: endpoint,
        protocol: endpoint.protocol,
        type: conType ? conType.type : "connector",
        prefix: `${model.prefix ? model.prefix + "." : ""}${model.name}`,
        name: conName
    }
    return adjacent;

}

/**
 * Look for all connector adjacents.
 * 
 * @param {Object} con - The connector information
 * @param {Object} parent - The parent model
 * @param {Object} opts - Additional options
 * @returns {Array<Object} - The adjacents information
 */
function _findConnectorAdjacents(con, parent, opts) {
    logger.debug(`_findConnectorAdjacents(${(parent.prefix ? parent.prefix + "." : "")}${parent.name}.${con.name})`);

    let adjacents = [];
    let conType = models[`${parent.prefix ? parent.prefix + "." : ""}${parent.name}.${con.name}`];
    let endpoint;

    // look for connector endpoint
    if (conType) {
        endpoint = _.find(conType.endpoints, (ep, epName) => ep.type == "out")
    }
    _.each(con.outputs, (output) => {
        let subcomp = parent.subcomponents[output.subcomponent];
        //let subcompType = parent.imports[subcomp.type];
        let path = `${(parent.prefix ? parent.prefix + "." : "")}${parent.name}.${output.subcomponent}`;
        let subcompType = models[path];

        if (subcompType.type == "basic") {
            adjacents.push({
                endpoint: endpoint || subcompType.endpoints[output.endpoint],
                protocol: subcompType.endpoints[output.endpoint].protocol,
                type: subcompType.type,
                prefix: `${parent.prefix ? parent.prefix + "." : ""}${parent.name}`,
                name: subcomp.name
            })
        } else {
            let inEp = _.find(
                subcompType.endpoints,
                (ep) => ep.type == "in" && ep.name == output.endpoint
            );
            let adjacent = _findCompositeInput(subcomp, subcompType, inEp, opts)
            adjacent.endpoint = endpoint || inEp;
            adjacent.protocol = inEp.protocol;
            adjacents.push(adjacent);
        }


    });
    logger.debug(` ---> adjacents=${JSON.stringify(adjacents)}`);
    return adjacents;
}

/**
 * Look for all component adjacents.
 * 
 * @param {Object} deployment - The deployment information
 * @param {Object} model - The model
 * @param {Object} opts - Additional options
 * @returns {Array<Object>} - The adjacents information
 */
function _findAllComponentAdjacents(deployment, model, opts) {
    logger.debug(`_findAllComponentAdjacents(${(model.prefix ? model.prefix + "." : "")}${model.name})`);
    let eps = _.filter(model.endpoints, (ep) => ep.type == "out");
    let adjacents = [];
    for (let ep of eps) {
        adjacents.push(..._findComponentAdjacents(deployment, model, ep, opts));
    }
    return adjacents;
}

/**
 * Look for component adjacents.
 * 
 * @param {Object} deployment - The deployment information
 * @param {Object} model - The model
 * @param {Object} endpoint - The endpoint to explore
 * @param {Object} opts - Additional options
 * @returns {Array<Object>} - The adjacents information
 */
function _findComponentAdjacents(deployment, model, endpoint, opts) {
    logger.debug(`_findComponentAdjacents(${(model.prefix ? model.prefix + "." : "")}${model.name}, ${model.name}, ${JSON.stringify(endpoint)}})`);


    let adjacents = [];

    // (1) look for connectors
    for (let conName in model.parent.connectors) {
        let con = model.parent.connectors[conName];
        // - find connector whose input is the specified endpoint
        let input = _.find(
            con.inputs,
            (input) => input.subcomponent == model.name && input.endpoint == endpoint.name
        );
        if (input) {
            let conType = models[`${model.prefix ? model.prefix + "." : ""}${conName}`];
            //let conType = model.parent.imports[con.type];
            if (conType) {
                // User-defined connector: search for front-end
                if (conType.type == "basic") {
                    // - if basic, we are done
                    let adjacent = {
                        endpoint: endpoint,
                        protocol: endpoint.protocol,
                        type: conType.type,
                        prefix: model.prefix,
                        name: conName
                    };
                    adjacents.push(adjacent);
                } else {
                    // - if composite, we need to go deeper in the hierarchy
                    //   until we either find a 'basic' or a 'connector'
                    let inEp = _.find(
                        conType.endpoints,
                        (ep) => ep.type == "in"
                    );

                    let adjacent = _findCompositeInput(
                        con, conType, inEp, opts
                    );
                    adjacent.endpoint = endpoint;
                    adjacents.push(adjacent);
                }

            } else if (con.type == "Link") {
                // Link connector
                // - look for link target
                let output = con.outputs[0];
                let subcompName = output.subcomponent;
                let subcomp = model.parent.subcomponents[subcompName];
                //let subcompType = opts.parent.imports[subcomp.type];
                let subcompType = models[`${model.prefix ? model.prefix + "." : ""}${subcompName}`];
                if (subcompType.type == "basic") {
                    // - if basic, we are done
                    let adjacent = {
                        endpoint: endpoint,
                        protocol: endpoint.protocol,
                        type: subcompType.type,
                        prefix: model.prefix,
                        name: subcompName
                    };
                    adjacents.push(adjacent);
                } else {
                    // - if composite, we need to go deeper in the hierarchy
                    //   until we either find a 'basic' or a 'connector'
                    let inEp = subcompType.endpoints[output.endpoint];
                    let adjacent = _findCompositeInput(
                        subcomp, subcompType, inEp, opts
                    );
                    adjacent.endpoint = endpoint;
                    adjacents.push(adjacent);
                }

            } else {
                // Native connector
                let adjacent = {
                    endpoint: endpoint,
                    protocol: endpoint.protocol,
                    type: "connector",
                    prefix: model.prefix,
                    name: conName
                };
                adjacents.push(adjacent);
            }
        }
    }

    // (2) look for parent mapping
    if (model.parent) {

        let _deployment = deployment;
        let _model = model;
        let _endpoint = endpoint;
        let parentEp;
        do {
            parentEp = _.find(
                _model.parent.endpoints,
                (ep) =>
                    ep.type == "out" &&
                    ep.mapping.subcomponent == _deployment.name &&
                    ep.mapping.endpoint == _endpoint.name
            );
            if (parentEp) {
                // - move one level up
                //_model = _model.parent;
                _model = models[_model.prefix];
                _deployment = _model.tag == "component" ?
                    _model.parent.subcomponents[_model.name] :
                    _model.parent.connectors[_model.name];
                _endpoint = parentEp;
            }
        } while (parentEp && _model.parent)
        if (_model != model) {
            if (_model.tag == "component")
                adjacents.push(..._.map(
                    _findComponentAdjacents(_deployment, _model, _endpoint, opts),
                    (adj) => { adj.endpoint = endpoint; return adj; }
                ));
            else
                adjacents.push(..._.map(
                    _findConnectorAdjacents(_deployment, _model.parent, opts),
                    (adj) => { adj.endpoint = endpoint; return adj; }
                ));
        }
    }
    logger.debug(` ---> adjacents=${JSON.stringify(adjacents)}`);
    return adjacents;

}

/**
 * Resolves the specified model. If the model is incorrect an exception is thrown.
 * 
 * This means:
 * - Propagating properties and variables down in the hierarchy.
 * 
 * @param {Object} deployment - The deployment data
 * @param {string} deployment.name
 * @param {Object} deployment.variables
 * @param {Object} deployment.volumes
 * @param {Object} deployment.entrypoints
 * @param {Object} model - The model
 * @param {string} model.type
 * @param {string} model.name
 * @param {Array<string>} model.labels
 * @param {string} model.cardinality
 * @param {string} model.durability
 * @param {string} model.runtime
 * @param {string} model.source     
 * @param {Object} model.variables
 * @param {Object} model.volumes
 * @param {Object} model.endpoints
 * @param {Object} model.imports
 * @param {Object} model.subcomponents
 * @param {Object} model.connectors
 * @param {Object} opts - Additional options
 * @param {string} opts.prefix - The prefix in the component hierarchy
 * @param {Object} opts.parent - The parent resolved model
 * @param {Object} opts.atts - Additional attributes to set in the model
 * @returns The resolved model
 */
async function _resolveModel(deployment, model, opts) {
    logger.debug(`_resolveModel(${opts.prefix ? opts.prefix + "." : ""}${deployment.name})`);

    // If model is a reference then download
    if (_.isString(model)) {
        model = await _fetchUrl(model, opts);
        model = YAML.parse(model);
    }

    // Initialize common properties
    model.labels = model.labels || [];
    model.cardinality = model.cardinality || "[1:1]";
    model.policies = model.policies || {};
    model.variables = model.variables || {};
    //model.volumes = model.volumes || {};
    model.endpoints = model.endpoints || {};

    // Overwrite model variables (everything else might depend on them)
    let modelVars = {};
    _.each(model.variables, (varVal, varName) => modelVars[varName] = String(varVal));
    let deployVars = {};
    _.each(deployment.variables, (varVal, varName) => deployVars[varName] = String(varVal));
    let variables = {};
    _.merge(variables, modelVars, deployVars);

    // Resolve variables (allow embedded variables)
    _.each(variables, (varVal, varName) => {
        variables[varName] = _text(
            varVal, { eval: variables }
        );
    });


    let resolved = {
        name: _text(
            deployment.name || model.name, { eval: variables, att: "name" }
        ),
        type: _text(
            model.type, { eval: variables, att: "type" }
        ),
        /*labels: _.map(
            model.labels.concat(deployment.labels || []),
            label => _text(
                label, { eval: variables }
            )
        ),*/
        cardinality: _text(
            deployment.cardinality || model.cardinality, { eval: variables, re: "\\[\\d*:\\d*\\]", att: "cardinality" }
        ),
        variables: variables
    };

    // Resolve labels
    resolved.labels = {};
    _.each(model.labels, (lblVal, lblName) => {
        resolved.labels[lblName] = _text(
            lblVal, { eval: variables }
        );
    });

    // Resolve policies
    resolved.policies = {};
    _.each(model.policies, (polVal, polName) => {
        if (!["cpu", "memory"].includes(polName)) throw new Error(`Error in model ${opts.prefix}.${deployment.name}: unsupported policy '${polName}'`);
        resolved.policies[polName] = _text(
            polVal, { eval: variables, re: "\\d*(.\\d+)?", att: "policies" }
        );
    });


    if (resolved.type == "basic") {
        // Resolve basic
        resolved.durability = _text(
            deployment.durability || model.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
        );
        resolved.runtime = _text(
            deployment.runtime || model.runtime, { eval: variables, att: "runtime", values: ["docker"] }
        );
        resolved.source = _text(
            deployment.source || model.source, { eval: variables, att: "source" }
        );

        resolved.resources = {};
        _.each(model.resources, (resVal, resName) => {
            if (!["cpu", "memory"].includes(resName)) throw new Error(`Error in model ${opts.prefix}.${deployment.name}: unsupported resource '${resName}'`);
            resolved.resources[resName] = _text(
                resVal, { eval: variables, re: "\\[\\d*(.\\d+)?:\\d*(.\\d+)?\\]", att: "resources" }
            );
        });

        resolved.variables = {};
        _.each(variables, (varVal, varName) => {
            resolved.variables[varName] = varVal;
        });

        resolved.events = {};
        _.each(model.events, (evCmd, evName) => {
            resolved.events[evName] = _text(
                evCmd, { eval: variables }
            );
        });

        resolved.volumes = {};
        _.each(model.volumes, (vol, volName) => {
            let _vol = {
                name: volName, // embed name
                type: _text(
                    vol.type, { eval: variables, att: "type" }
                ),
                path: _text(
                    vol.path, { eval: variables, att: "path" }
                ),
                scope: _text(
                    vol.scope, { eval: variables, values: ["local", "global"], att: "scope" }
                ) || "global",
                durability: _text(
                    vol.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                ) || "permanent",
                url: _text(
                    vol.url, { eval: variables, att: "url" }
                )
            };
            resolved.volumes[volName] = _vol;
        });

        resolved.endpoints = {};
        _.each(model.endpoints, (ep, epName) => {
            let _ep = {
                name: epName, // embed name
                type: _text(
                    ep.type, { eval: variables, required: true, values: ["in", "out"], att: "type" }
                ),
                protocol: _text(
                    ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                ),
                required: _text(
                    ep.required, { eval: variables, att: "required" }
                )
            };
            _ep.protocol = _ep.protocol.startsWith("http") ? "tcp:80" : _ep.protocol;
            resolved.endpoints[epName] = _ep;
        });

        /*resolved.entrypoints = {};
        _.each(model.entrypoints, (ep, epName) => {
            let _ep = {
                name: epName, // embed name                    
                protocol: _text(
                    ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                ),
                path: _text(
                    ep.path, { eval: variables, re: "\\/.*", att: "path" }
                ),
                mapping: ep.mapping
            };
            resolved.entrypoints[epName] = _ep;
        });*/


    } else if (resolved.type == "composite") {
        // Resolve composite
        model.subcomponents = model.subcomponents || {};
        model.connectors = model.connectors || {};
        model.imports = model.imports || {};

        // ------------- Resolve imports -------------
        resolved.imports = {};
        let promises = [];

        _.each(model.imports, async (type, typeName) => {

            if (_.isString(type)) {
                promises.push(_fetchUrl(type, opts).then(str => { resolved.imports[typeName] = YAML.parse(str); }));
            } else resolved.imports[typeName] = type;
        });

        await Q.waitAll(promises);

        // ------------- Resolve subcomponents -------------
        resolved.subcomponents = {};
        _.each(model.subcomponents, (subcomp, subcompName) => {
            subcomp = _.isString(subcomp) ? { type: subcomp } : subcomp;
            let _subcomp = {
                name: subcompName, // embed name
                type: _text(
                    subcomp.type, { eval: variables, att: "type" }
                ),
                cardinality: _text(
                    subcomp.cardinality, { eval: variables, re: "\\[\\d*:\\d*\\]", att: "cardinality" }
                ),
                /*durability: _text(
                    subcomp.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                )*/
            };
            let subcompType = resolved.imports[_subcomp.type];
            if (!subcompType) throw new Error(`Error in model: unknown subcomponent type ${_subcomp.type}`);

            // - Subcomponent variables
            _subcomp.variables = {};
            let subcompVars = _.merge({}, subcomp.variables, variables);
            _.each(subcomp.variables, (varVal, varName) => {
                if (!subcompType.variables || !(varName in subcompType.variables))
                    throw new Error(`Error in model: variable ${varName} not published by subcomponent ${subcompName}`);
                _subcomp.variables[varName] = _text(
                    varVal, { eval: subcompVars }
                );
            });

            // - Subcomponent labels
            _subcomp.labels = {};
            _.each(subcomp.labels, (lblVal, lblName) => {
                _subcomp.labels[lblName] = _text(
                    lblVal, { eval: variables }
                );
            });

            // - Subcomponent policies
            _subcomp.policies = {};
            _.each(subcomp.policies, (polVal, polName) => {
                _subcomp.policies[polName] = _text(
                    polVal, { eval: variables }
                );
            });

            // - Subcomponent volumes
            _subcomp.volumes = {};
            _.each(subcomp.volumes, (vol, volName) => {
                if (!subcompType.volumes || !subcompType.volumes[volName])
                    throw new Error(`Error in model: volume ${volName} not published by subcomponent ${subcompName}`);
                let _vol = {
                    name: volName, // embed name
                    type: _text(
                        vol.type, { eval: variables, att: "type" }
                    ),
                    path: _text(
                        vol.path, { eval: variables, att: "path" }
                    ),
                    scope: _text(
                        vol.scope, { eval: variables, values: ["local", "global"], att: "scope" }
                    ),
                    durability: _text(
                        vol.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                    ),
                    url: _text(
                        vol.url, { eval: variables, att: "url" }
                    )
                };
                _subcomp.volumes[volName] = _vol;
            });
            resolved.subcomponents[subcompName] = _subcomp;
        });

        // ------------- Resolve connectors -------------
        resolved.connectors = {};
        _.each(model.connectors, (con, conName) => {
            if (conName in resolved.subcomponents) throw new Error(`Error in model: duplicated connector/subcomponent name ${conName}`);
            if (!con.type) throw new Error(`Error in model: missing type for connector ${conName}`);
            //if (con.type != "Link" && !resolved.imports[con.type]) throw new Error(`Error in model: unknown connector type ${con.type}`);
            let _con = {
                name: conName, // embed name
                type: _text(
                    con.type, { eval: variables, att: "type" }
                )
            };

            // - Connector labels
            _con.labels = {};
            _.each(con.labels, (lblVal, lblName) => {
                _con.labels[lblName] = _text(
                    lblVal, { eval: variables }
                );
            });

            // - Connector policies
            _con.policies = {};
            _.each(con.policies, (polVal, polName) => {
                _con.policies[polName] = _text(
                    polVal, { eval: variables }
                );
            });

            // - Connector variables
            _con.variables = {};
            let conVars = _.merge({}, con.variables, variables);
            _.each(con.variables, (varVal, varName) => {
                if (!conType.variables || !conType.variables[varName])
                    throw new Error(`Error in model: variable ${varName} not published by connector ${conName}`);
                _con.variables[varName] = _text(
                    varVal, { eval: conVars }
                );
            });

            // - Validate outputs
            let outProtocol;
            _con.outputs = [];
            if (!con.outputs || !con.outputs.length) throw new Error(`Error in model: orphan connector ${conName} without outputs`);
            if (con.type == "Link" && con.outputs.length > 1) throw new Error(`Error in model: link connector ${conName} can only have one output`);
            _.each(con.outputs, output => {
                if (_.isString(output)) {
                    let _output = {};
                    [_output.subcomponent, _output.endpoint] = output.split(".");
                    output = _output;
                }
                if (!output.subcomponent || !output.endpoint) throw new Error(`Error in model: unsupported endpoint reference ${JSON.stringify(output)} for connector ${conName}`);
                let outSubcomp = resolved.subcomponents[output.subcomponent];
                if (!outSubcomp) throw new Error(`Error in model: unresolved endpoint reference ${JSON.stringify(output)} for connector ${conName}`);
                let outSubcompType = resolved.imports[outSubcomp.type];
                if (!outSubcompType.endpoints || !outSubcompType.endpoints[output.endpoint]) throw new Error(`Error in model: unresolved endpoint referente ${JSON.stringify(output)} for connector ${conName}`);

                // - Check output compatibility
                let outSubcompVars = _.merge({}, outSubcompType.variables, outSubcomp.variables);
                if (
                    _text(
                        outSubcompType.endpoints[output.endpoint].type, { eval: outSubcompVars }
                    ) != "in"
                ) throw new Error(`Error in model: the output of the connector ${conName} must connect to an in endpoint`);

                if (outProtocol) {
                    _outProtocol = _text(
                        outSubcompType.endpoints[output.endpoint].protocol, { eval: outSubcompVars, ignoreCase: true }
                    );
                    if (_outProtocol == "http") _outProtocol = "tcp:80";
                    else if (_outProtocol == "https") _outProtocol = "tcp:443";

                    if (_outProtocol != outProtocol) throw new Error(`Error in model: found incompatible protocols for outputs in connector ${conName}`);
                } else {
                    outProtocol = _text(
                        outSubcompType.endpoints[output.endpoint].protocol, { eval: outSubcompVars, ignoreCase: true }
                    );
                    if (outProtocol == "http") outProtocol = "tcp:80";
                    else if (outProtocol == "https") outProtocol = "tcp:443";

                }
                // everything ok, add output to connector
                _con.outputs.push({
                    subcomponent: output.subcomponent,
                    endpoint: output.endpoint
                });

            });

            // - Validate inputs (empty inputs are allowed for composite entry connectors)
            _con.inputs = [];
            if (con.type == "Link" && (!con.inputs || con.inputs.length != 1)) throw new Error(`Error in model: link connector ${conName} can only have one input`);
            if (con.inputs && con.inputs.length) {
                _.each(con.inputs, input => {
                    if (_.isString(input)) {
                        let _input = {};
                        [_input.subcomponent, _input.endpoint] = input.split(".");
                        input = _input;
                    }
                    if (!input.subcomponent) throw new Error(`Error in model: unsupported endpoint reference ${JSON.stringify(input)} for connector ${conName}`);
                    let inSubcomp = resolved.subcomponents[input.subcomponent];
                    if (!inSubcomp) throw new Error(`Error in model: unresolved endpoint reference ${JSON.stringify(input)} for connector ${conName}`);
                    let inSubcompType = resolved.imports[inSubcomp.type];
                    if (!inSubcompType.endpoints || !inSubcompType.endpoints[input.endpoint]) throw new Error(`Error in model: unresolved endpoint referente ${JSON.stringify(input)} for connector ${conName}`);

                    // - Check input compatibility
                    let inSubcompVars = _.merge({}, inSubcompType.variables, inSubcomp.variables);
                    if (
                        _text(
                            inSubcompType.endpoints[input.endpoint].type, { eval: inSubcompVars }
                        ) != "out"
                    ) throw new Error(`Error in model: the inputs of the connector ${conName} must connect to an out endpoint`);

                    let inProtocol = _text(
                        inSubcompType.endpoints[input.endpoint].protocol, { eval: inSubcompVars, ignoreCase: true }
                    );
                    if (inProtocol == "http") inProtocol = "tcp:80";
                    else if (inProtocol == "https") inProtocol = "tcp:443";
                    if (outProtocol != inProtocol) throw new Error(`Error in model: found incompatible protocols for inputs/outputs in connector ${conName}`);

                    // everything ok, add input to connector
                    _con.inputs.push({
                        subcomponent: input.subcomponent,
                        endpoint: input.endpoint
                    });
                });
            } else {
                // If empty inputs we need to check whether it is a composite entry connector
                let publishedEpName;
                let publishedEp = _.find(model.endpoints, (ep, epName) => {
                    if (ep.mapping == conName) { publishedEpName = epName; return true; }
                    else return false;
                });
                // - If no defined inputs and not an entrypoint, then error
                if (!publishedEp) throw new Error(`Error in model: orphan connector ${conName} without inputs`);
                if (
                    _text(
                        publishedEp.type, { eval: variables }
                    ) != "in"
                ) throw new Error(`Error in model: connector ${conName} type does not match published endpoint ${publishedEpName}`);
                let _protocol = _text(
                    publishedEp.protocol, { eval: variables }
                );
                if (_protocol == "http") _protocol = "tcp:80";
                else if (_protocol == "https") _protocol = "tcp:443";
                if (_protocol != outProtocol)
                    throw new Error(`Error in model: connector ${conName} protocol does not match published endpoint ${publishedEpName}`);

            }

            // Here we check whether the connection type is
            // native or user-specified
            let conType = resolved.imports[con.type];

            // - Connector variables
            _con.variables = {};
            _.each(con.variables, (varVal, varName) => {
                if (conType && (!conType.variables || !conType.variables[varName]))
                    throw new Error(`Error in model: variable ${varName} not published by connector ${conName}`);
                _con.variables[varName] = _text(
                    varVal, { eval: variables }
                );
            });

            if (conType) {
                // - Connector volumes
                _con.volumes = {};
                _.each(con.volumes, (vol, volName) => {
                    if (!conType.volumes || !conType.volumes[volName])
                        throw new Error(`Error in model: volume ${volName} not published by connector ${conName}`);
                    let _vol = {
                        name: volName, // embed name
                        type: _text(
                            vol.type, { eval: variables, att: "type" }
                        ),
                        path: _text(
                            vol.path, { eval: variables, att: "path" }
                        ),
                        scope: _text(
                            vol.scope, { eval: variables, values: ["local", "global"], att: "scope" }
                        ),
                        durability: _text(
                            vol.durability, { eval: variables, values: ["ephemeral", "permanent"], att: "durability" }
                        ),
                        url: _text(
                            vol.url, { eval: variables, att: "url" }
                        )
                    };
                    _con.volumes[volName] = _vol;
                });
            }

            // Append new connector to resolved model
            resolved.connectors[conName] = _con;

        });

        // ------------- Resolve endpoints -------------
        resolved.endpoints = {};
        _.each(model.endpoints, (ep, epName) => {
            if (!ep.mapping) throw new Error(`Error in model: missing mapping in endpoint ${epName}`);
            let _ep = {
                name: epName, // embed name
                type: _text(
                    ep.type, { eval: variables, required: true, values: ["in", "out"], att: "type" }
                ),
                protocol: _text(
                    ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                ),
                required: _text(
                    ep.required, { eval: variables, att: "required" }
                )
            };

            if (_ep.protocol == "http") _ep.protocol = "tcp:80";
            else if (_ep.protocol == "https") _ep.protocol = "tcp:443";
            if (_ep.type == "in") {
                _ep.mapping = ep.mapping;
                let mappedCon = resolved.connectors[_ep.mapping];
                if (!mappedCon) throw new Error(`Error in model: wrong mapping of published endpoint ${epName}`);
                let mappedSubcomp = resolved.subcomponents[mappedCon.outputs[0].subcomponent];
                let mappedSubcompType = resolved.imports[mappedSubcomp.type];
                let subcompVars = _.merge({}, mappedSubcompType.variables, mappedSubcomp.variables);
                if (!mappedSubcompType.endpoints[mappedCon.outputs[0].endpoint]) throw new Error(`Error in model: unresolved mapping of published endpoint ${epName}`);
                let _protocol = _text(mappedSubcompType.endpoints[mappedCon.outputs[0].endpoint].protocol, { eval: subcompVars });
                if (_protocol == "http") _protocol = "tcp:80";
                else if (_protocol == "https") _protocol = "tcp:443";
                if (_protocol != _ep.protocol)
                    throw new Error(`Error in model: incompatible protocols of published endpoint ${epName} and mapped connector`);
            } else if (_ep.type == "out") {
                _ep.mapping = ep.mapping;
                let [subcomp, endpoint] = _ep.mapping.split(".");
                _ep.mapping = { subcomponent: subcomp, endpoint: endpoint };
                if (!_ep.mapping.subcomponent || !_ep.mapping.endpoint) throw new Error(`Error in model: unsupported mapping for endpoint ${epName}`);
                let mappedSubcomp = resolved.subcomponents[_ep.mapping.subcomponent];
                if (!mappedSubcomp) throw new Error(`Error in model: wrong mapping of published endpoint ${epName}`);
                let mappedSubcompType = resolved.imports[mappedSubcomp.type];
                let subcompVars = _.merge({}, mappedSubcompType.variables, mappedSubcomp.variables);
                if (!mappedSubcompType.endpoints[_ep.mapping.endpoint]) throw new Error(`Error in model: wrong mapping of published endpoint ${epName}`);
                let _protocol = _text(
                    mappedSubcompType.endpoints[_ep.mapping.endpoint].protocol, { eval: subcompVars }
                );
                if (_protocol == "http") _protocol = "tcp:80";
                else if (_protocol == "https") _protocol = "tcp:443";

                if (_protocol != _ep.protocol) throw new Error(`Error in model: incompatible protocols of published endpoint ${epName} and mapped endpoint`);
                /*_ep.mapping = [];
                let mappings = _.isString(ep.mapping) && ep.mapping.split(",") || (_.isArray(ep.mapping) && ep.mapping) || [ep.mapping];
                _.each(mappings, mapping => {
                    if (_.isString(mapping)) {
                        let [subcomp, endpoint] = mapping.split(".");
                        _ep.mapping.push({ subcomponent: subcomp, endpoint: endpoint });
                    } else {
                        _ep.mapping.push(mapping);
                    }
                });
                _.each(_ep.mappings, mapping => {
                    if (!mapping.subcomponent || !mapping.endpoint) throw new Error(`Error in model: unsupported mapping for endpoint ${epName}`);
                    let mappedSubcomp = resolved.subcomponents[mapping.subcomponent];
                    if (!mappedSubcomp) throw new Error(`Error in model: wrong mapping of published endpoint ${epName}`);
                    let mappedSubcompType = resolved.imports[mappedSubcomp.type];
                    let subcompVars = _.merge({}, mappedSubcompType.variables, mappedSubcomp.variables);
                    if (!mappedSubcompType.endpoints[mapping.endpoint]) throw new Error(`Error in model: wrong mapping of published endpoint ${epName}`);
                    let _protocol = _text(
                        mappedSubcompType.endpoints[mapping.endpoint].protocol, { eval: subcompVars }
                    );
                    if (_protocol == "http") _protocol = "tcp:80";
                    else if (_protocol == "https") _protocol = "tcp:443";
             
                    if (_protocol != _ep.protocol) throw new Error(`Error in model: incompatible protocols of published endpoint ${epName} and mapped endpoint`);
                });*/

            } else throw new Error(`Error in model: unsupported endpoint type ${_ep.type} of published endpoint ${epName}`);
            resolved.endpoints[epName] = _ep;
        });

        // ------------- Resolve entrypoints -------------
        // - entrypoints represent composite published endpoints
        // - if deployment-level entrypoint then "publish=true"        
        resolved.entrypoints = {};
        _.each(deployment.entrypoints, (ep, epName) => {
            if (!ep.mapping) throw new Error(`Error in model: missing mapping in entrypoint ${epName}`);

            let _ep = {
                name: epName,
                protocol: _text(
                    ep.protocol, { eval: variables, ignoreCase: true, required: true, re: "^(tcp\\:\\d+|http|https)$", att: "protocol" }
                ),
                path: _text(
                    ep.path, { eval: variables, re: "\\/.*", att: "path" }
                ),
                publish: deployment.publish || !opts.prefix,
            };
            if (_ep.protocol == "http") _ep.protocol = "tcp:80";
            else if (_ep.protocol == "https") _ep.protocol = "tcp:443";

            /*if (["http", "https"].includes(_ep.protocol) && !_ep.path) throw new Error(`Error in model: missing path in entrypoint ${epName}`);*/
            let inEndpoint = resolved.endpoints[ep.mapping];
            if (!inEndpoint) throw new Error(`Error in model: unresolved mapping in entrypoint ${epName}`);
            if (inEndpoint.type != "in") throw new Error(`Error in model: entrypoint ${epName} must map to an 'in' endpoint`);
            if (opts.prefix && ep.protocol != inEndpoint.protocol) throw new Error(`Error in model: incompatible protocols of published endpoint ${epName} and mapped endpoint`);

            let con = resolved.connectors[inEndpoint.mapping];
            con.entrypoint = _ep;

            let conType = resolved.imports[con.type];

            /*// Propagate entrypoint down
            _ep.mapping = _.findKey(conType.endpoints, ep => ep.type == "in");
            con.entrypoints = con.entrypoints || {};
            con.entrypoints[epName] = _ep;

            let entrypoint = {
                name: epName, // embed name                    
                protocol: _ep.protocol,
                path: _ep.path,
                mapping: ep.mapping
            };
            resolved.entrypoints[epName] = _ep;*/
        });

        //logger.debug(JSON.stringify(resolved, undefined, 3));


        /*// ------------- Resolve volumes -------------
        _.each(deployment.volumes, (vol, volName) => {
            if (!model.volumes[volName]) throw new Error(`Error in model: undefined volume ${volName}`);
            let [subcompName, subcompVol] = model.volumes[volName].mapping.split(".");
            if (!subcompVol) throw error(`Error in model: wrong volume mapping ${volName}`);
            resolved.subcomponents[subcompName].volumes[subcompVol].scope = vol.scope;
            resolved.subcomponents[subcompName].volumes[subcompVol].durability = vol.durability;
            resolved.subcomponents[subcompName].volumes[subcompVol].url = vol.url;
        });*/


    } else throw new Error(`Error in model: unsupported component type ${resolved.type}`);

    // For navigation purposes
    resolved.prefix = opts.prefix;
    resolved.parent = opts.parent;

    // Additional attributes
    Object.assign(resolved, opts.atts || {});

    models[`${(resolved.prefix ? resolved.prefix + "." : "")}${resolved.name}`] = resolved;


    return resolved;

}


/**
 * Obtain resource from url.
 * 
 * @param {string} url - The file URL
 * @param {Object} opts - Options
 */
async function _fetchUrl(url, opts) {
    logger.debug(`_fetchUrl(${url})`);

    let [schema, path] = url.split("://");
    if (!path) {
        //throw error(`Unable to fetch url ${url}: unsupported url`);
        path = schema;
        schema = "file";
    }

    let deferred = Q.defer();
    switch (schema) {
        case "file":
            fs.readFile(path, (err, data) => {
                if (err) deferred.reject(new Error(`Error fetching url ${url}`, err));
                else deferred.resolve(data.toString());
            });
            break;
        case "http":
        case "https":
            axios(url)
                .then(resp => deferred.resolve(resp.data))
                .catch(err => deferred.reject(new Error(`Error fetching url ${url}`, err)));
            break;
        default:
            throw new Error(`Unable to fetch: url ${url}: unsupported schema ${schema}`);

    }

    return deferred.promise;
}




/**
 * Obtain validated text.
 * 
 * @param {string} val - Value to check
 * @param {Object} opts - Additional options
 * @param {string} opts.att - Attribute name (for error message)
 * @param {boolean} opts.required - Force value
 * @param {Array<string>} opts.values - Valid values
 * @param {RegExp} opts.re - Regular expression to check against
 * @param {boolean} opts.ignoreCase - Case insensitive
 * @param {Object} opts.vars - Expand variables
 * @param {Object} opts.eval - Evaluate expressions
 * @return {string} The validated text
 */
function _text(val, opts) {
    logger.debug(`_text(${val},${JSON.stringify(opts)})`);
    opts = opts || {};
    if (opts.required && !val) throw new Error("Value required" + (opts.att ? ` for attribute ${opts.att}` : ""));
    if (!val) return val;

    // Expand variables
    if (opts.vars) {
        let re = /\{\{([^\}]*)\}\}/g;
        let reResult;
        let str = val;
        while ((reResult = re.exec(val)) !== null) {
            let paramName = reResult[1].trim();
            paramName = opts.ignoreCase ? paramName.toLowerCase() : paramName;
            if (opts.vars[paramName]) {
                let repl = new RegExp('{{' + reResult[1] + '}}', (opts.ignoreCase ? 'ig' : 'g'));
                str = str.replace(repl, opts.vars[paramName]);
            }
        }
        val = _.replace(str, /\{\{([^\}]*)\}\}/g, ""); // replace unresolved vars by empty string

        // Evaluate expressions
    } else if (opts.eval) {
        let re = /\{\{([^\}]*)\}\}/g;
        let reResult;
        let str = val;
        while ((reResult = re.exec(val)) !== null) {
            let expression = reResult[1];
            logger.debug(`evaluating '${expression}' with context ${JSON.stringify(opts.eval)}`);
            let result = vm.runInNewContext(expression, opts.eval);
            logger.debug(`result is '${result}'`);

            //let repl = new RegExp('{{' + expression + '}}', 'g');
            str = str.replace(`{{${expression}}}`, result);
        }
        val = str;
    }

    // Check values (only if no variables are present)
    let re = /\{\{([^\}]*)\}\}/g;
    if (opts.values && !re.test(val)) {
        if (opts.values.find(v => (opts.ignoreCase ? v.toLowerCase() == val.toLowerCase() : v == val)))
            return opts.ignoreCase ? val.toLowerCase() : val;
        else throw new Error(`Unsupported value ${val}` + (opts.att ? ` for attribute ${opts.att}` : ""));
    } else if (opts.re && !re.test(val)) {
        opts.re = _.isRegExp(opts.re) ? opts.re : new RegExp(opts.re, "g");
        if (opts.re.test(val)) return opts.ignoreCase ? val.toLowerCase() : val;
        else throw new Error(`Unsupported format ${val}` + (opts.att ? ` for attribute ${opts.att}` : ""));
    } else return opts.ignoreCase ? val.toLowerCase() : val;
}

if (require.main == module) {
    main()
} else {
    module.exports = {
        _text: _text,
        _resolveModel: _resolveModel
    }
}