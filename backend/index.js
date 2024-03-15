"use strict";

const express = require('express');
const sqlite3 = require('sqlite3');
const process = require('process');
const fs = require('fs');
const assert = require('assert');
const request = require('superagent');
const dotenv = require('dotenv');
const { URL } = require('url');
const Geojson = require('geojson-parser-js').Geojson;
dotenv.config();

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

var updatingCDCData = false;
var queuedRequests = [];
function aggregateCDCData() {
    updatingCDCData = true;
    const weekNumber = currentWeekNumber(new Date());
    var earlyWeek = weekNumber-8;
    const year = new Date().getFullYear();
    var data = [];
    var completedRequest = false;
    if (earlyWeek < 1) {
        earlyWeek = 52+earlyWeek;
        request.get('https://data.cdc.gov/resource/x9gk-5huc.json?$query='+encodeURI(`SELECT
        \`states\`,
        \`year\`,
        \`week\`,
        \`label\`,
        \`m1\`,
        \`m1_flag\`,
        \`m2\`,
        \`m2_flag\`,
        \`m3\`,
        \`m3_flag\`,
        \`m4\`,
        \`m4_flag\`,
        \`location1\`,
        \`location2\`,
        \`sort_order\`,
        \`geocode\`,
        \`:@computed_region_hjsp_umg2\`,
        \`:@computed_region_skr5_azej\`
      WHERE
        caseless_one_of(\`year\`, "${year-1}") AND ((\`week\` > ${earlyWeek}) AND (\`week\` < 53))
      ORDER BY \`sort_order\` ASC NULL LAST LIMIT 999999999999`)
        )
            .set("X-App-Token", process.env.CDC_APP_TOKEN)
            .end((err, res) => {
                if (err) {
                    console.error(err);
                    process.exit(1);
                }
                data = data.concat(res.body);
            })
        request.get('https://data.cdc.gov/resource/x9gk-5huc.json?$query='+encodeURI(`SELECT
        \`states\`,
        \`year\`,
        \`week\`,
        \`label\`,
        \`m1\`,
        \`m1_flag\`,
        \`m2\`,
        \`m2_flag\`,
        \`m3\`,
        \`m3_flag\`,
        \`m4\`,
        \`m4_flag\`,
        \`location1\`,
        \`location2\`,
        \`sort_order\`,
        \`geocode\`
      WHERE
        caseless_one_of(\`year\`, "${year}") AND ((\`week\` > ${earlyWeek}) AND (\`week\` < ${weekNumber}))
      ORDER BY \`sort_order\` ASC NULL LAST LIMIT 999999999999`)
      )
          .set("X-App-Token", process.env.CDC_APP_TOKEN)
          .end((err, res) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            data = data.concat(res.body);
            var kindsOfDiseases = [];
            for (var val in data) {
                if (val["geocode"]) {
                    val["location"] = Geojson.parse(val["geocode"]);
                }
                if (val["label"] && !kindsOfDiseases.includes(val["label"])) {
                    kindsOfDiseases.push(val["label"]);
                }
            } 
            //console.log(JSON.stringify(kindsOfDiseases))
            data = {
                "week": weekNumber,
                data: data,
            }
            fs.writeFileSync("./db/cdc_data.json", JSON.stringify(data));
            CDCData = data;
            updatingCDCData = false;
            for (var item of queuedRequests) {
                item();
            }
          })
    } else {
        request.get('https://data.cdc.gov/resource/x9gk-5huc.json?$query='+encodeURI(`SELECT
        \`states\`,
        \`year\`,
        \`week\`,
        \`label\`,
        \`m1\`,
        \`m1_flag\`,
        \`m2\`,
        \`m2_flag\`,
        \`m3\`,
        \`m3_flag\`,
        \`m4\`,
        \`m4_flag\`,
        \`location1\`,
        \`location2\`,
        \`sort_order\`,
        \`geocode\`
      WHERE
        caseless_one_of(\`year\`, "${year}") AND ((\`week\` > ${earlyWeek}) AND (\`week\` < ${weekNumber}))
      ORDER BY \`sort_order\` ASC NULL LAST LIMIT 999999999999`)
      )
          .set("X-App-Token", process.env.CDC_APP_TOKEN)
          .end((err, res) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            data = data.concat(res.body);
            var kindsOfDiseases = [];
            for (var val in data) {
                if (val["geocode"]) {
                    val["location"] = Geojson.parse(val["geocode"]);
                }
                if (val["label"] != "" && !kindsOfDiseases.includes(val["label"])) {
                    kindsOfDiseases.push(val["label"]);
                }
            } 
            console.log(kindsOfDiseases)
            data = {
                "week": weekNumber,
                data: data,
            }
            fs.writeFileSync("./db/cdc_data.json", JSON.stringify(data));
            CDCData = data;
            updatingCDCData = false
            for (var item of queuedRequests) {
                item();
            }
          })
    }
}

casedb.get("SELECT * FROM cases", (err)=>{
    if (err) {
        casedb.run(fs.readFileSync("./db/create_case_table.sql", {encoding: 'ascii'}));
    }
});


const startTime = Date.now();

const app = express ();
app.use(express.json());

if (process.env.CDC_APP_TOKEN != undefined && !fs.existsSync("./db/cdc_data.json")) {
    aggregateCDCData();
} else if (fs.existsSync("./db/cdc_data.json")) {
    CDCData = fs.readFileSync("./db/cdc_data.json");
    if (CDCData.week < currentWeekNumber(new Date())) {
        aggregateCDCData();
    }
} else {
    console.warn("CDC_APP_TOKEN not found in .env, and no cdc_data.json found. CDC data will not be available.");
}

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

app.get("/status", (_request, response) => {
    if (CDCData.week < currentWeekNumber(new Date())) {
        aggregateCDCData();
    }
    var status = {
        "status": "Running",
        "uptime": (Date.now()-startTime)
    };
    if (updatingCDCData) {
        status.status = "Updating CDC Data";
    }

    response.send(status);
});

app.post("/newCase", (request, response) => {
    if (CDCData.week < currentWeekNumber(new Date())) {
        aggregateCDCData();
    }
    var reqJson = {};
    try {
        reqJson = JSON.parse(request.body);
    } catch (e) {
        response.write({
            "error": true,
            "queued": false,
            "errorText": "invalid json"
        });
        return;
    }
    try {
        if (reqJson == {}) {
            response.write({
                "error": true,
                "queued": false,
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
            "queued": false,
            "errorText": "invalid json values",
            "valuesWritten": []
        });
        return;
    }
    if (updatingCDCData) {
        queuedRequests.push(function(){
            for (let i = 0; i<reqJson.numCases; i++) {
                newResult(reqJson.cases[i].location, reqJson.cases[i].time, reqJson.cases[i].diseaseGuess);
            }
        });
        response.write({
            "error": true,
            "queued": true,
            "errorText": "updating CDC data"
        });
        return;
    }
    response.write({
        "error": false,
        "queued": false,
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
