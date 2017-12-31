import express = require('express');
var router = express.Router();

import {TimetableModel} from '../../model/timetable';
import {UserLectureModel} from '../../model/lecture';
import {UserModel} from '../../model/user';
import util = require('../../lib/util');
import errcode = require('../../lib/errcode');
import Color = require('../../lib/color');
import * as log4js from 'log4js';
var logger = log4js.getLogger();

router.get('/', async function(req, res, next) { //timetable list
  var user:UserModel = <UserModel>req["user"];
  try {
    let result = await TimetableModel.getAbstractList(user._id);
    res.json(result);
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:'fetch timetable list failed'});
  }
});

router.get('/recent', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  try {
    let result = await TimetableModel.getRecentRaw(user._id);
    if (!result) res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:'no timetable'});
    else res.json(result);
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:'find table failed'});
  }
});

router.get('/:id', async function(req, res, next) { //get
  var user:UserModel = <UserModel>req["user"];
  try {
    let result = await TimetableModel.getByTableId(user._id, req.params.id);
    if (!result) res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:'timetable not found'});
    else res.json(result);
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"find table failed"});
  }
});

router.get('/:year/:semester', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  try {
    let result = await TimetableModel.getBySemester(user._id, req.params.year, req.params.semester);
    if (!result) res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:"No timetable for given semester"});
    else res.json(result);
  } catch (err) {
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"find table failed"});
  }
});

router.post('/', async function(req, res, next) { //create
  var user:UserModel = <UserModel>req["user"];
  if (!req.body.year || !req.body.semester || !req.body.title)
    return res.status(400).json({errcode: errcode.NOT_ENOUGH_TO_CREATE_TIMETABLE, message:'not enough parameters'});

  try {
    await TimetableModel.createFromParam({
      user_id : user._id,
      year : req.body.year,
      semester : req.body.semester,
      title : req.body.title
    });

    let tableList = await TimetableModel.getAbstractList(user._id);
    res.json(tableList);
  } catch (err) {
    if (err == errcode.DUPLICATE_TIMETABLE_TITLE) {
      return res.status(403).json({errcode: errcode.DUPLICATE_TIMETABLE_TITLE, message: err});
    }
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:'server fault'});
  }
});

/**
 * POST /tables/:timetable_id/lecture/:lecture_id
 * add a lecture into a timetable
 * param ===================================
 * Lecture id from search query
 */
router.post('/:timetable_id/lecture/:lecture_id', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  try {
    let table = await TimetableModel.getByTableId(user._id, req.params.timetable_id);
    if (!table) return res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    await table.addRefLecture(req.params.lecture_id);
    res.json(table);
  } catch (err) {
    if (err === errcode.DUPLICATE_LECTURE)
      return res.status(403).json({errcode:err, message:"duplicate lecture"});
    else if (err == errcode.LECTURE_TIME_OVERLAP)
      return res.status(403).json({errcode:err, message:"lecture time overlap"});
    else if (err == errcode.REF_LECTURE_NOT_FOUND)
      return res.status(404).json({errcode: errcode.REF_LECTURE_NOT_FOUND, message:"ref lecture not found"});
    else if (err == errcode.WRONG_SEMESTER)
      return res.status(403).json({errcode: errcode.WRONG_SEMESTER, message:"wrong semester"});

    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"insert lecture failed"});
  }
});

/**
 * POST /tables/:id/lecture
 * add a lecture into a timetable
 * param ===================================
 * json object of lecture to add
 */
router.post('/:id/lecture', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  try {
    let table = await TimetableModel.getByTableId(user._id, req.params.id);
    if (!table) return res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    await table.addCustomLecture(req.body);
    res.json(table);
  } catch (err) {
    if (err == errcode.INVALID_TIMEMASK)
      return res.status(403).json({errcode: err, message:"invalid timemask"});
    if (err == errcode.INVALID_TIMEJSON)
      return res.status(400).json({errcode: err, message:"invalid timejson"});
    if (err === errcode.DUPLICATE_LECTURE)
      return res.status(403).json({errcode:err, message:"duplicate lecture"});
    if (err == errcode.LECTURE_TIME_OVERLAP)
      return res.status(403).json({errcode:err, message:"lecture time overlap"});
    if (err == errcode.INVALID_COLOR)
      return res.status(400).json({errcode:err, message:"invalid color"});
    if (err == errcode.NO_LECTURE_TITLE)
      return res.status(400).json({errcode: errcode.NO_LECTURE_TITLE, message:"no lecture title"});
    if (err == errcode.NOT_CUSTOM_LECTURE)
      return res.status(403).json({errcode: errcode.NOT_CUSTOM_LECTURE, message:"only custom lectures allowed"});
    if (err == errcode.WRONG_SEMESTER)
      return res.status(403).json({errcode: errcode.WRONG_SEMESTER, message:"wrong semester"});
    logger.error(err)
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"insert lecture failed"});
  }
});

/**
 * PUT /tables/:table_id/lecture/:lecture_id
 * update a lecture of a timetable
 * param ===================================
 * json object of lecture to update
 */

