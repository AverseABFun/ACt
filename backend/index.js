"use strict";

const express = require('express');
const sqlite3 = require('sqlite3');
const process = require('process');
const fs = require('fs');

let casedb = new sqlite3.Database('./db/case.db', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the case database.');
});

casedb.get("SELECT * FROM cases", (err)=>{
    if (err) {
        casedb.run(fs.readFileSync("./db/create_case_table.sql", {encoding: 'ascii'}));
    }
});

const startTime = Date.now();

const app = express ();
app.use(express.json());

const PORT = process.env.PORT || 8080;
function newResult(location, time, result) {
    
}

app.listen(PORT, () => {
    console.log("Server Listening on port", PORT);
});

app.get("/status", (request, response) => {
    const status = {
        "status": "Running",
        "uptime": (Date.now()-startTime)
    };

    response.send(status);
});

process.on('SIGINT', function () {
    casedb.close();
    process.exit(0);
});
process.on('exit', function () {
    casedb.close();
});
