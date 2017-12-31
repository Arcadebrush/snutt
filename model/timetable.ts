import db = require('../db');
import {UserLectureModel, RefLectureModel} from './lecture';
import Util = require('../lib/util');
import errcode = require('../lib/errcode');
import Color = require('../lib/color');
import * as log4js from 'log4js';
import { ObjectId } from 'bson';
var logger = log4js.getLogger();

// TimetableSchema.index({ user_id: 1 })
// TimetableSchema.index({ year: 1, semester: 1})

var tableCollection = db.collection('timetables');

export class TimetableModel {
  _id: string;
  user_id: string;
  year: number;
  semester: number;
  title: string;
  lecture_list: UserLectureModel[];
  updated_at: Date;

  async copy(): Promise<TimetableModel> {
    for (let trial = 1; true; trial++) {
      let newTitle = this.title + " (" + trial + ")";
      try {
        return await this.copyWithTitle(newTitle);
      } catch (err) {
        if (err === errcode.DUPLICATE_TIMETABLE_TITLE) {
          continue;
        }
        throw err;
      }
    }
  }

  async copyWithTitle(newTitle:string): Promise<TimetableModel> {
    if (newTitle == this.title) throw errcode.DUPLICATE_TIMETABLE_TITLE;
    let duplicatePromise = TimetableModel.getByTitle(this.user_id, this.year, this.semester, newTitle);
    let copied = JSON.parse(JSON.stringify(this));
    Util.deleteObjectId(copied);
    copied.title = newTitle;
    if (await duplicatePromise) throw errcode.DUPLICATE_TIMETABLE_TITLE;
    await tableCollection.insertOne(copied);
    return copied;
  }

  async addRefLecture(lectureId: string): Promise<void> {
    let refLecture = await RefLectureModel.findById(lectureId);
    if (!refLecture) throw errcode.REF_LECTURE_NOT_FOUND;
    if (refLecture.year != this.year || refLecture.semester != this.semester) {
      throw errcode.WRONG_SEMESTER;
    }

    delete refLecture.year;
    delete refLecture.semester;

    let userLecture: UserLectureModel = <any>refLecture;
    userLecture.colorIndex = this.getAnyAvailableColor();
    await this.addLecture(userLecture);
  }

  async addCustomLecture(lecture: UserLectureModel): Promise<void> {
    /* If no time json is found, mask is invalid */
    lecture.setTimemask();
    if (!lecture.course_title) throw errcode.NO_LECTURE_TITLE;
    
    if (!lecture.isCustom()) throw errcode.NOT_CUSTOM_LECTURE;

    if (!lecture.color && !lecture.colorIndex) lecture.colorIndex = this.getAnyAvailableColor();
    await this.addLecture(lecture);
  }

  private async addLecture(lecture: UserLectureModel): Promise<void> {
    Util.deleteObjectId(lecture);
    lecture._id = <any>new ObjectId();
    if (lecture.credit && (typeof lecture.credit === 'string' || <any>lecture.credit instanceof String)) {
      lecture.credit = Number(lecture.credit);
    }

    for (var i = 0; i<this.lecture_list.length; i++){
      if (UserLectureModel.equals(lecture, this.lecture_list[i])) {
        throw errcode.DUPLICATE_LECTURE;
      }
    }
    if (!this.validateLectureTime(lecture._id, lecture)) {
      throw errcode.LECTURE_TIME_OVERLAP;
    }
  
    if (!lecture.validateColor()) {
      throw errcode.INVALID_COLOR;
    }
  
    lecture.created_at = new Date();
    lecture.updated_at = new Date();
    this.lecture_list.push(lecture); // shallow copy of this.mongooseDocuemnt.lecture_list
    await tableCollection.update({ _id: this._id }, { $set: {updated_at: new Date()}, $push: { lecture_list: lecture }});
  }

  getLecture(lectureId): UserLectureModel {
    for (let i=0; i<this.lecture_list.length; i++) {
      if (this.lecture_list[i]._id == lectureId) return this.lecture_list[i];
    }
    return null;
  }

