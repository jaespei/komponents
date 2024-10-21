![Komponents logo](komponents.png)
## About Komponents
Tools and technologies aimed at modeling, deploying and operating microservice-based applications.



The Komponents project includes the following main elements:
- A [modeling language](#the-modeling-language): a language for describing microservice-based applications.
- A [modeler](#the-modeler): a web-based graphical tool for creating models.
- A [deployer](#the-deployer): a tool for translating models to multiple platforms statically.
- A [platform](#the-komponents-platform): a proof of concept prototype which deploys and operates microservice-based applications in multi-platform scenarios.


## Table of Contents

- [The Modeling Language](#the-modeling-language)
    - [Design Patterns](#design-patterns)
    - [TeaStore](#teastore)
- [The Modeler](#the-modeler)
- [The Deployer](#the-deployer)
    - [Getting started](#getting-started)
    - [Validation](#validation)
    - [Translation](#translation)
    - [Deployment](#deployment)
    - [Components source](#components-source)
- [The Komponents Platform](#the-komponents-platform)


## The Modeling Language
The syntax of the modeling language is defined using [JSON-Schema](./schemas/README.md).

We encourage researchers and enthusiasts to download the schemas and validate their own models.

### Design Patterns
To demonstrate the applicability of the modeling language, common microservice design patterns have been modeled and are available [here](./samples/patterns/README.md). 

These patterns can be easily deployed to both [Kubernetes](https://kubernetes.io/) and [Docker Compose](https://www.docker.com/) using [the Deployer tool](#the-deployer).

### TeaStore
The modeling language has been used to model a microservice reference application called TeaStore. All the details about it can be found [here](./samples/teastore/README.md).

## The Modeler
Web-based graphical tool for modeling microservice-based applications using diagramming.

To use this tool, [Docker](https://www.docker.com/) must be previously installed in the computer.

Clone this repository:
```bash
$ git clone https://github.com/jaespei/komponents
```

Run modeler
```bash
$ cd komponents/modeler
$ docker build -t modeler .
$ docker run --name modeler -p 8080:8080 --rm modeler
```

Open web browser and the modeler will be available under the URL:

[http://127.0.0.1:8080](http://127.0.0.1:8080)


## The Deployer
Experimental tool for [validating](#validation), [translating](#translation) and [deploying](#deployment) microservice-based applications described using our [modeling language](#the-modeling-language). 

To use this tool, [Node.js](https://nodejs.org/) must be previously installed in the computer (v.20 has been used for testing). To deploy models to Kubernetes and Docker Compose, both `kubectl` and `docker compose` commands must be available and correctly configured in the command line. 


### Getting started

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

The following lines describe the Deployer tool usage. All commands must be executed from this repository root folder.

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

### Components source
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

## The Komponents Platform
Proof of concept prototype capable of modeling, deploying and operating microservice-based applications in multi-platform scenarios.

The platform includes the following components:
- The Domain Controller: it covers multiple target platforms, reponsible for communicating directly with them.
- The Component Controller: key piece of the system, it implements the component model and provides operations for manipulating it. In permanent communication with the Domain Controller.
- The Realm Controller: single entry point to the system. It adds higher-level services to the platform (e.g. authentication, user management, catalog of reusable components, etc.)
- The Dashboard: web-based GUI which provides access to the main functionalities of the system.
- The Store: persistent storage of the system.


To simplify the start up of the platform, a [Docker Compose](https://docs.docker.com/compose/) file has been created. This file will seamlessly deploy all required components. Please follow the next instructions:

Clone this repository:
```bash
$ git clone https://github.com/jaespei/komponents
```

Start up the platform
```bash
$ cd komponents/platform
$ docker compose up -d
```

Open web browser and the Dashboard will be available under the URL:

[http://127.0.0.1:8080](http://127.0.0.1:8080)

