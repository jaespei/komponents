const express = require("express");
const bodyParser = require("body-parser");

class Server {

    /**
     * 
     * @param {Object} proxy - The proxy
     * @param {Object} opts - Additional options
     */
    constructor(proxy, opts) {
        this.proxy = proxy;
        this.opts = opts || {};
        this.opts.addr = this.opts.addr || "0.0.0.0";
        this.opts.port = this.opts.port || 10000;
        this.log = (msg) => console.log(`[Server] ${msg}`);

        this.app = express();
        this.app.use(bodyParser.json());
        this.app.use((req, res, next) => {
            this.log(`${req.method} ${req.url}`);
            next();
        });
    
        /**
         * Start proxy.
         */
        this.app.post("/", async (req, res) => {
            await this.proxy.start();
            res.status(204).send();
        });
    
        /**
         * List proxy info.
         */
        this.app.get("/", (req, res) => {
            res.send(this.proxy.opts);
        });
    
        /**
         * Update proxy cfg.
         */
        this.app.put("/", async (req, res) => {            
            await this.proxy.update(req.body);
            res.status(204).send();
        });
    
        /**
         * Stop proxy.
         */
        this.app.delete("/", async (req, res) => {
            await this.proxy.stop();
            res.status(204).send();
        });


    }

    start() {
        this.log(`start()`);
        this.app.listen(this.opts.port, this.opts.addr);
    }

    stop() {
        this.log(`stop()`);
        process.exit(0);
    }

}

module.exports = (proxy, opts) => {
    return new Server(proxy, opts);
}