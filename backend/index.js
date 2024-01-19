"use strict";

const express = require('express');
const sqlite3 = require('sqlite3');
const process = require('process');
const fs = require('fs');
const assert = require('assert');
const OpenLocationCode = require('openlocationcode');

function validatePlusCode(plusCode) {
    const olc = new OpenLocationCode.OpenLocationCode();

    try {
        olc.decode(plusCode);
    } catch (error) {
        return false;
    }

    return true;
}

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

const PORT = process.env.PORT || 3000;

function newResult(location, time, positiveResult) {
    casedb.run('INSERT INTO cases(loc, casetime, posresult) VALUES (?), (?), (?)', [location, time, positiveResult], (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(`Just recieved result at location ${location} from time ${time}, with a ${positiveResult ? "positive" : "negative"} test result!`);
    });
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

app.post("/newCase", (request, response) => {
    var reqJson = {};
    try {
        reqJson = request.body;
        if (reqJson == {}) {
            response.write({
                "error": true,
                "errorText": "invalid json"
            });
            return;
        }
        assert(reqJson.numCases);
        assert(reqJson.cases.length==reqJson.numCases);
        for (let i = 0; i<reqJson.numCases; i++) {
            assert(reqJson.cases[i].plusCode instanceof String);
            assert(validatePlusCode(reqJson.cases[i].plusCode));
            assert(reqJson.cases[i].time instanceof Number);
            assert(reqJson.cases[i].time > 0);
            assert(reqJson.cases[i].positiveResult instanceof Boolean);
        }
    } catch (e) {
        response.write({
            "error": true,
            "errorText": "invalid json values",
            "valuesWritten": []
        });
        return;
    }
    for (let i = 0; i<reqJson.numCases; i++) {
        newResult(reqJson.cases[i].plusCode, reqJson.cases[i].time, reqJson.cases[i].positiveResult);
    }
    response.write({
        "error": false,
        "errorText": "ok",
        "valuesWritten": reqJson.cases
    });
});

process.on('SIGINT', function () {
    casedb.close();
    process.exit(0);
});
process.on('exit', function () {
    casedb.close();
});
