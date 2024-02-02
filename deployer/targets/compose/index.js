/**
 * Comments:
 * - Adjacents discovery: for every out endpoint two environment
 *   variables are set: <EP_NAME>_DNS, <EP_NAME>_PROTOCOL
 *  
 * - For direct adjacents, <EP_NAME>_DNS will return multiple A
 *   records
 * - For connectors, <EP_NAME>_DNS will return a single A record
 *   pointing to a load balancer
 */

const _ = require("lodash");
const YAML = require("yaml");
const path = require("path");
const url = require("url");
const fs = require("fs");
const child_process = require("child_process");
const util = require("util");

const commandExists = require("command-exists").sync;
const download = require("download");
const decompress = require("decompress");
const uuid = require("uuid");

const PATH_BUILD = "build";

async function translateDeployment(deployment, opts) {
    opts.logger.debug(`translateDeployment(${deployment.name})`);

    // [TODO] entrypoints!!
    //
    let app = {
        include: [],
        services: {},
        volumes: {},
        networks: {
            [deployment.name]: {}
        }
    }

    return [{
        prefix: deployment.prefix,
        name: /*deployment.name,*/ "compose",
        type: "application",
        suffix: ".yaml",
        content: YAML.stringify(app)
    }]
}

async function translateBasic(model, adjacents, opts) {
    opts.logger.debug(`translateBasic(${model.prefix}.${model.name},${model.tag})`);

    let artifacts = [];
    
    let cardinality = model.cardinality || "[1:1]";
    let [min, max] = cardinality.slice(1,-1).split(":");
    cardinality = min || 1;

    // Generate service    
    let svc = {
        labels: {
            ...model.labels,
            "k-type": "instance",
            "k-name": `${model.prefix}.${model.name}`
        },
        //image: model.source,
        deploy: {
            replicas: cardinality
        },
        environment: {},
        expose: _.map(
            _.filter(model.endpoints, (ep) => ep.type == "in"),
            (ep) => { 
                let [prot,port] = ep.protocol.split(":"); 
                return `${port}`;
            }
        ),
        networks: {
            [`${model.prefix? model.prefix + ".": ""}${model.name}`.split(".")[0]]: {
                aliases: [
                    `${model.prefix? model.prefix + ".": ""}${model.name}${model.tag == "connector"? ".impl": ""}`.replaceAll(".", "-")
                ]
            }
        }
    }

    // - source
    let source = model.source.startsWith("docker")? model.source: "docker://" + model.source;
    if (source.startsWith("docker+")) {
        opts.logger.debug(`Obtaining image from source ${source} ...`);
        // Build from context
        if (!commandExists("docker")) throw new Error(`Unable to build image ${source}: docker binary not available in command line`);
        // Create build path
        let buildPath = `${PATH_BUILD}/${model.prefix}.${model.name}`;
        if (fs.existsSync(buildPath)) {
            fs.rmSync(buildPath, { recursive: true, force: true });
        } 
        fs.mkdirSync(buildPath, {recursive: true});

        // Copy/download image resources to build path
        let _protocol, _path, _query;
        [_protocol, _path] = source.split("://");
        [_path, _query] = _path.split("?");

        if (_protocol == "docker+file") {
            let stats = fs.statSync(_path);
            if (stats.isDirectory()) {
                fs.cpSync(_path, buildPath, {recursive: true});
            } else {
                fs.cpSync(_path, `${buildPath}/${path.basename(_path)}`, {recursive: true});
            }            
        } else if (_protocol == "docker+http") { 
            await download(source.slice(source.indexOf("+")+1), `${buildPath}/${path.basename(_path)}`);
        }

        opts.logger.debug(`Obtained.`);

        // Uncompress if necessary
        if (_path.endsWith(".zip") || _path.endsWith(".tar") || _path.endsWith(".tar.gz")) {
            opts.logger.debug(`Uncompressing image contents ${buildPath}/${path.basename(_path)} ...`);
            await decompress(`${buildPath}/${path.basename(_path)}`, buildPath);
            opts.logger.debug(`Uncompressed.`);
        }

        // Look for Dockerfile
        if (!fs.existsSync(`${buildPath}/Dockerfile`)) throw new Error(`Unable to build image ${source}: Dockerfile not found`);

        // Generate uuid for image
        let imgName = uuid.v4();
        if (opts.registry) imgName = opts.registry + "/" + imgName;

        // Build image
        opts.logger.debug(`Building image ...`);
        opts.logger.debug(` - docker build -f ${buildPath}/Dockerfile -t ${imgName} .`);
        let exec = util.promisify(child_process.exec);
        await exec(`docker build -f ${buildPath}/Dockerfile -t ${imgName} .`);
        opts.logger.debug(`Image built.`);
        
        // Upload to registry
        if (opts.registry) {
            opts.logger.debug(`Uploading image to registry ...`);
            opts.logger.debug(` - docker push ${imgName}`);
            await exec(`docker push ${imgName}`);
            opts.logger.debug(`Uploaded.`);
        }
        source = `docker://${imgName}${_query? "?" + _query: ""}`;
    }
    let _url = new url.URL(source);
    if (_url.protocol == "docker:") {
        svc.image = _url.host + _url.pathname;
        if (_url.search) {
            let cmd = _url.searchParams.get("cmd");
            if (cmd) {
                svc.command = ["sh", "-c", cmd];
            }
        }
    } 

    // - resources
    if (model.resources) {
        svc.deploy.resources = {
            limits: {},
            reservations: {}
        };
        _.each(model.resources, (resVal, resName) => {
            resName = resName == "cpu"? "cpus": resName;
            let [min, max] = resVal.split(":");
            min = min.slice(1);
            min = (min && Number(min)) || 0;
            max = max.slice(0,-1);
            max = (max && Number(max)) || Infinity;
            if (min > 0) svc.deploy.resources.reservations[resName] = "'" + min + "'";
            if (max < Infinity) svc.deploy.resources.limits[resName] = "'" + max + "'";
        });

    }

    // - variables
    _.each(model.variables, (varVal, varName) => {
        svc.environment[varName] = varVal;
    });

    // - adjacents
    if (adjacents && adjacents.length) {
        let env = {};
        _.each(adjacents, adj => {
            env[`${adj.endpoint.name}_DNS`.toUpperCase()] = `${adj.prefix? adj.prefix + ".": ""}${adj.name}`.replaceAll(".", "-");
            env[`${adj.endpoint.name}_PROTOCOL`.toUpperCase()] = `${adj.protocol}`.toUpperCase();
            env[`${adj.endpoint.name}_PORT`.toUpperCase()] = adj.protocol.split(":")[1];            
        });
        Object.assign(svc.environment, env);
    }    

    // - volumes
    for (let volName in model.volumes) {
        let volume = model.volumes[volName];
        let [schema, _path] = opts.storage.split("://");
        let vol;
        if (schema == "file" && volume.scope == "global" && volume.durability == "permanent") {
            vol = {
                type: "bind",
                source: path.resolve(path.join(_path, `${model.prefix}.${model.name}.${volName}`)),
                target: volume.path
            };
        } else if (volume.scope == "local" && volume.durability == "ephemeral") {
            vol = {
                type: "volume",
                target: volume.path
            };

        } 
        if (vol) {
            svc.volumes = svc.volumes || [];
            svc.volumes.push(vol);
        }

    }

    let compose = {
        services: {
            [`${model.prefix? model.prefix + ".": ""}${model.name}${model.tag == "connector"? ".impl": ""}`.replaceAll(".", "-")]: svc
        }
    }

    artifacts.push({
        prefix: model.prefix,
        name: model.name,
        type: "file",
        suffix: `${model.tag == "connector"? ".impl": ""}.yaml`,
        content: YAML.stringify(compose)
    });

    return artifacts;

}

