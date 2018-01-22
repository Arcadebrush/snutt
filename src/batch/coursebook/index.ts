/**
 * fetch.rb로부터 긁어온 txt 파일을 읽어 몽고 디비에 입력합니다.
 * $ node import_txt 2016 1
 * 
 * @author Hyeungshik Jung, zxzl@github
 * @author Jang Ryeol, ryeolj5911@gmail.com
 */
require('module-alias/register')

import db = require('core/db');
import fs = require('fs');
import {fetchSugangSnu} from './data/fetch';
import {TagStruct, parseLines} from './data/parse';
import {LectureDiff, compareLectures} from './data/compare';
import {notifyUpdated} from './data/notify';
import {courseBookService} from 'core/courseBook';
import {LectureDocument, deleteAllSemester, insertManyRefLecture} from 'core/model/lecture';
import {NotificationModel, Type as NotificationType} from 'core/model/notification';
import {TagList} from 'core/model/tagList';
import {UserModel} from 'core/model/user';
import {getLogFilePath} from 'core/log';
import fcm = require('core/fcm');
import * as log4js from 'log4js';
var logger = log4js.getLogger();
db.connect();

log4js.configure({
  appenders: { 
    'stdout': { type : 'stdout' },
    'file' : { type : 'file',
        filename: getLogFilePath('coursebook.log'),
        layout: { type: "basic" },
        maxLogSize: 20480,
        backups: 10 }
  },
  categories: {
    default: { appenders: [ 'stdout', 'file' ], level: 'info' }
  }
});

/**
 * 현재 수강편람과 다음 수강편람
 */
async function getUpdateCandidate():Promise<[[number, number]]> {
  let recentCoursebook = await courseBookService.getRecent();
  if (!recentCoursebook) {
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth();
    let semester: number;
    if (month < 3) {
      semester = 4; // Winter
    } else if (month < 7) {
      semester = 1; // Spring
    } else if (month < 9) {
      semester = 2; // Summer
    } else {
      semester = 3; // Fall
    }
    logger.info("No recent coursebook found, infer from the current date.");
    logger.info("Inferred ", year, semester);
    return [[year, semester]];
  }
  let year = recentCoursebook.year;
  let semester = recentCoursebook.semester;

  let nextYear = year;
  let nextSemester = semester + 1;
  if (nextSemester > 4) {
    nextYear++;
    nextSemester = 1;
  }

  return [[year, semester],
  [nextYear, nextSemester]];
}


export async function fetchAndInsert(year:number, semesterIndex:number, fcm_enabled:boolean): Promise<void>
{
  var semesterString = (['1', '여름', '2', '겨울'])[semesterIndex-1];
  var saved_cnt = 0, err_cnt = 0;

  var noti_msg = year+"년도 "+semesterString+"학기 수강편람이 추가되었습니다.";

  logger.info("Fetching from sugang.snu.ac.kr...");
  let fetched = await fetchSugangSnu(year, semesterIndex);
  logger.info("Loading lectures...");
  let parsed = parseLines(year, semesterIndex, fetched);
  if (parsed.new_lectures.length == 0) {
    logger.warn("No lecture found.");
    return;
  }
  logger.info("Load complete with "+parsed.new_lectures.length+" courses");
  logger.info("Compare lectures...");
  let compared = await compareLectures(year, semesterIndex, parsed.new_lectures);
  if (compared.updated.length === 0 &&
        compared.created.length === 0 &&
        compared.removed.length === 0) {
    logger.info("Nothing updated.");
    return;
  }
  logger.info(compared.updated.length + " updated, "+
      compared.created.length + " created, "+
      compared.removed.length + " removed.");

  logger.info("Sending notifications...");
  await notifyUpdated(year, semesterIndex, compared, fcm_enabled);

  await deleteAllSemester(year, semesterIndex);
  logger.info("Removed existing lecture for this semester");

  logger.info("Inserting new lectures...");
  var docs = await insertManyRefLecture(parsed.new_lectures);
  logger.info("Insert complete with " + docs.length + " success and "+ (parsed.new_lectures.length - docs.length) + " errors");

  logger.info("Inserting tags from new lectures...");
  for (var key in parsed.tags) {
    if (parsed.tags.hasOwnProperty(key)){
      parsed.tags[key].sort();
    }
  }
  await TagList.createOrUpdateTags(Number(year), semesterIndex, parsed.tags);
  logger.info("Inserted tags");

  logger.info("saving coursebooks...");
  /* Send notification only when coursebook is new */
  var doc = await courseBookService.updateDateOrInsertAndReturnOld(Number(year), semesterIndex);

  if (!doc) {
    if (fcm_enabled) await UserModel.sendGlobalFcmMsg("신규 수강편람", noti_msg, "batch/coursebook", "new coursebook");
    await NotificationModel.createNotification(null, noti_msg, NotificationType.COURSEBOOK, null);
    logger.info("Notification inserted");
  }
  return;
}


async function main() {
  let cands: [[number, number]];
  if (process.argv.length != 4) {
    cands = await getUpdateCandidate();
  } else {
    cands = [[parseInt(process.argv[2]), parseInt(process.argv[3])]];
  }
  for (let i=0; i<cands.length; i++) {
    let year = cands[i][0];
    let semester = cands[i][1];
    try {
      await fetchAndInsert(year, semester, true);
    } catch (err) {
      logger.error(err);
      continue;
    }
  }

  // Wait for log4js to flush its logs
  setTimeout(function() {
    process.exit(0);
  }, 100);
}

if (!module.parent) {
  main();
}
