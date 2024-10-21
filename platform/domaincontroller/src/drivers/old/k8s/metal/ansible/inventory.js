#!/usr/bin/env node

const fs = require("fs");
fs.appendFileSync("inventory.log", `${Date.now()} - ${JSON.stringify(process.argv)}\n`);

if (process.argv[process.argv.length -1] == "--list") {
    let groups = {
        "all": ["127.0.0.1"]
    }
    console.log(JSON.stringify(groups));
} else {
    let host = {
        "ansible_host": "127.0.0.1",
        "ansible_port": 22
    } 
    console.log(JSON.stringify(host));
}

