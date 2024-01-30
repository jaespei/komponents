/**
 * 
 * [TODO]
 * - Lifecycle
 * 
 * Comments:
 * - Deployment entrypoint protocol can differ from published composite
 *   endpoint: a ports redirection is performed
 * 
 * 
 * Limitations: 
 * 
 * - User-defined connectors: inputs get correctly redirected but
 *   outputs are not; the connector implementation must retrieve
 *   output port explicitly in order to redirect connections
 * 
 * - Native LoadBalancer connectors can only have one output
 *   (Rationale: Service selectors do not support set-based conditions)
 * 
 * - Events: not implemented. They might be implemented using side-car 
 *   containers
 * 
 * - Volumes: 
 *   (Files)
 *   Only supported (global,permanent), (local,ephemeral)
 *   (NFS)
 *   Only supported (global,permanent)
 * 
 *   To implement (global,ephemeral) a routine for cleaning must exist.
 *   To implement (local,permanent)), (i) we need to use permanent 
 *   components (K8s does  only create multiple PVC on StatefulSets) 
 *   and (ii) we require a volume  dynamic  provisioning plugin.
 *  
 *   File-based dynamic provisioning is not supported :-0
 *   For nfs we have: https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner
 * 
 */

const _ = require('lodash');
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

const RS_MIN_REPLICAS = 1
const RS_MAX_REPLICAS = 100
const HPA_MAX_REPLICAS = 100
const HPA_MIN_REPLICAS = 1

async function translateDeployment(deployment, opts) {
    opts.logger.debug(`translateDeployment(${deployment.name})`);

    let ns = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: deployment.name
        }
    }
    return [{
        prefix: deployment.prefix,
        name: deployment.name,
        type: ns.kind,
        suffix: ".ns.yaml",
        content: YAML.stringify(ns)
    }];
}

