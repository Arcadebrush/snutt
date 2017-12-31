/*
 * model/lecture.js
 * Lecture는 수강편람 상의 강의
 * UserLecture는 유저 시간표 상의 강의
 */
import db = require('../db');
import errcode = require('../lib/errcode');
import Util = require('../lib/util');
import libcolor = require('../lib/color');

var refLectureCollection = db.collection("lectures");

class BaseLecture {
  _id: string
  classification: string                           // 교과 구분
  department: string                               // 학부
  academic_year: string                            // 학년
  course_title: string   // 과목명
  credit: number                                   // 학점
  class_time: string
  class_time_json: [
    { day : number, start: number, len: number, place : string }
  ]
  class_time_mask: number[]
  instructor: string                               // 강사
  remark: string                                   // 비고
  category: string

  course_number: string   // 교과목 번호
  lecture_number: string  // 강좌 번호

  isCustom(): boolean {
    return !this.course_number && !this.lecture_number;
  }

  static equals(l1: any, l2: any) {
    if (l1.isCustom()) return false;
    var ret = true;
    if (l1.year && l2.year)
      ret = ret && (l1.year == l2.year);
    if (l1.semester && l2.semester)
      ret = ret && (l1.semester  == l2.semester);
    return (ret &&
    l1.course_number == l2.course_number &&
    l1.lecture_number == l2.lecture_number);
  }

  static setTimemask(lecture: BaseLecture): void {
    if (lecture.class_time_json) {
      if (!lecture.class_time_mask) {
        lecture.class_time_mask = Util.timeJsonToMask(lecture.class_time_json, true);
      } else {
        var timemask = Util.timeJsonToMask(lecture.class_time_json);
        for (var i=0; i<timemask.length; i++) {
          if (timemask[i] != lecture.class_time_mask[i])
            throw errcode.INVALID_TIMEMASK;
        }
      }
    } else if (lecture.class_time_mask) {
      throw errcode.INVALID_TIMEMASK;
    }
  }

  setTimemask(): void {
    BaseLecture.setTimemask(this);
  }
}

export class RefLectureModel extends BaseLecture {
  year: number           // 연도
  semester: number       // 학기
  
  static findByCourseNumber(year: number, semester: number, courseNumber: string, lectureNumber: string): Promise<RefLectureModel> {
    return refLectureCollection.findOne({'year': year, 'semester': semester,
    'course_number': courseNumber, 'lecture_number': lectureNumber});
  }

  static findById(id: string): Promise<RefLectureModel> {
    return refLectureCollection.findOne({_id: id});
  }

  static findBySemester(year: number, semester: number): Promise<RefLectureModel[]> {
    return refLectureCollection.find({year: year, semester: semester});
  }

  static async dropWholeSemester(year: number, semester: number) {
    await refLectureCollection.deleteMany({year: year, semester: semester});
  }

  static async insertMany(lectures): Promise<number> {
    let result = await refLectureCollection.insertMany(lectures);
    return result.result.ok;
  }
}

export class UserLectureModel extends BaseLecture {
  created_at: Date
  updated_at: Date
  color: {fg : string, bg : string}
  colorIndex: number

  validateColor(): boolean {
    if (this.colorIndex > libcolor.numColor) return false;
    if (this.color) {
      if (this.color.fg && !Util.isColor(this.color.fg)) return false;
      if (this.color.bg && !Util.isColor(this.color.bg)) return false;
    }
    return true;
  }
}

/*
refLectureSchema.index({ year: 1, semester: 1});
refLectureSchema.index({ course_number: 1, lecture_number: 1 })
*/

/*
 * Mongoose 객체를 바로 open하지 않고 매개 함수를 이용,
 * 디비와 비즈니스 로직을 분리
 */
/*
export function queryRefLecture(query, limit, offset): Promise<LectureDocument[]> {
  return <any>LectureModel.find(query).sort('course_title').lean()
    .skip(offset)
    .limit(limit)
    .exec();
}*/
