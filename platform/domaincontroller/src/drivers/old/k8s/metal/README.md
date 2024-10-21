# K8S Metal Domain Controller Driver

This driver manages K8S clusters.

The driver admits the following machine types:
- Host: bare-metal hosts.
- Fabric: bare-metal hosts where additional vhosts get created, using vagrant/vbox
- VHost: virtual host created within a fabric.

The cluster includes master and worker nodes. Master nodes contain K8S control plane components, including etcd and the API Server.