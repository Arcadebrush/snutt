import {LectureLine} from './fetch';
import {RefLectureModel} from '../../../model/lecture';
import Util = require('../../../lib/util');
import * as log4js from 'log4js';
import { ObjectId } from 'bson';
var logger = log4js.getLogger();

export type TagStruct = {
  classification : string[],
  department : string[],
  academic_year : string[],
  credit : string[],
  instructor : string[],
  category : string[]
};

export function parseLines(year:number, semesterIndex:number, lines:LectureLine[]) : {
  new_lectures: RefLectureModel[],
  tags: TagStruct
} {
  var new_lectures:RefLectureModel[] = new Array<RefLectureModel>();
  var tags:TagStruct = {
    classification : [],
    department : [],
    academic_year : [],
    credit : [],
    instructor : [],
    category : []
  };
  for (let i=0; i<lines.length; i++) {
    var line = lines[i];

    var new_tag = {
      classification : line.classification,
      department : line.department,
      academic_year : line.academic_year,
      credit : line.credit+'학점',
      instructor : line.instructor,
      category : line.category
    };

    for (let key in tags) {
      if (tags.hasOwnProperty(key)){
        var existing_tag = null;
        for (let j=0; j<tags[key].length; j++) {
          if (tags[key][j] == new_tag[key]){
            existing_tag = new_tag[key];
            break;
          }
        }
        if (existing_tag === null) {
          if (new_tag[key] === undefined) {
            console.log(key);
            console.log(line);
          }
          if (new_tag[key].length < 2) continue;
          tags[key].push(new_tag[key]);
        }
      }
    }

    var timeJson = Util.timeAndPlaceToJson(line.class_time, line.location);
    if (timeJson === null) logger.warn("timeJson not found from (" + line.class_time + ", " + line.location + ")");
    // TimeMask limit is 15*2
    for (let j=0; j<timeJson.length; j++) {
      var t_end = timeJson[j].start+timeJson[j].len;
      if (t_end > 15) {
        logger.warn("("+line.course_number+", "+line.lecture_number+", "+line.course_number+
          ") ends at "+t_end);
      }
    }

    new_lectures.push(<any>{
      year: year,
      semester: semesterIndex,
      classification: line.classification,
      department: line.department,
      academic_year: line.academic_year,
      course_number: line.course_number,
      lecture_number: line.lecture_number,
      course_title: line.course_title,
      credit: line.credit,
      class_time: line.class_time,
      class_time_json: timeJson,
      class_time_mask: Util.timeJsonToMask(timeJson),
      instructor: line.instructor,
      remark: line.remark,
      category: line.category
    });
  }

  return {
    new_lectures: new_lectures,
    tags: tags
  }
}
