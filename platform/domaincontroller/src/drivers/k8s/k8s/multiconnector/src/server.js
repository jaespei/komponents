const express = require("express");

class Server {

    /**
     * 
     * @param {Object} connector - The connector
     * @param {Object} opts - Additional options
     */
    constructor(connector, opts) {
        this.connector = connector;
        this.opts = opts || {};
        this.opts.addr = this.opts.addr || "0.0.0.0";
        this.opts.port = this.opts.port || 10000;
        this.log = (msg) => console.log(`[Server] ${msg}`);

        this.app = express();
        this.app.use(express.json());
        this.app.use((req, res, next) => {
            this.log(`${req.method} ${req.url} ${JSON.stringify(req.body)}`);
            next();
        });
    
        /**
         * Start connector.
         */
        this.app.post("/", async (req, res) => {
            await this.connector.start();
            res.status(204).send();
        });
    
        /**
         * List connector info.
         */
        this.app.get("/", (req, res) => {
            res.send(this.connector.info());
        });
    
        /**
         * Update connector cfg.
         */
        this.app.put("/", async (req, res) => {            
            this.connector.update(req.body.cfg);
            res.status(204).send();
        });
    
        /**
         * Stop connector.
         */
        this.app.delete("/", async (req, res) => {
            await this.connector.stop();
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

module.exports = (connector, opts) => {
    return new Server(connector, opts);
}