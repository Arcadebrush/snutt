/**
 * test/api/api_init.js
 * This script is parent script for api tests.
 * usage : $ npm test
 */
process.env.NODE_ENV = 'mocha';

import mocha = require("mocha");
 
import assert = require('assert');
import supertest = require('supertest');
import config = require('../../config/config');
import db = require('../../db');
import app = require('../../app');

var CourseBookModel = require('../../model/courseBook').CourseBookModel;
import {RefLectureModel} from '../../model/lecture';

let request = supertest(app);
describe('API Test', function() {
  before('valid snutt.yml', function(done) {
    if (config.secretKey && config.host && config.port)
      return done();
    else
      return done(new Error("Invalid config. Please set conf.yml"));
  });

  // Clean Test DB
  // db.dropDatabase()
  // dose not actually drop the db, but actually clears it
  before('clear snutt_test db', function(done) {
    db.dropDatabase().then(function(){
      done();
    }).catch(function(err){
      done(err);
    });
  });

  // Add 2 coursebooks, 2016-2 and 2015-W
  before('add initial coursebooks for test', function(done) {
    let promise1 = db.collection("coursebooks").insertOne({ year: 2015, semester: 4, updated_at: Date.now()});
    let promise2 = db.collection("coursebooks").insertOne({ year: 2016, semester: 3, updated_at: Date.now()});
    Promise.all([promise1, promise2]).catch(function(err) {
      done(err);
    }).then(function(result) {
      done();
    });
  });

  before('insert initial lecture for test', async function(done) {
    await RefLectureModel.insertMany([{
        "year": 2016,
        "semester": 3,
        "classification": "전선",
        "department": "컴퓨터공학부",
        "academic_year": "3학년",
        "course_number": "400.320",
        "lecture_number": "002",
        "course_title": "공학연구의 실습 1",
        "credit": 1,
        "class_time": "화(13-1)/목(13-1)",
        "instructor": "이제희",
        "quota": 15,
        "enrollment": 0,
        "remark": "컴퓨터공학부 및 제2전공생만 수강가능",
        "category": "",
        /*
         * See to it that the server removes _id fields correctly
         */
        "_id": "56fcd83c041742971bd20a86",
        "class_time_mask": [
          0,
          12,
          0,
          12,
          0,
          0,
          0
        ],
        "class_time_json": [
          {
            "day": 1,
            "start": 13,
            "len": 1,
            "place": "302-308",
            "_id": "56fcd83c041742971bd20a88"
          },
          {
            "day": 3,
            "start": 13,
            "len": 1,
            "place": "302-308",
            "_id": "56fcd83c041742971bd20a87"
          }
        ],
    }]);
    done();
  });

  // Register test user
  before('register initial test user', function(done) {
    request.post('/auth/register_local')
      .send({id:"snutt", password:"abc1234"})
      .expect(200)
      .end(function(err, res){
        assert.equal(res.body.message, 'ok');
        done(err);
      });
  });

  it('MongoDB >= 2.4', async function(done) {
    let info = await db.buildInfo();
    if (parseFloat(info.version) < 2.4)
      return done(new Error("MongoDB version("+info.version+") is outdated(< 2.4). Service might not work properly"));
    done();
  });

  it('Recent Coursebook', function(done) {
    request.get('/course_books/recent')
      .expect(200)
      .end(function(err, res){
        assert.equal(res.body.semester, 3);
        done(err);
      });
  });

  describe('etc', function () {
    require('./etc')(app, db, request);
  });

  describe('User', function () {
    require('./user_test')(app, db, request);
  });

  describe('Timetable', function () {
    require('./timetable_test')(app, db, request);
  });

  describe('TagList', function () {
    require('./tag_list_test')(app, db, request);
  });
});
