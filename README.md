## About Komponents
Tools and technologies aimed at modeling and deploying microservice-based applications.

## Table of Contents

- [Getting started](#getting-started)
- [The Modeling Language](#the-modeling-language)
- [Design Patterns](#design-patterns)
- [The Deployer](#the-deployer)
- [The Components source](#the-components-source)


## Getting started

Clone this repository:
```bash
$ git clone https://github.com/jaespei/komponents
```

Run deployer
```bash
$ cd komponents
$ npm install

# To K8s
$ npm run deploy -- samples/deployments/test.yaml
$ npm run undeploy -- samples/deployments/test.yaml 

# To Docker Compose
$ npm run deploy -- samples/deployments/test.yaml -t compose
$ npm run undeploy -- samples/deployments/test.yaml -t compose
```

## The Modeling Language
The syntax of the modeling language is defined using [JSON-Schema](./schemas/README.md).

We encourage researchers and enthusiasts to download the schemas and validate their own models.

## Design Patterns
To demonstrate the applicability of the modeling language, common microservice design patterns have been modeled and are available [here](./samples/patterns/README.md). 

These patterns can be easily deployed to both [Kubernetes](https://kubernetes.io/) and [Docker Compose](https://www.docker.com/) using [the Deployer tool](#the-deployer).

## The Deployer
Experimental tool for [validating](#validation), [translating](#translation) and [deploying](#deployment) microservice-based applications described using our [modeling language](#the-modeling-language). 

To use this tool, [Node.js](https://nodejs.org/) must be previously installed (v.20 has been used for testing). To deploy models to Kubernetes and Docker Compose, both `kubectl` and `docker compose` commands must be available and correctly configured in the command line. 

The following lines describe the Deployer tool usage. All commands must be executed from the repository root folder.

### Validation

To validate a specification run the following command.

```bash
$ npm run validate -- samples/deployments/test.yaml`
```
The specification might be a valid URL.

```bash
$ npm run validate -- http://example.com/spec.yaml`
```

### Translation
To translate a specification run the following command.

```bash
$ npm run translate -- samples/deployments/test.yaml`
```
First, the specification is validated. By default, the specification is translated to Kubernetes artifacts. By default, all the generated artifacts are stored within the `./out` folder.

The following options are supported.

| Option | Description |
| ------- | ----------- |
| `-t k8s` or `--target k8s` | Translates the model to K8s artifacts (option by default) |
| `-t compose` or `--target compose` | Translates the model to Docker Compose artifacts |
| `-o <path>` or `--output <path>` | Stores all the generated artifacts within the given path |
| `-s <url>` or `--storage <url>` | Specifies the storage URL for volumes |
| `-r <url>` or `--registry <url>` | Specifies the URL of the resgistry where images will be registered. The `docker` command must be available and correctly configured. More on this [here](#the-components) |

For example, the next command generates artifacts for Docker Compose, stores volumes in folder `/volumes` and all built Docker images get registered in a registry available in `localhost:5000`.

```bash
$ npm run translate -- path_to_model/spec.yaml` -t compose -s file:///volumes -r localhost:5000
```

### Deployment
To deploy a specification run the following command.

```bash
$ npm run deploy -- samples/deployments/test.yaml`
```
First, the specification is validated. Then it is translated. Finally it is deployed to the target platform. By default, the model is deployed to Kubernetes. 

In order to deploy to Kubernetes, the command `kubectl` must be available and correctly configured in the command line.

In order to deploy to Docker Compose, the command `docker compose` must be available and correctly configured in the command line.

This command supports the same options specified for the [translate](#translation) command.

## The Components source
At runtime, multiple instances of every component get created. Every instance runs the bits of a package obtained from a given `source` within a particular `runtime`. 

At the current implementation level, only the Docker `runtime` is supported. Therefore the `source` attribute must point to a valid Docker image. The image may reside in the public [Docker hub registry](hub.docker.com) or within a private registry, accessible from Kubernetes/Docker Compose. 

The attribute `source` currently supports the following delightful options:

| Option | Description |
| ------- | ----------- |
| `img` or `docker:img` | The image `img` is downloaded from the Docker hub |
| `localhost:5000/myimg` | The image `myimg` is downloaded from a registry running at `localhost:5000` |
| `img?cmd=/bin/bash` | The image `img` is downloaded and the command specified after the `cmd` parameter is executed when starting the instance |
| `docker+file://path/to/Dockerfile` | The Dockerfile is used for building an image. The image is registered in a register if the option `-r` is provided at translate/deployment time |
| `docker+http://path/to/Dockerfile` | The same as before |
| `docker+file://path/to/file.zip` | The file is uncompressed and a Dockerfile searched in the root folder. If it is found then it is used for building an image. The image is registered in a register if the option `-r` is provided at translate/deployment time |
| `docker+http://path/to/file.zip` | The same as before |

If the image must be built, then a new folder `./build` is created automatically with all the resources required for building the given component source.