async function translateConnector(connector, model, parent, input, adjacents, opts) {
    opts.logger.debug(`translateConnector(${parent.prefix}.${parent.name}.${connector.name})`);
    //if (!["Link", "LoadBalancer"].includes(connector.type)) throw new Error(`Error in model: connector type ${connector.type} is not native in platform`);
    //if (adjacents.length > 1) throw new Error("Only one connector input/output is supported");

    let artifacts = [];

    // Link connectors are not translated
    if (connector.type == "Link") return artifacts;

    // Translate every native/basic connector
    let prefix = `${parent.prefix? parent.prefix + ".": ""}${parent.name}`; 
    let svc = {
        labels: {
            ...((model && model.labels) || connector.labels),
            "k-type": "connector",
            "k-name": `${prefix}.${connector.name}`
        },
        image: "haproxy",
        expose: [
            (connector.entrypoint && connector.entrypoint.publish?
                `${connector.entrypoint.protocol.split(":")[1]}`:
                `${input.protocol.split(":")[1]}`
            )
        ],
        networks: [`${prefix.split(".")[0]}`]
    }

    // - env variables for our native LoadBalancer
    //   (we assume predefined IN/OUT variables)
    svc.environment = {        
        /*IN_PROTOCOL: (connector.entrypoint && connector.entrypoint.publish?
            `${connector.entrypoint.protocol}`:
            `${input.protocol}`
        ),
        IN_PORT: (connector.entrypoint && connector.entrypoint.publish?
            `${connector.entrypoint.protocol.split(":")[1]}`:
            `${input.protocol.split(":")[1]}`
        ),*/
        IN_PROTOCOL: `${input.protocol}`,
        IN_PORT: `${input.protocol.split(":")[1]}`,
        ...(adjacents && {
            OUT_DNS: `${adjacents[0].prefix? adjacents[0].prefix + ".": ""}${adjacents[0].name}`.replaceAll(".", "-"),
            OUT_PROTOCOL: `${adjacents[0].protocol}`.toUpperCase(),
            OUT_PORT: `${adjacents[0].protocol.split(":")[1]}`
        })
    };
    if (model) {
        let inProtocol = _.find(model.endpoints, (ep) => ep.type == "in").protocol;
        svc.environment.OUT_DNS = `${prefix}.${connector.name}.impl`.replaceAll(".", "-");
        svc.environment.OUT_PROTOCOL = `${inProtocol}`.toUpperCase();
        svc.environment.OUT_PORT = `${inProtocol.split(":")[1]}`;
    } else {
        svc.environment.OUT_DNS = `${adjacents[0].prefix? adjacents[0].prefix + ".": ""}${adjacents[0].name}`.replaceAll(".", "-");
        svc.environment.OUT_PROTOCOL = `${adjacents[0].protocol}`.toUpperCase();
        svc.environment.OUT_PORT = `${adjacents[0].protocol.split(":")[1]}`;
    }

    svc.volumes = [
        `./${prefix}.${connector.name}.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro`
    ];

    // - entrypoint
    if (connector.entrypoint && connector.entrypoint.publish){
        svc.ports = [
            `${connector.entrypoint.protocol.split(":")[1]}:${input.protocol.split(":")[1]}`
        ]
    }

    let compose = {
        services: {
            [`${prefix}.${connector.name}`.replaceAll(".", "-")]: svc
        }
    }

    artifacts.push({
        prefix: prefix,
        name: connector.name,
        type: "file",
        suffix: ".yaml",
        content: YAML.stringify(compose)
    });

    /*"global
    stats socket ipv4@127.0.0.1:9999 level admin
    stats socket /var/run/haproxy.sock mode 666 level admin
    stats timeout 2m"*/

    let cfg = `
defaults
    mode tcp
    timeout client 10000ms
    timeout connect 3000ms
    timeout server 10000ms    

resolvers nameservers
    accepted_payload_size 512
    parse-resolv-conf

frontend loadbalancer
    bind *:"$IN_PORT"
    default_backend targets

backend targets
    balance roundrobin
    server-template target 1-10 "$OUT_DNS":"$OUT_PORT" check resolvers nameservers init-addr none 

`;

    artifacts.push({
        prefix: prefix,
        name: connector.name,
        type: "file",
        suffix: ".cfg",
        content: cfg
    });

    return artifacts;
}