  private rawLectureToUpdateSet(lectureId, rawLecture): any {
    if (rawLecture.course_number || rawLecture.lecture_number) {
      throw errcode.ATTEMPT_TO_MODIFY_IDENTITY;
    }
  
    if (rawLecture['class_time_json']) {
      rawLecture['class_time_mask'] = Util.timeJsonToMask(rawLecture['class_time_json'], true);
    }
  
    if (rawLecture['class_time_mask'] && !this.validateLectureTime(lectureId, rawLecture)) {
      throw errcode.LECTURE_TIME_OVERLAP;
    }
  
    if (rawLecture['color']) {
      let userLecture = new UserLectureModel();
      userLecture.color = rawLecture['color'];
      userLecture.colorIndex = rawLecture['colorIndex'];
      if (!userLecture.validateColor()) throw errcode.INVALID_COLOR;
    }
  
    rawLecture.updated_at = Date.now();
  
    var update_set = {};
    Util.deleteObjectId(rawLecture);
    for (var field in rawLecture) {
      update_set['lecture_list.$.' + field] = rawLecture[field];
    }
    update_set['updated_at'] = new Date();
    return update_set;
  }

  async updateLecture(lectureId: string, rawLecture: any): Promise<void> {
    if (!lectureId || lectureId == "undefined") {
      throw "lectureId cannot be null nor undefined";
    }
    if (!this.getLecture(lectureId)) throw errcode.LECTURE_NOT_FOUND;

    let updateSet = this.rawLectureToUpdateSet(lectureId, rawLecture);
    let newTable: TimetableModel = (await tableCollection.findOneAndUpdate(
      { _id: this._id, "lecture_list._id": lectureId},
      {$set : updateSet}, 
      {returnOriginal: false})).value;
    
    this.lecture_list = newTable.lecture_list;
  };


  async resetLecture(lectureId: string): Promise<void> {
    var lecture:UserLectureModel = this.getLecture(lectureId);
    if (lecture.isCustom()) {
      throw errcode.IS_CUSTOM_LECTURE;
    }

    let refLecture: any = await RefLectureModel.findByCourseNumber
        (this.year, this.semester, lecture.course_number, lecture.lecture_number);

    if (refLecture === null) throw errcode.REF_LECTURE_NOT_FOUND;

    delete refLecture.lecture_number;
    delete refLecture.course_number;
    delete refLecture.year;
    delete refLecture.semester;
    await this.updateLecture(lectureId, refLecture);
  }

  static async deleteLectureWithUser(userId: string, tableId: string, lectureId: string): Promise<TimetableModel> {
    let result = await tableCollection.findOneAndUpdate(
      {'_id' : tableId, 'user_id' : userId},
      { $pull: {lecture_list : {_id: lectureId} } }, {returnOriginal: false}
    );
    if (!result.value) throw errcode.TIMETABLE_NOT_FOUND;
    return result.value;
  }

  static async deleteLecture(tableId: string, lectureId: string): Promise<TimetableModel> {
    let result = await tableCollection.findOneAndUpdate(
      {'_id' : tableId},
      { $pull: {lecture_list : {_id: lectureId} } }, {returnOriginal: false}
    );
    if (!result.value) throw errcode.TIMETABLE_NOT_FOUND;
    return result.value;
  }

  async deleteLecture(lectureId): Promise<void> {
    let newTable = await TimetableModel.deleteLecture(this._id, lectureId);
    this.lecture_list = newTable.lecture_list;
  };


  validateLectureTime(lectureId:string, lecture:UserLectureModel): boolean {
    for (var i=0; i<this.lecture_list.length; i++) {
      var tableLecture:any = this.lecture_list[i];
      if (lectureId == tableLecture._id) continue;
      for (var j=0; j<tableLecture.class_time_mask.length; j++)
        if ((tableLecture.class_time_mask[j] & lecture.class_time_mask[j]) != 0) return false;
    }
    return true;
  }