router.put('/:table_id/lecture/:lecture_id', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  var rawLecture = req.body;
  if(!rawLecture) return res.status(400).json({errcode: errcode.NO_LECTURE_INPUT, message:"empty body"});

  if (!req.params.lecture_id)
    return res.status(400).json({errcode: errcode.NO_LECTURE_ID, message:"need lecture_id"});

  try {
    let table = await TimetableModel.getByTableId(user._id, req.params.table_id);
    if (!table) return res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});

    UserLectureModel.setTimemask(rawLecture);
    await table.updateLecture(req.params.lecture_id, rawLecture);
    res.json(table);
  } catch (err) {
    if (err == errcode.INVALID_TIMEMASK)
      return res.status(400).json({errcode: errcode.INVALID_TIMEMASK, message:"invalid timemask"});
    if (err == errcode.INVALID_TIMEJSON)
      return res.status(400).json({errcode: err, message:"invalid timejson"});
    if (err == errcode.LECTURE_TIME_OVERLAP)
      return res.status(403).json({errcode: err, message:"lecture time overlapped"});
    if (err == errcode.ATTEMPT_TO_MODIFY_IDENTITY)
      return res.status(403).json({errcode:err, message:"modifying identities forbidden"})
    if (err == errcode.INVALID_COLOR)
      return res.status(400).json({errcode:err, message:"invalid color"})
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"server fault"});
  }
});

router.put('/:table_id/lecture/:lecture_id/reset', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];

  if (!req.params.lecture_id)
    return res.status(400).json({errcode: errcode.NO_LECTURE_ID, message:"need lecture_id"});

  try {
    let table = await TimetableModel.getByTableId(user._id, req.params.table_id);
    if (!table) return res.status(404).json({errcode:errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    await table.resetLecture(req.params.lecture_id);
    res.json(table);
  } catch (err) {
    if (err === errcode.IS_CUSTOM_LECTURE) {
      return res.status(403).json({errcode:err, message:"cannot reset custom lectures"});
    } else if (err === errcode.REF_LECTURE_NOT_FOUND) {
      return res.status(404).json({errcode:err, message:"ref lecture not found"});
    } else if (err === errcode.LECTURE_NOT_FOUND) {
      return res.status(404).json({errcode:err, message:"lecture not found"});
    } else if (err === errcode.LECTURE_TIME_OVERLAP) {
      return res.status(403).json({errcode:err, message:"lecture time overlap"});
    } else {
      logger.error(err);
      return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"reset lecture failed"});
    }
  }
});

/**
 * DELETE /tables/:table_id/lecture/:lecture_id
 * delete a lecture from a timetable
 */
router.delete('/:table_id/lecture/:lecture_id', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  try {
    let table = await TimetableModel.deleteLectureWithUser(user._id, req.params.table_id, req.params.lecture_id);
    res.json(table);
  } catch (err) {
    if (err == errcode.TIMETABLE_NOT_FOUND) 
      return res.status(404).json({errcode:errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    logger.error(err);
    return res.status(500).json({errcode:errcode.SERVER_FAULT, message:"delete lecture failed"});
  }
});

/**
 * DELETE /tables/:id
 * delete a timetable
 */
router.delete('/:id', async function(req, res, next) { // delete
  var user:UserModel = <UserModel>req["user"];
  try {
    await TimetableModel.remove(user._id, req.params.id);
    let tableList = await TimetableModel.getAbstractList(user._id);
    res.json(tableList);
  } catch (err) {
    if (err == errcode.TIMETABLE_NOT_FOUND) 
      return res.status(404).json({errcode:errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    logger.error(err);
    return res.status(500).json({errcode:errcode.SERVER_FAULT, message:"delete timetable failed"});
  }
});

/**
 * POST /tables/:id/copy
 * copy a timetable
 */
router.post('/:id/copy', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  try {
    let table = await TimetableModel.getByTableId(user._id, req.params.id);
    if (!table) return res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    await table.copy();
    let tableList = await TimetableModel.getAbstractList(user._id);
    res.json(tableList);
  } catch (err) {
    logger.error("/:id/copy ", err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"copy table failed"});
  }
});

router.put('/:id', async function(req, res, next) {
  var user:UserModel = <UserModel>req["user"];
  if (!req.body.title) return res.status(400).json({errcode: errcode.NO_TIMETABLE_TITLE, message:"should provide title"});
  
  try {
    await TimetableModel.changeTitle(user._id, req.params.id, req.body.title);
    let tableList = await TimetableModel.getAbstractList(user._id);
    res.json(tableList);
  } catch (err) {
    if (err == errcode.DUPLICATE_TIMETABLE_TITLE)
      return res.status(403).json({errcode: errcode.DUPLICATE_TIMETABLE_TITLE, message:"duplicate title"});
    if (err == errcode.TIMETABLE_NOT_FOUND)
      return res.status(404).json({errcode: errcode.TIMETABLE_NOT_FOUND, message:"timetable not found"});
    logger.error(err);
    return res.status(500).json({errcode: errcode.SERVER_FAULT, message:"update timetable title failed"});
  }
});

export = router;
