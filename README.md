## About Komponents
Tools and technologies aimed at modeling and deploying microservice-based applications.

## Table of Contents

[Getting started](#getting-started)
[The Modeling Language](#modeling-language)
[The Deployer](#modeler)
[License](#license)


## Getting started

Clone the repository:
```bash
$ git clone https://www.github.com/jaespei/komponents
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

The syntax of the modeling language is defined using JSON-Schema. 


## The Deployer




## License