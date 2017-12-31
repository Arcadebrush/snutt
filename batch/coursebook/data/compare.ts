import {RefLectureModel} from '../../../model/lecture';
import Util = require('../../../lib/util');
import * as log4js from 'log4js';
var logger = log4js.getLogger();

type LectureIdent = {
  course_number: string,
  lecture_number: string,
  course_title: string
}

type LectureIdentUpdated = {
  course_number: string,
  lecture_number: string,
  course_title: string,
  before: any,
  after: any
}

export class LectureDiff {
  created: LectureIdent[];
  removed: LectureIdent[];
  updated: LectureIdentUpdated[];

  constructor() {
    this.created = [];
    this.removed = [];
    this.updated = [];
  }

  addLecture(array:LectureIdent[], lecture:RefLectureModel) {
    array.push({
      course_number: lecture.course_number,
      lecture_number: lecture.lecture_number,
      course_title: lecture.course_title
    });
  };

  addCreated(lecture:RefLectureModel) { this.addLecture(this.created, lecture) };
  addRemoved(lecture:RefLectureModel) { this.addLecture(this.removed, lecture) };
  addUpdated(updatedObj:any, lecture:RefLectureModel) {
    updatedObj.course_number = lecture.course_number;
    updatedObj.lecture_number = lecture.lecture_number;
    updatedObj.course_title = lecture.course_title;
    this.updated.push(updatedObj);
  };
}

export async function compareLectures(year:number, semester: number, new_lectures:RefLectureModel[]): Promise<LectureDiff> {
  logger.info("Pulling existing lectures...");
  var old_lectures = await RefLectureModel.findBySemester(year, semester);
  var diff = new LectureDiff();
  var checked:boolean[] = [];
  for (let i=0; i<new_lectures.length; i++) {
    var exists = false;
    for (let j=0; j<old_lectures.length; j++) {
      if (checked[j]) continue;
      if (old_lectures[j].course_number != new_lectures[i].course_number) continue;
      if (old_lectures[j].lecture_number != new_lectures[i].lecture_number) continue;
      var diff_update = Util.compareLecture(old_lectures[j], new_lectures[i]);
      if (diff_update) diff.addUpdated(diff_update, old_lectures[j]);
      checked[j] = true;
      exists = true;
      break;
    }
    if (exists === false) {
      diff.addCreated(new_lectures[i]);
      //console.log(new_lectures[i].course_title+" created");
    }
  }
  for (let i=0; i<old_lectures.length; i++) {
    if (!checked[i]) {
      diff.addRemoved(old_lectures[i]);
      //console.log(old_lectures[i].course_title+" removed");
    }
  }

  return diff;
}