async function translateBasic(model, adjacents, opts) {
    opts.logger.debug(`translateBasic(${model.prefix}.${model.name},${model.tag})`);

    let artifacts = [];

    // PersistentVolumes/PersitentVolumeClaims
    /*for (let volName in model.volumes) {
        let vol = model.volumes[volName]
        if (vol.scope == "local") throw new Error("Unsupported local volumes");
        let pv = {
            apiVersion: "v1",
            kind: "PersistentVolume",
            metadata: {
                namespace: model.prefix.split(".")[0],
                name: `${model.prefix}.${model.name}.${volName}`.replaceAll(".","-"),
            },
            spec: {
                //capacity: { storage: "10Gi" }
                volumeMode: "Filesystem",
                accessModes: ["ReadWriteMany"],
                persistenVolumeReclaimPolicy: 

            }
        }
    }*/

    // Generate Replicaset/StatefulSet    

    // - cardinality
    let cardinality = model.cardinality || "[1:1]";
    let [min, max] = cardinality.slice(1, -1).split(":");
    min = (min && Number(min)) || 0;
    min = min < RS_MIN_REPLICAS ? RS_MIN_REPLICAS : min;
    max = (max && Number(max)) || Infinity;
    max = max > RS_MAX_REPLICAS ? RS_MAX_REPLICAS : max;

    let rs_ss = {
        apiVersion: "apps/v1",
        kind: model.durability == "permanent" ? "StatefulSet" : "ReplicaSet",
        metadata: {
            namespace: model.prefix.split(".")[0],
            name: `${model.prefix}.${model.name}`.replaceAll(".", "-"),
            labels: {
                ...model.labels,
                "k-type": "basic",
                "k-name": `${model.prefix}.${model.name}`
            }
        },
        spec: {
            replicas: min,
            selector: {
                matchLabels: {
                    ...model.labels,
                    "k-type": "instance",
                    "k-name": `${model.prefix}.${model.name}`
                }
            },
            template: {
                metadata: {
                    labels: {
                        ...model.labels,
                        "k-type": "instance",
                        "k-name": `${model.prefix}.${model.name}`
                    }
                },
                spec: {
                    containers: [
                        {
                            name: "main",
                            //image: model.source,
                            env: _.map(
                                model.variables,
                                (varVal, varName) => {
                                    return { name: varName, value: varVal };
                                }
                            ),
                            ports: _.map(
                                _.filter(model.endpoints, (ep) => ep.type == "in"),
                                (ep) => {
                                    let [prot, port] = ep.protocol.split(":");
                                    return {
                                        protocol: prot.toUpperCase(),
                                        containerPort: Number(port)
                                    }
                                }
                            )
                        }
                    ],

                }
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
        rs_ss.spec.template.spec.containers[0].image = _url.host + _url.pathname;
        if (_url.search) {
            let cmd = _url.searchParams.get("cmd");
            if (cmd) {
                rs_ss.spec.template.spec.containers[0].command = ["sh"];
                rs_ss.spec.template.spec.containers[0].args = ["-c", cmd];
            }
        }
    } 

    // - resources
    if (model.resources) {
        rs_ss.spec.template.spec.containers[0].resources = {
            limits: {},
            requests: {}
        };
        _.each(model.resources, (resVal, resName) => {
            let [min, max] = resVal.split(":");
            min = min.slice(1);
            min = (min && Number(min)) || 0;
            max = max.slice(0, -1);
            max = (max && Number(max)) || Infinity;
            if (min > 0) rs_ss.spec.template.spec.containers[0].resources.requests[resName] = min;
            if (max < Infinity) rs_ss.spec.template.spec.containers[0].resources.limits[resName] = max;
        });
    }
    // - adjacents
    if (adjacents && adjacents.length) {
        let env = [];
        _.each(adjacents, adj => {
            env.push({
                name: `${adj.endpoint.name}_DNS`.toUpperCase(),
                value: `${adj.prefix ? adj.prefix + "." : ""}${adj.name}`.replaceAll(".", "-")
            });
            env.push({
                name: `${adj.endpoint.name}_PROTOCOL`.toUpperCase(),
                value: `${adj.protocol}`.toUpperCase()
            })

        });
        rs_ss.spec.template.spec.containers[0].env.push(...env);
    }

    // - volumes
    for (let volName in model.volumes) {
        let volume = model.volumes[volName];
        let [schema, _path] = opts.storage.split("://");
        let vol;
        if (schema == "file" && volume.scope == "global" && volume.durability == "permanent") {
            vol = {
                name: volName,
                hostPath: {
                    path: path.resolve(path.join(_path, `${model.prefix}.${model.name}.${volName}`)),
                    type: "DirectoryOrCreate"
                }
            };
        } else if (volume.scope == "local" && volume.durability == "ephemeral") {
            vol = {
                name: volName,
                emptyDir: {}
            };

        } else if (schema == "nfs" && volume.scope == "global" && volume.durability == "permanent") {
            vol = {
                name: volName,
                nfs: {
                    server: _path.split("/")[0],
                    path: "/" + _path.split("/").slice(1).join("/")
                }
            }
        }
        if (vol) {
            rs_ss.spec.template.spec.volumes = rs_ss.spec.template.spec.volumes || [];
            rs_ss.spec.template.spec.volumes.push(vol);
        }

    }
    if (rs_ss.spec.template.spec.volumes) {
        rs_ss.spec.template.spec.containers[0].volumeMounts = _.map(
            rs_ss.spec.template.spec.volumes,
            vol => { return { name: vol.name, mountPath: model.volumes[vol.name].path }; }
        )
    }

    artifacts.push({
        prefix: model.prefix,
        name: model.name,
        type: rs_ss.kind,
        suffix: rs_ss.kind == "ReplicaSet" ? ".rs.yaml" : ".sts.yaml",
        content: YAML.stringify(rs_ss)
    });

    // Generate service on destination
    // - entrypoint is set when this component is used as a connector
    // - entrypoint.publish is set when this component is used as a deployment entrypoint
    let svc = {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
            namespace: model.prefix.split(".")[0],
            name: `${model.prefix}.${model.name}`.replaceAll(".", "-"),
            labels: {
                "k-type": "basic",
                "k-name": `${model.prefix}.${model.name}`
            }
        },
        spec: {
            ...(model.entrypoint && model.entrypoint.publish && { type: "NodePort" }),
            selector: {
                "k-type": "instance",
                "k-name": `${model.prefix}.${model.name}`
            },
            ...(!model.entrypoint && { clusterIP: "None" })
        }
    };
    if (model.entrypoint) {
        let [inProt, inPort] = model.entrypoint.protocol.split(":");
        let [targetProt, targetPort] = _.find(model.endpoints, (ep) => ep.type == "in").protocol.split(":");
        svc.spec.ports = [
            {
                protocol: inProt.toUpperCase(),
                port: Number(inPort),
                targetPort: Number(targetPort),
                ...(model.entrypoint.publish && { nodePort: Number(inPort) })
            }
        ];
    }
    artifacts.push({
        prefix: model.prefix,
        name: model.name,
        type: svc.kind,
        suffix: ".svc.yaml",
        content: YAML.stringify(svc)
    });

    if (min != max) {
        // Generate HorizontalPodAutoscaler
        let hpa = {
            apiVersion: "autoscaling/v2",
            kind: "HorizontalPodAutoscaler",
            metadata: {
                namespace: model.prefix.split(".")[0],
                name: `${model.prefix}.${model.name}`.replaceAll(".", "-"),
                labels: {
                    ...model.labels,
                    "k-type": "basic",
                    "k-name": `${model.prefix}.${model.name}`
                }
            },
            spec: {
                minReplicas: min < HPA_MIN_REPLICAS ? HPA_MIN_REPLICAS : min,
                maxReplicas: max > HPA_MAX_REPLICAS ? HPA_MAX_REPLICAS : max,
                //...(max == Infinity && {maxReplicas: max}),
                scaleTargetRef: {
                    apiVersion: "apps/v1",
                    kind: rs_ss.kind,
                    name: `${model.prefix}.${model.name}`
                },
                metrics: _.map(
                    _.pickBy(
                        { ...model.policies },
                        (val, key) => ["cpu", "memory"].includes(key)
                    ),
                    (val, key) => {
                        return {
                            type: "Resource",
                            resource: {
                                name: key,
                                target: {
                                    type: "Utilization",
                                    averageUtilization: Number(val)
                                }
                            }
                        }
                    }
                )
            }
        }
        artifacts.push({
            prefix: model.prefix,
            name: model.name,
            type: hpa.kind,
            suffix: ".hpa.yaml",
            content: YAML.stringify(hpa)
        });
    }

    return artifacts;
}

async function translateConnector(connector, model, parent, input, adjacents, opts) {
    opts.logger.debug(`translateConnector(${parent.prefix}.${parent.name}.${connector.name})`);
    //if (!["Link", "LoadBalancer"].includes(connector.type)) throw new Error(`Error in model: connector type ${connector.type} is not native in platform`);
    //if (adjacents.length > 1) throw new Error("Only one connector input/output is supported");

    let artifacts = [];

    // Only translate if "LoadBalancer" native component
    if (model == null && connector.type == "LoadBalancer") {

        let inProt, inPort;
        if (connector.entrypoint) {
            [inProt, inPort] = connector.entrypoint.protocol.split(":");
        } else {
            //[inProt, inPort] = inputs[0].model.endpoints[inputs[0].endpoint].protocol.split(":");
            //[inProt, inPort] = adjacents[0].endpoint.protocol.split(":");
            [inProt, inPort] = input.protocol.split(":");
        }
        //let [targetProt, targetPort] = outputs[0].model.endpoints[outputs[0].endpoint].protocol.split(":");
        let [targetProt, targetPort] = adjacents[0].protocol.split(":");
        // Generate service
        let svc = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
                namespace: `${parent.prefix ? parent.prefix + "." : ""}${parent.name}`.split(".")[0],
                name: `${parent.prefix ? parent.prefix + "." : ""}${parent.name}.${connector.name}`.replaceAll(".", "-"),
            },
            spec: {
                ...(connector.entrypoint && connector.entrypoint.publish && { type: "NodePort" }),
                selector: {
                    "k-type": "instance",
                    "k-name": `${adjacents[0].prefix}.${adjacents[0].name}`
                },
                ports: [
                    {
                        protocol: inProt.toUpperCase(),
                        port: Number(inPort),
                        targetPort: Number(targetPort),
                        ...(connector.entrypoint && connector.entrypoint.publish && { nodePort: Number(inPort) })
                    }
                ]
            }
        };
        artifacts.push({
            prefix: `${parent.prefix ? parent.prefix + "." : ""}${parent.name}`,
            name: connector.name,
            type: svc.kind,
            suffix: ".svc.yaml",
            content: YAML.stringify(svc)
        });

    }

    return artifacts;
}

