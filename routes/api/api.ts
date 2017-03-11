"use strict";

import express = require('express');

var router = express.Router();

import {CourseBookModel} from '../../model/courseBook';

import authRouter = require('./auth');
import timetableRouter = require('./timetable');
import searchQueryRouter = require('./searchQuery');
import tagsRouter = require('./tags');
import notificationRouter = require('./notification');
import userRouter = require('./user');
import adminRouter = require('./admin');
var apiKey = require('../../config/apiKey');
import {UserModel, UserDocument} from '../../model/user';
import {FeedbackModel, FeedbackDocument} from '../../model/feedback';

import errcode = require('../../lib/errcode');

var api_info;

/**
 * Check API Key
 */
router.use(function(req, res, next) {
  var token = req.headers['x-access-apikey'];
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  apiKey.validateKey(token).then(function(value){
    api_info = value;
    next();
  }, function(err) {
    res.status(403).json({errcode: errcode.WRONG_API_KEY, message: err});
  });
});

router.get('/course_books', function(req, res, next) {
  CourseBookModel.getAll({lean: true}, function (err, courseBooks) {
    if (err) return res.status(500).json({errcode: errcode.SERVER_FAULT, message: "server fault"});
    res.json(courseBooks);
  });
});

router.get('/course_books/recent', function(req, res, next) {
  CourseBookModel.getRecent({lean: true}, function (err, courseBook) {
    if (err) return res.status(500).json({errcode: errcode.SERVER_FAULT, message: "server fault"});
    res.json(courseBook);
  });
});

router.get('/course_books/official', function(req, res, next) {
  var year = req.query.year;
  var semester = Number(req.query.semester);
  var lecture_number = req.query.lecture_number;
  var course_number = req.query.course_number;

  var openShtmFg = "", openDetaShtmFg = ""
  switch (semester) {
  case 1:
      openShtmFg = "U000200001";
      openDetaShtmFg = "U000300001";
      break;
  case 2:
      openShtmFg = "U000200001";
      openDetaShtmFg = "U000300002";
      break;
  case 3:
      openShtmFg = "U000200002";
      openDetaShtmFg = "U000300001";
      break;
  case 4:
      openShtmFg = "U000200002";
      openDetaShtmFg = "U000300002";
      break;
  }

  res.json({url: "http://sugang.snu.ac.kr/sugang/cc/cc103.action?openSchyy="+year+
    "&openShtmFg="+openShtmFg+"&openDetaShtmFg="+openDetaShtmFg+"&sbjtCd="+course_number+"&ltNo="+lecture_number+"&sbjtSubhCd=000"});
});

router.use('/search_query', searchQueryRouter);

router.use('/tags', tagsRouter);

router.get('/app_version', function(req, res, next) {
  var version = apiKey.getAppVersion(api_info.string);
  if (version) res.json({version: version});
  else res.status(404).json({errcode:errcode.UNKNOWN_APP, message: "unknown app"});
});

router.post('/feedback', function(req, res, next) {
  /*
   * date: Date
   * email: string
   * message: string
   */
  var feedback = new FeedbackModel(req.body);
  feedback.save();
  res.json({message:"ok"});
});

router.use('/auth', authRouter);

/**
 * Token Authenticator
 * Checks if the user is logged in
 * Which means all routers below this need authentication
 * If the user object is modified, you should re-login!!
 */
router.use(function(req, res, next) {
  if (req["user"]) return next();
  var token = req.query.token || req.body.token || req.headers['x-access-token'];
  if (!token) {
    return res.status(401).json({
      errcode: errcode.NO_USER_TOKEN,
      message: 'No token provided.'
    });
  }
  UserModel.getUserFromCredentialHash(token).then(function(user){
    if (!user)
      return res.status(403).json({ errcode: errcode.WRONG_USER_TOKEN, message: 'Failed to authenticate token.' });
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    req["user"] = user;
    next();
  }, function (err) {
    console.log(err);
    return res.status(403).json({ errcode: errcode.WRONG_USER_TOKEN, message: 'Failed to authenticate token.' });
  });
});

router.use('/tables', timetableRouter);

router.use('/user', userRouter);

router.use('/notification', notificationRouter);

router.use('/admin', adminRouter);

export = router;
