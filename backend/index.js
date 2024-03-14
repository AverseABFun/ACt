"use strict";

const express = require('express');
const sqlite3 = require('sqlite3');
const process = require('process');
const fs = require('fs');
const assert = require('assert');
const request = require('request');
const dotenv = require('dotenv').config();
import {Geojson} from 'geojson-parser-js';

let casedb = new sqlite3.Database('./db/case.db', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the case database.');
});

function currentWeekNumber(date) {
    var instance;
  
    if (typeof date === 'string' && date.length) {
      instance = new Date(date);
    } else if (date instanceof Date) {
      instance = date;
    } else {
      instance = new Date();
    }
  
    var target = new Date(instance.valueOf());
  
    var dayNr = (instance.getDay() + 6) % 7;
  
    target.setDate(target.getDate() - dayNr + 3);
  
    var firstThursday = target.valueOf();
  
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
  
    var weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
    return weekNumber;
  };
  
var CDCData = [];

function aggregateCDCData() {
    const weekNumber = currentWeekNumber(new Date());
    var earlyWeek = weekNumber-5;
    const year = new Date().getFullYear();
    var data = [];
    var completedRequest = false;
    if (earlyWeek < 1) {
        earlyWeek = 52+earlyWeek;
        request.get('https://data.cdc.gov/resource/x9gk-5huc.json', {
            "headers": {
                "X-App-Token": dotenv.get('CDC_APP_TOKEN')
            },
            "body": {
                "$where": `year = ${year-1} AND week > ${earlyWeek} AND week < 53`
            }
        }).on("complete", (_response, body) => {
            data = data.concat(JSON.parse(body));
        });
        request.get('https://data.cdc.gov/resource/x9gk-5huc.json', {
            "headers": {
                "X-App-Token": dotenv.get('CDC_APP_TOKEN')
            },
            "body": {
                "$where": `year = ${year} AND week > 0 AND week < ${weekNumber}`
            }
        }).on("complete", (_response, body) => {
            data = data.concat(JSON.parse(body));
            completedRequest = true;
        });
    } else {
        request.get('https://data.cdc.gov/resource/x9gk-5huc.json', {
            "headers": {
                "X-App-Token": dotenv.get('CDC_APP_TOKEN')
            },
            "body": {
                "$where": `year = ${year} AND week > ${earlyWeek} AND week < ${weekNumber}`
            }
        }).on("complete", (_response, body) => {
            data = data.concat(JSON.parse(body));
            completedRequest = true;
        });
    }
    function waitForRequest() {
        if (completedRequest) {
            return;
        } else {
            setTimeout(checkRequest, 100);
        }
    }
    waitForRequest();
    for (var val in data) {
        if (val["geocode"]) {
            val["location"] = Geojson.parse(val["geocode"]);
        }
    } 
    fs.writeFileSync("./db/cdc_data.json", JSON.stringify(data));
    CDCData = data;
}

casedb.get("SELECT * FROM cases", (err)=>{
    if (err) {
        casedb.run(fs.readFileSync("./db/create_case_table.sql", {encoding: 'ascii'}));
        if (dotenv.get('CDC_APP_TOKEN') != undefined && fs.existsSync("./db/cdc_data.json")) {
            aggregateCDCData();
        } else if (fs.existsSync("./db/cdc_data.json")) {
            CDCData = fs.readFileSync("./db/cdc_data.json");
        } else {
            console.warn("CDC_APP_TOKEN not found in .env, and no cdc_data.json found. CDC data will not be available.");
        }
    }
});


const startTime = Date.now();

const app = express ();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function newResult(location, time, diseaseguess) {
    casedb.run('INSERT INTO cases(loc, casetime, diseaseguess) VALUES (?, ?, ?)', [location, time, diseaseguess], (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(`Just recieved result at location ${location} from time ${time}, with a guess of ${diseaseguess}!`);
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
        reqJson = JSON.parse(request.body);
    } catch (e) {
        response.write({
            "error": true,
            "errorText": "invalid json"
        });
        return;
    }
    try {
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
            assert(reqJson.cases[i].location instanceof String);
            assert(reqJson.cases[i].time instanceof Number);
            assert(reqJson.cases[i].time > 0);
            assert(reqJson.cases[i].diseaseGuess instanceof String);
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
        newResult(reqJson.cases[i].location, reqJson.cases[i].time, reqJson.cases[i].diseaseGuess);
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