async function packArtifacts(artifacts, opts) {
    // - assign numbers to files in order to guarantee
    //   appropriate order creation

    for (let i = 0; i < artifacts.length; i++) {
        artifacts[i].prefix = artifacts[i].prefix ? `${i}.${artifacts[i].prefix}` : `${i}`;
    }

    return artifacts;
}

/**
 * Deploy the specified artifacts to the target platform.
 * 
 * @param {Array<Object>} artifacts 
 * @param {Object} opts 
 */
 async function deployArtifacts(artifacts, opts) {
   
    if (!commandExists("kubectl")) throw new Error(`Unable to deploy application: kubectl binary not available in command line`);
    opts.logger.debug(`Deploying artifacts ...`);

    let dirName = path.join(opts.output)
    /*let exec = util.promisify(child_process.exec);
    await exec(`kubectl apply -f ${dirName}`);*/
    
    let done = new Promise((resolve, reject) => {
        let ps = child_process.spawn(
            "kubectl", 
            ["apply", "-f", dirName]
        );
        ps.on("error", (err) => reject(err) );
        ps.stdout.pipe(process.stdout);
        ps.stderr.pipe(process.stderr);
        ps.on("close", (code) => resolve());
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
   
    if (!commandExists("kubectl")) throw new Error(`Unable to deploy application: kubectl binary not available in command line`);
    opts.logger.debug(`Deploying artifacts ...`);

    let namespace = artifacts[0].name;
    /*let exec = util.promisify(child_process.exec);
    await exec(`kubectl apply -f ${dirName}`);*/
    
    let done = new Promise((resolve, reject) => {
        let ps = child_process.spawn(
            "kubectl", 
            ["delete", "ns", namespace]
        );
        ps.on("error", (err) => reject(err) );
        ps.stdout.pipe(process.stdout);
        ps.stderr.pipe(process.stderr);
        ps.on("close", (code) => resolve());
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