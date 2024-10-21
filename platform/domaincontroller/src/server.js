const express = require("express");
const bodyParser = require("body-parser");

const routes = require("./routes");

class Server {


    /**
     * 
     * @param {*} app 
     * @param {*} opts 
     */
    constructor(app, opts) {
        this.app = app;
        this.opts = opts;
        this.opts.addr = this.opts.addr || "127.0.0.1";
        this.opts.port = this.opts.port || 10000;
        this.log = (msg) => console.log(`[Server] ${msg}`);

        this.server = express();
        this.server.use(bodyParser.json());

        this.server.use((req, res, next) => {
            this.log(`${req.method} ${req.url}`);
            next();
        });

        this.server.use(routes(app, opts));

        this.server.get("/", (req, resp) => {
            resp.send(this.opts);
        });

    }

    /**
     * Start the server
     */
    start() {
        this.log(`start()`);
        this.server.listen(this.opts.port, this.opts.addr);
    }

    /**
     * Stop the server
     */
    stop() {
        this.log(`stop()`);
        process.exit(0);
    }


}

module.exports = (app, opts) => {
    return new Server(app, opts);
}