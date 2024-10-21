const _ = require("lodash");
const express = require("express");
const bodyParser = require("body-parser");

class Server {

    /**
     * 
     * @param {Object} gateway - The gateway
     * @param {Object} opts - Additional options
     */
    constructor(gateway, opts) {
        this.gateway = gateway;
        this.opts = opts? _.clone(opts): {};
        this.opts.addr = this.opts.addr || "127.0.0.1";
        this.opts.port = this.opts.port || 10000;
        this.log = (msg) => console.log(`[Server] ${msg}`);

        this.app = express();
        this.app.use(bodyParser.json());
        this.app.use((req, res, next) => {
            this.log(`${req.method} ${req.url}`);
            next();
        });

        /**
         * Start gateway.
         */
        this.app.post("/", async(req, res) => {
            await this.gateway.start();
            res.status(204).send();
        });

        /**
         * List gateway info.
         */
        this.app.get("/", (req, res) => {
            res.send(this.gateway.cfg);
        });

        /**
         * Stop gateway.
         */
        this.app.delete("/", async(req, res) => {
            await this.gateway.stop();
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

module.exports = (gateway, opts) => {
    return new Server(gateway, opts);
}