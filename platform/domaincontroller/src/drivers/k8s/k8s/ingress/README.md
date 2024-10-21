# K8S Ingress
The Ingress component is the primary public entry point for the domain. It implements an intelligent
HTTP Proxy which captures every incoming request and redirects to the appropriate collection running
within the domain. 
 
Ingress is implemented as a regular linux (docker) container, which listens to a concrete
port and receives incoming requests.  To enable request capturing, low-level port-forwarding 
actions must take place. Ingress must be deployed as a   with an addhoc scheduler which guarantees
 * only one exact instance of it exists per Machine Controller.
 * 
 * When a new request is received the App Router analyzes the target URL, which must comply with 
 * one of two syntaxes:
 * (1) <appname>.<paas-dns>/<path>
 * (2) redirect-<instance-locator>.<paas-dns>/<path>
 * 
 * In (1) the App Router contacts the App Manager asking for the <instance-locator> of the entry
 * point which matches <appname> and <path>. In (2) the <instance-locator> is explicitly specified 
 * and the App Router does not need to contact the App Manager. 
 * 
 * Once the <instance-locator> has been obtained the request is forwarded to the target instance,
 * changing HTTP headers conveniently. To enable redirection to any instance running within the 
 * PaaS, the App Router must be deployed as an unmanaged instance, with full visibility over every 
 * instance deployed within the PaaS.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>