  getAvailableColors(): number[] {
    var checked:boolean[] = [];
    for (var i=0; i<this.lecture_list.length; i++) {
      var lecture_color = this.lecture_list[i].colorIndex;
      checked[lecture_color] = true;
    }
  
    var ret:number[] = [];
    // colorIndex = 0 is custom color!
    for (var i=1; i<Color.numColor; i++) {
      if (!checked[i]) ret.push(i);
    }
    return ret;
  }

  getAnyAvailableColor(): number {
    let availableColors = this.getAvailableColors();
    // colorIndex = 0 is custom color!
    if (availableColors.length == 0) return Math.floor(Math.random() * Color.numColor) + 1;
    else return availableColors[Math.floor(Math.random() * availableColors.length)]
  }

  findLectureId(courseNumber, lectureNumber): string {
    for (let i=0; i<this.lecture_list.length; i++) {
      if (this.lecture_list[i]['course_number'] == courseNumber &&
          this.lecture_list[i]['lecture_number'] == lectureNumber) return this.lecture_list[i]['_id'];
    }
    throw errcode.LECTURE_NOT_FOUND;
  }

  static async remove(userId, tableId): Promise<void> {
    let result = await tableCollection.findOneAndDelete({'user_id': userId, '_id' : tableId});
    if (!result.value) throw errcode.TIMETABLE_NOT_FOUND;
  }

  static async changeTitle(userId, tableId, newTitle): Promise<void> {
    let document: TimetableModel = await tableCollection.findOne({'user_id': userId, '_id' : tableId});
    if (!document) throw errcode.TIMETABLE_NOT_FOUND;
    if (document['title'] == newTitle) return;

    let duplicate = await TimetableModel.getByTitle(userId, document['year'], document['semester'], newTitle);
    if (duplicate !== null) throw errcode.DUPLICATE_TIMETABLE_TITLE;
    
    await tableCollection.update({_id: tableId}, {$set: {title: newTitle, updated_at: new Date()}});
  }

  static async createFromParam(params): Promise<TimetableModel> {
    if (!params || !params.user_id || !params.year || !params.semester || !params.title) {
      throw errcode.NOT_ENOUGH_TO_CREATE_TIMETABLE;
    }

    let duplicatePromise = TimetableModel.getByTitle(params.user_id, params.year, params.semester, params.title);

    let newTable = {
      user_id : params.user_id,
      year : params.year,
      semester : params.semester,
      title : params.title,
      lecture_list : [],
      updated_at : new Date()
    }

    if (await duplicatePromise !== null) throw errcode.DUPLICATE_TIMETABLE_TITLE;
    let result = await tableCollection.insertOne(newTable);
    newTable['_id'] = result.insertedId;
    return <any>newTable;
  };

  static getAbstractList(userId: string): Promise<
      [{year: number,
        semester: number,
        title: string,
        _id: string,
        updated_at: Date }]> {
    return <any>tableCollection.find({user_id: userId}, {projection: {
      year: 1,
      semester: 1,
      _id: 1,
      title: 1,
      updated_at: 1
    }});
  }

  static getBySemester(user_id, year, semester): Promise<TimetableModel[]> {
    return tableCollection.find({'user_id': user_id, 'year': year, 'semester': semester});
  };

  static async getByTitle(userId: string, year: number, semester: number, title: string): Promise<TimetableModel> {
    return tableCollection.findOne({'user_id': userId, 'year': year, 'semester': semester, 'title': title});
  }

  static getByTableId(userId: string, tableId: string): Promise<TimetableModel> {
    return tableCollection.findOne({'user_id': userId, '_id': tableId});
  }

  static getWithLecture(year: number, semester: number, courseNumber: string, lectureNumber: string): Promise<TimetableModel[]> {
    return tableCollection.find(
        {
          year: year,
          semester: semester,
          lecture_list: {
            $elemMatch : {
              course_number: courseNumber,
              lecture_number: lectureNumber
            }
          }
        });
  }

  static getRecentRaw(user_id): Promise<any> {
    return tableCollection.findOne({'user_id': user_id}, {sort: {updated_at : -1}});
  };
}
