import db = require('../db');
import * as fs from 'fs';
import {getLogFilePath} from '../log/log';

var userCollection = db.collection('users');
var tableCollection = db.collection('timetables');
var querylogCollection = db.collection('query_logs');

export async function getStatistics() {
    let yesterdayTime = Date.now() - 24 * 3600000;
    let userCountPromise = userCollection.count({});
    let tempUserCountPromise = userCollection
            .count({
                $and: [{"credential.localId": null}, {"credential.fbId": null}]
            });
    let tableCountPromise = tableCollection.count({});
    let recentQueryCountPromise = querylogCollection
            .count({timestamp: { $gt: yesterdayTime}});
    return {
        userCount: await userCountPromise,
        tempUserCount: await tempUserCountPromise,
        tableCount: await tableCountPromise,
        recentQueryCount: await recentQueryCountPromise
    }
}

export async function getLogFileContent(fileName: string): Promise<string> {
    let filePath = getLogFilePath(fileName);
    return fs.readFileSync(filePath, 'utf8');
}
