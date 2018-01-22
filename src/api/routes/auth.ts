import express = require('express');
var router = express.Router();

import {UserModel} from 'core/model/user';
import {TimetableModel} from 'core/model/timetable';
import errcode = require('core/errcode');
import * as log4js from 'log4js';
import * as facebook from 'core/facebook';
var logger = log4js.getLogger();

router.post('/request_temp', async function(req, res, next) {
  try {
    let tempUser = await UserModel.createTemp();
    let token = tempUser.getCredentialHash();
    res.json({message:"ok", token: token, user_id: tempUser._id});
  } catch (err) {
    logger.error(err);
    res.status(500).json({errcode: errcode.SERVER_FAULT, message:"server fault"});
    return;
  }
});

/**
 * POST
 * id, password
 */
router.post('/login_local', async function(req, res, next) {
  try {
    let user = await UserModel.getByLocalId(req.body.id);
    if (!user) return res.status(403).json({errcode: errcode.WRONG_ID, message: "wrong id"});
    let passwordMatch = await user.verifyPassword(req.body.password);
    if (!passwordMatch) return res.status(403).json({errcode: errcode.WRONG_PASSWORD, message: "wrong password"});
    res.json({token: user.getCredentialHash(), user_id: user._id});
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"server fault"});
  }
});

/**
 * register local user
 * Registerations should be defined in this 'auth', not 'user', because
 * it needs to be accessed without token
 */
router.post('/register_local', async function (req, res, next) {
  try {
    let user = await UserModel.createLocal(req.body.id, req.body.password);
    await user.setUserInfo(req.body.email);
    res.json({message: "ok", token: user.getCredentialHash(), user_id: user._id});
  } catch (err) {
    if (err == errcode.INVALID_ID)
      return res.status(403).json({errcode:err, message:"invalid id"});
    if (err == errcode.DUPLICATE_ID)
      return res.status(403).json({errcode:err, message:"duplicate id"});
    if (err == errcode.INVALID_PASSWORD)
      return res.status(403).json({errcode:err, message:"invalid password"});
    logger.error(err);
    return res.status(500).json({errcode:errcode.SERVER_FAULT, message:"server fault"});
  }
});

router.post('/login_fb', async function(req, res, next) {
  if (!req.body.fb_token || !req.body.fb_id)
    return res.status(400).json({errcode:errcode.NO_FB_ID_OR_TOKEN, message: "both fb_id and fb_token required"});

  try {
    let fbInfo = await facebook.getFbInfo(req.body.fb_id, req.body.fb_token);
    let user = await UserModel.getFbOrCreate(fbInfo.fbName, fbInfo.fbId);
    res.json({token: user.getCredentialHash(), user_id: user._id});
  } catch (err) {
    if (err == errcode.WRONG_FB_TOKEN)
      return res.status(403).json({ errcode:errcode.WRONG_FB_TOKEN, message: "wrong fb token"});
    logger.error(err);
    return res.status(500).json({ errcode:errcode.SERVER_FAULT, message: 'failed to create' });
  }
});

router.post('/logout', async function(req, res, next) {
  let userId = req.body.user_id;
  let registrationId = req.body.registration_id;
  try {
    let user = await UserModel.getByMongooseId(userId);
    if (!user) return res.status(404).json({ errcode: errcode.USER_NOT_FOUND, message: 'user not found'});
    await user.detachDevice(registrationId);
    res.json({message: "ok"});
  } catch (err) {
    logger.error(err);
    return res.status(500).json({ errcode:errcode.SERVER_FAULT, message: 'failed to logout' });
  }
});

export = router;
