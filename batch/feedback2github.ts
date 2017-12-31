/**
 * DB 상의 피드백을 깃헙 이슈로 전송합니다.
 * $ npm run feedback2github
 * 
 * @author Jang Ryeol, ryeolj5911@gmail.com
 */

const db = require('../db');
import config = require('../config/config');
import * as request from 'request-promise-native';
import {FeedbackModel} from '../model/feedback';

import {getLogFilePath} from '../log/log';
import * as log4js from 'log4js';
var logger = log4js.getLogger();

let githubToken = config.feedback2github_token;
let repoOwner = config.feedback2github_repo_owner;
let repoName = config.feedback2github_repo_name;
let apiIssuesUrl = "https://api.github.com/repos/" + repoOwner + "/" + repoName + "/issues";
let apiHeader = {
    Accept: "application/vnd.github.v3+json",
    Authorization: "token " + githubToken,
    "User-Agent": "bekker"
};

log4js.configure({
  appenders: { 
    'stdout': { type : 'stdout' },
    'file' : { type : 'file',
        filename: getLogFilePath('feedback2github.log'),
        layout: { type: "basic" },
        maxLogSize: 20480,
        backups: 10 }
  },
  categories: {
    default: { appenders: [ 'stdout', 'file' ], level: 'info' }
  }
});

async function getUserName(): Promise<string> {
    return request({
        method: 'GET',
        uri: "https://api.github.com/user",
        headers: apiHeader,
        json: true
    }).then(function(result) {
        return Promise.resolve(result.login);
    });
}

async function dumpFeedback(feedbackObj: FeedbackModel): Promise<void> {
    let issue: any = {}
    if (!feedbackObj.message) {
        logger.warn("No message field in feedback document");
        issue.title = "(Empty Message)";
    } else {
        issue.title = feedbackObj.message;
    }

    issue.body = "Issue created automatically by feedback2github\n";
    if (feedbackObj.timestamp) {
        issue.body += "Timestamp: " + new Date(feedbackObj.timestamp).toISOString() + " (UTC)\n";
    }
    if (feedbackObj.email) {
        issue.body += "Email: " + feedbackObj.email + "\n";
    }
    if (feedbackObj.platform) {
        issue.body += "Platform: " + feedbackObj.platform + "\n";
    }
    issue.body += "\n";
    issue.body += feedbackObj.message;

    if (feedbackObj.platform) {
        issue.labels = [feedbackObj.platform];
    }

    return request({
        method: 'POST',
        uri: apiIssuesUrl,
        headers: apiHeader,
        body: issue,
        json: true
    });
}

async function main() {
    try {
        let userName = await getUserName();
        logger.info("Logged-in as " + userName);
        logger.info("Dumping feedbacks into " + repoOwner + "/" + repoName);

        let feedbacks = await FeedbackModel.get(100, 0);
        let feedbackIds = [];

        logger.info("Fetched " + feedbacks.length + " documents");

        for (let i=0; i<feedbacks.length; i++) {
            feedbackIds.push(feedbacks[i]._id);
            await dumpFeedback(feedbacks[i]);
        }
        logger.info("Successfully inserted");

        await FeedbackModel.remove(feedbackIds);
        logger.info("Removed from mongodb");
    } catch (err) {
        logger.error(err);
    }

    // Wait for log4js to flush its logs
    setTimeout(function() {
        process.exit(0);
    }, 100);
  }
  
if (!module.parent) {
    main();
}
