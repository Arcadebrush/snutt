/**
 * API 기능 목적의 라우터 엔트리
 * {@link config/apiKey}의 API 키가 필수
 * 각 라우터의 input과 ouput은 위키 참조
 */

import express = require('express');

var router = express.Router();

import {CourseBookModel} from 'core/model/courseBook';

import authRouter = require('./auth');
import timetableRouter = require('./timetable');
import searchQueryRouter = require('./searchQuery');
import tagsRouter = require('./tags');
import notificationRouter = require('./notification');
import userRouter = require('./user');
import adminRouter = require('./admin');
import apiKey = require('core/config/apiKey');
import {UserModel} from 'core/model/user';
import {insertFeedback} from 'core/model/feedback';

import errcode = require('core/errcode');
import libcolor = require('core/color');
import * as log4js from 'log4js';
var logger = log4js.getLogger();

router.use(function(req, res, next) {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
});

router.get('/terms_of_service', function(req, res, next) {
  res.render('terms_of_service.html');
});

router.get('/privacy_policy', function(req, res, next) {
  res.render('privacy_policy.html');
});

router.get('/member', function(req, res, next) {
  res.render('member.html');
});

/**
 * Check API Key
 */
router.use(function(req, res, next) {
  var token = <string>req.headers['x-access-apikey'];
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  apiKey.validateKey(token).then(function(platform){
    req["api_platform"] = platform;
    next();
  }, function(err) {
    res.status(403).json({errcode: errcode.WRONG_API_KEY, message: err});
  });
});

router.get('/course_books', async function(req, res, next) {
  try {
    res.json(await CourseBookModel.getAll());
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message: "server fault"});
  }
});

router.get('/course_books/recent', async function(req, res, next) {
  try {
    res.json(await CourseBookModel.getRecent());
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message: "server fault"});
  }
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

router.get('/colors', function(req, res, next) {
  res.json({message: "ok", colors: libcolor.getLegacyColors(), names: libcolor.getLegacyNames()});
});

router.get('/colors/:colorName', function(req, res, next) {
  let colorWithName = libcolor.getColorList(req.params.colorName);
  if (colorWithName) res.json({message: "ok", colors: colorWithName.colors, names: colorWithName.names});
  else res.status(404).json({errcode:errcode.COLORLIST_NOT_FOUND, message: "color list not found"});
});

router.post('/feedback', async function(req, res, next) {
  try {
    await insertFeedback(req.body.email, req.body.message, req["api_platform"]);
    res.json({message:"ok"});
  } catch (err) {
    logger.error(err);
    res.status(500).json({errcode: errcode.SERVER_FAULT, message: "server fault"});
  }
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
    user.updateLastLoginTimestamp();
    req["user"] = user;
    next();
  }, function (err) {
    logger.error(err);
    return res.status(403).json({ errcode: errcode.WRONG_USER_TOKEN, message: 'Failed to authenticate token.' });
  });
});

router.use('/tables', timetableRouter);

router.use('/user', userRouter);

router.use('/notification', notificationRouter);

router.use('/admin', adminRouter);

export = router;
