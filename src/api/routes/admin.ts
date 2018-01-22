/**
 * 외부 Admin 모듈과 http 통신.
 * Admin 권한을 가진 user만이 사용 가능
 */
import express = require('express');
import errcode = require('core/errcode');
import {UserModel} from 'core/model/user';
import {courseBookService} from 'core/courseBook';
import {getRecentFcmLog} from 'core/model/fcmLog';
import {getFeedback} from 'core/model/feedback';
import {getStatistics, getLogFileContent} from 'core/model/admin';
import {NotificationModel, Type as NotificationType} from 'core/model/notification';
import * as log4js from 'log4js';
var logger = log4js.getLogger();

var router = express.Router();

router.use(function(req, res, next) {
  if (req["user"].isAdmin) return next();
  else {
    return res.status(403).json({ errcode: errcode.NO_ADMIN_PRIVILEGE, message: 'Admin privilege required.' });
  }
});

router.post('/insert_noti', async function(req, res, next) {
  let sender: UserModel = req["user"];

  let userId: string     = req.body.user_id;
  let title: string      = req.body.title;
  let body: string       = req.body.body;
  let insertFcm: boolean = req.body.insert_fcm ? true            : false;
  let type               = req.body.type       ? req.body.type   : NotificationType.NORMAL;
  let detail             = req.body.detail     ? req.body.detail : null;

  try {
    if (userId && userId.length > 0) {
      let receiver = await UserModel.getByLocalId(userId);
      if (insertFcm) {
        await receiver.sendFcmMsg(title, body, sender._id, "admin");
      }
      await NotificationModel.createNotification(receiver._id, body, type, detail);
    } else {
      if (insertFcm) {
        await UserModel.sendGlobalFcmMsg(title, body, sender._id, "admin");
      }
      await NotificationModel.createNotification(null, body, type, detail);
    }
    res.send({message: "ok"});
  } catch (err) {
    if (err == errcode.USER_NOT_FOUND) return res.status(404).send({errcode: err, message: "user not found"});
    if (err == errcode.USER_HAS_NO_FCM_KEY) return res.status(404).send({errcode: err, message: "user has no fcm key"});
    if (err == errcode.INVALID_NOTIFICATION_DETAIL) return res.status(404).send({errcode: err, message: "invalid notification detail"});
    logger.error(err);
    res.status(500).send({errcode: errcode.SERVER_FAULT, message:err});
  }
});

router.get('/log_content/:fileName', async function(req, res, next) {
  let fileName: string = req.params.fileName;
  try {
    res.send(await getLogFileContent(fileName));
  } catch (err) {
    logger.error(err);
    res.status(500).send({errcode: errcode.SERVER_FAULT, message:err});
  }
});

router.get('/recent_fcm_log', async function(req, res, next) {
  let logs = await getRecentFcmLog();
  return res.json(logs);
});

router.get('/coursebooks', async function(req, res, next) {
  let coursebooks = await courseBookService.getAll();
  return res.json(coursebooks);
});

router.get('/feedbacks', async function(req, res, next) {
  let limit = 10;
  let offset = 0;
  if (req.body.limit) limit = req.body.limit;
  if (req.body.offset) offset = req.body.offset;
  let feedbacks = await getFeedback(limit, offset);
  return res.json(feedbacks);
});

router.get('/statistics', async function(req, res, next) {
  let statistics = await getStatistics();
  return res.json(statistics);
});

/*
var path = require('path');
var CourseBook = require(path.join(__dirname, 'model/courseBook'));


router.get('/course_books', function(req, res, next) {
  CourseBook.find({},'year semester', {sort : {year : -1, semester : -1 }}, function (err, courseBooks) {
    res.send(200, courseBooks)
  });
});
*/

export = router;