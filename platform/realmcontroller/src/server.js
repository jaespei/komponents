const express = require("express");
const cors = require('cors');

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
        this.opts.port = this.opts.port || 8000;
        this.log = (msg) => console.log(`[Server] ${msg}`);

        this.server = express();

        // --- middlewares
        this.server.use(cors());
        this.server.use(express.urlencoded({ extended: true }));
        this.server.use(express.json({ limit: "1mb"}));

        //    log
        this.server.use((req, res, next) => {
            this.log(`${req.method} ${req.url}`);
            next();
        });
        //    auth
        this.server.use(async (req, res, next) => {

            if (
                (req.url == "/" && req.method == "GET") ||
                (req.url == "/sessions" && req.method == "POST") ||
                (req.url == "/users" && req.method == "POST")
            ) {
                // no auth
                next();
            } else {
                let token = req.get("Authorization");  // Authorization: Bearer <jwt>
                if (!token) {
                    res.status(401).send({
                        type: "AuthenticationError",
                        message: "Authorization HTTP header is not set",
                        stack: new Error().stack
                    });
                    return;
                }

                let parsed = token.split(" ");
                if (parsed.length > 1) token = parsed[1];
                try {
                    let issuer = await app.services.identity.verifyToken(token);
                    res.locals.token = token;
                    res.locals.issuer = issuer;
                    next();
                } catch (err) {
                    res.status(401).send({
                        type: "AuthenticationError",
                        message: "Wrong access token",
                        stack: new Error().stack
                    });
                }
            }
        });

        // --- routes
        this.server.use(routes(app, opts));

        // --- info
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