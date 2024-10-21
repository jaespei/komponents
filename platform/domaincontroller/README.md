# Domain Controller

The **Domain Controller** is responsible for managing the different domains in the Komponents platform. A domain typically represents an autonomous cluster of resources where component instances may be deployed.

Every domain manages a collection of abstract resources and exposes them through a well-known API:
- Instances: the basic computation units.
- Collections: groups of instances.
- Links: directed connections between two collections, which enable communications between the members of both groups.
- Volumes: the basic storage units, which get attached to instances or collections.

Additionally, to enable inter-operability, every domain should implement the following bare-minmum elements:
- Gateway: one per domain, responsible for routing all incoming connections to the corresponding instances.
- Ingress: one per domain, responsible for publishing collections of instances to the outside world.
- Proxies: forward connections between instances of different domains. Collections actually contain instances and proxies.
- Reverse Proxies: attached to a collection. They expose a single virtual address and distribute incoming load among collection members.

