## About the Modeling Language
A model is typically specified using YAML (JSON is supported too), and it must comply with a specific syntax.

Syntax rules are specified via [JSON Schema](https://json-schema.org/).

In this section three related JSON Schema documents are provided:
- [deployment.json](./deployment.json): describes the syntax of a model deployment specification.
- [composite.json](./composite.json): describes the syntax of a composite component specification.
- [basic.json](./basic.json): describes the syntax of a basic component specification.

To help better understand the languagem we provide a BNF-like specification in the following lines:

```
<deployment> ::=
    name: <str>
    type: deployment
    model: <str> | <composite>
    variables:
        <str>: <str>
    entrypoints:
        <str>:
            protocol: <str>
            path: <str>
            mapping: <str> (ref: model.endpoint where model.endpoint.type == "in")
 
<model> ::= <basic> || <composite>
 
<basic> ::=
    name: <str>
    type: basic
    cardinality: <str> (format: "[<int>?:<int>?]")
    policies: 
        <str>: <str>
    runtime: <str>
    source: <str> (e.g. 'nginx', 'docker+file:///file.zip' 'docker+http://www.example.com', 'debian?cmd=sleep infinity')
    resources:
        <str>: <str>
    durability: <str> ("ephemeral" | "permanent")
    variables:
        <str>: <str>
    endpoints:
        <str>:
            type: <str> ("in" | "out")
            protocol: <str> (format: "<protocol>:<port>")
            required: <bool>
    events:
        <str>: <str>
    volumes:
        <str>:
            type: <str>
            path: <str>
            scope: <str> ("local" | "global")
            durability: <str> ("ephemeral" | "permanent")
            url: <str>
 
<composite> ::=
    name: <str>
    type: composite
    cardinality: <str> (format: "[<int>?:<int>?]")
    imports:
        <str>: <str> (ref: external URL)
        <str>: <model>
    subcomponents:
        <str>: <str> (ref: imports)
        <str>: 
            type: <str> (ref: imports)
            cardinality: <str> (format: "[<int>?:<int>?]")
            variables:
                <str>: <str>
            policies:
                <str>: <str>
    connectors:
        <str>: 
            type: <str> (ref: imports)
            variables:
                <str>: <str>
            policies:
                <str>: <str>
            inputs:
                - <str>.<str> (ref: subcomponent.endpoint where subcomponent.endpoint.type == "out")
            outputs:
                - <str>.<str> (ref: subcomponent.endpoint where subcomponent.endpoint.type == "in")
    variables:
        <str>:
            value: <str>
            mapping: <str>.<str> (ref: subcomponent.variable or connector.variable)
    endpoints:
        <str>:
            type: <str> ("in" | "out")
            protocol: <str>
            required: <bool>
            mapping: <str> (ref: connector)
```