async function packArtifacts(artifacts, opts) {
    //opts.logger.debug(`packArtifacts(${JSON.stringify(artifacts)})`);

    // first artifact is root deployment, the rest are files which must be 
    // included
    let root = YAML.parse(artifacts[0].content);

    root.include = _.map(
        _.filter(
            artifacts.slice(1), 
            (artifact) => artifact.suffix.endsWith(".yaml")
        ),
        (artifact) => `${artifact.prefix}.${artifact.name}${artifact.suffix}`
    )
    artifacts[0].content = YAML.stringify(root);

    return artifacts;
}

/**
 * Deploy the specified artifacts to the target platform.
 * 
 * @param {Array<Object>} artifacts 
 * @param {Object} opts 
 */
async function deployArtifacts(artifacts, opts) {
    
    if (!commandExists("docker")) throw new Error(`Unable to deploy application: docker binary not available in command line`);
    
    opts.logger.debug(`Deploying artifacts ...`);
    let fileName = path.join(opts.output, (artifacts[0].prefix? artifacts[0].prefix + ".": "") + artifacts[0].name + artifacts[0].suffix); 
    /*let exec = util.promisify(child_process.exec);
    await exec(`docker compose -f ${fileName} up -d`);*/
    
    let done = new Promise((resolve, reject) => {
        let ps = child_process.spawn(
            "docker", 
            ["compose", "-f", fileName, "up",  "-d"]
        );
        ps.on("error", (err) => reject(err) );
        ps.stdout.pipe(process.stdout);
        ps.stderr.pipe(process.stderr);
        ps.on("close", (code) => { if (code == 0) resolve(); else reject(new Error(`Subprocess exited with code ${code}`))});
    });    
    
    return done;
}

/**
 * Deploy the specified artifacts to the target platform.
 * 
 * @param {Array<Object>} artifacts 
 * @param {Object} opts 
 */
 async function undeployArtifacts(artifacts, opts) {
    
    if (!commandExists("docker")) throw new Error(`Unable to deploy application: docker binary not available in command line`);
    
    opts.logger.debug(`Deploying artifacts ...`);
    let fileName = path.join(opts.output, (artifacts[0].prefix? artifacts[0].prefix + ".": "") + artifacts[0].name + artifacts[0].suffix); 
    /*let exec = util.promisify(child_process.exec);
    await exec(`docker compose -f ${fileName} up -d`);*/
    
    let done = new Promise((resolve, reject) => {
        let ps = child_process.spawn(
            "docker", 
            ["compose", "-f", fileName, "down"]
        );
        ps.on("error", (err) => reject(err) );
        ps.stdout.pipe(process.stdout);
        ps.stderr.pipe(process.stderr);
        ps.on("close", (code) => { if (code == 0) resolve(); else reject(new Error(`Subprocess exited with code ${code}`))});
    });    
    
    return done;
}


module.exports = {
    translateDeployment,
    translateBasic,    
    translateConnector,    
    packArtifacts,
    deployArtifacts,
    undeployArtifacts
}