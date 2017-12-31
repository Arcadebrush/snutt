import { RefLectureModel } from './lecture';
import db = require('../db');
import errcode = require('../lib/errcode');
import * as log4js from 'log4js';
var logger = log4js.getLogger();

var lectureCollection = db.collection('lectures');
var querylogCollection = db.collection('query_logs');

//something similar to LIKE query in SQL
function like(str: string, matchStartChar?: boolean): string {
  //replace every character(eg. 'c') to '.*c', except for first character
  var cstr = str.split("");
  var joined = cstr.join('[^()]*');
  if (matchStartChar) joined = '^'+joined;
  return joined;
}

function isHangulCode(c:number) {
  if( 0x1100<=c && c<=0x11FF ) return true;
  if( 0x3130<=c && c<=0x318F ) return true;
  if( 0xAC00<=c && c<=0xD7A3 ) return true;
  return false;
}

export function writeLog(obj:any) {
  let cloned = JSON.parse(JSON.stringify(obj));
  cloned.timestamp = Date.now();
  querylogCollection.insertOne(cloned);   // Do not wait for result
}

/*
function isNumberCode(c:number) {
  return 0x0030<=c && c<=0x0039;
}
*/

function isHangulInString(str:string) {
  for (let i=0; i<str.length; i++) {
    let code = str.charCodeAt(i);
    if (isHangulCode(code)) return true;
  }
  return false;
}

/*
 * Find like ??학점
 */
const creditRegex = /^(\d+)학점$/;
function getCreditFromString(str:string): number {
  let result = str.match(creditRegex);
  if (result) return Number(result[1]);
  else return null;
}

/**
 * 라우터의 Body를 자료구조로 만듦
 */
export type LectureQuery = {
  year:number;
  semester:number;
  title:string;
  classification:[string];
  credit:[number];
  course_number:[string];
  academic_year:[string];
  instructor:[string];
  department:[string];
  category:[string];
  time_mask:[number];
  offset:number;
  limit:number;
}

/**
 * 라우터에서 전송받은 Body를 mongo query로 변환
 */
async function toMongoQuery(lquery:LectureQuery): Promise<Object> {
  var mquery = {}; // m for Mongo
  mquery["year"] = lquery.year;
  mquery["semester"] = lquery.semester;
  if (lquery.title)
    mquery["course_title"] = { $regex: like(lquery.title, false), $options: 'i' };
  if (lquery.credit && lquery.credit.length)
    mquery["credit"] = { $in: lquery.credit };
  if (lquery.instructor && lquery.instructor.length)
    mquery["instructor"] = { $in : lquery.instructor };
  if (lquery.academic_year && lquery.academic_year.length)
    mquery["academic_year"] = { $in : lquery.academic_year };
  if (lquery.course_number && lquery.course_number.length)
    mquery["course_number"] = { $in : lquery.course_number };
  if (lquery.classification && lquery.classification.length)
    mquery["classification"] = { $in : lquery.classification };
  if (lquery.category && lquery.category.length)
    mquery["category"] = { $in : lquery.category };
  if (lquery.department && lquery.department.length) // in this case result should be sorted by departments
    mquery["department"] = { $in : lquery.department };
  if (lquery.time_mask) {
    if (lquery.time_mask.length != 7) return Promise.reject(errcode.INVALID_TIMEMASK);
    /**
     * 시간이 아예 입력되지 않은 강의는 제외
     * 시간 검색의 의미에 잘 맞지 않는다고 판단, 제외했음
     */ 
    mquery["$where"] = "(";
    for (let i=0; i< 7; i++) {
      if (i > 0) mquery["$where"] += " || ";
      mquery["$where"] += "this.class_time_mask[" + i + "] != 0";
    }
    mquery["$where"] += ")";

    /**
     * 타임마스크와 비트 연산
     */
    lquery.time_mask.forEach(function(bit, idx) {
      mquery["$where"] += " && ((this.class_time_mask["+idx+"] & "+(~bit<<1>>>1)+") == 0)";
    });
  }

  return mquery;
}

/**
 * Course title을 분석하지 않고
 * 따로 입력받은 필터로만 검색
 */
export async function explicitSearch(lquery: LectureQuery): Promise<RefLectureModel[]> {
  var mquery = await toMongoQuery(lquery);
    
  var offset, limit;
  if (!lquery.offset) offset = 0;
  else offset = lquery.offset;
  if (!lquery.limit) limit = 20;
  else limit = lquery.limit;
  try {
    return await lectureCollection.find(mquery, {
      limit: limit,
      skip: offset
    })
  } catch (err) {
    logger.error(err);
    throw errcode.SERVER_FAULT;
  }
}

/**
 * Course title을 분석하여
 * 전공, 학과, 학년 등의 정보를 따로 뽑아냄.
 */
export async function extendedSearch(lquery: LectureQuery): Promise<RefLectureModel[]> {
  var mquery = await toMongoQuery(lquery);
  var title = lquery.title;
  if (!title) return explicitSearch(lquery);
  var words = title.split(' ');

  var andQueryList = [];
  for(let i=0; i<words.length; i++) {
    var orQueryList = [];

    var result;
    if (words[i] == '전공') {
      /* 전공은 전선 혹은 전필 */
      orQueryList.push({ classification : { $in: [ "전선", "전필" ] } });
    } else if (words[i] == '석박' || words[i] == '대학원') {
      /*
       * 아래에서 classification은 like query가 아니므로 '석박'으로 검색하면 결과가 안나옴.
       */
      orQueryList.push({ academic_year : { $in : ["석사", "박사", "석박사통합"] } });
    } else if (words[i] == '학부' || words[i] == '학사') {
      orQueryList.push({ academic_year : { $nin : ["석사", "박사", "석박사통합"] } });
    } else if (result = getCreditFromString(words[i])) {
      /*
       * LectureModel에는 학점이 정수로 저장됨.
       * '1학점' '3학점'과 같은 단어에서 학점을 정규식으로 추출
       */
      orQueryList.push({ credit : result });
    } else if (isHangulInString(words[i])) {
      let regex = like(words[i], false);
      orQueryList.push({ course_title : { $regex: regex, $options: 'i' } });
      /*
       * 교수명을 regex로 처리하면 '수영' -> 김수영 교수님의 강좌, 조수영 교수님의 강좌와 같이
       * 원치 않는 결과가 나옴
       */
      orQueryList.push({ instructor : words[i] });
      orQueryList.push({ category : { $regex: regex, $options: 'i' } });

      /*
       * '컴공과', '전기과' 등으로 검색할 때, 실제 학과명은 '컴퓨터공학부', '전기공학부'이므로
       * 검색이 안됨. 만약 '과' 혹은 '부'로 끝나는 단어라면 regex의 마지막 단어를 빼버린다.
       */
      var lastChar = words[i].charAt(words[i].length - 1);
      if (lastChar == '과' || lastChar == '부') {
        orQueryList.push({ department : { $regex: '^'+regex.slice(0, -1), $options: 'i' } });
      } else {
        orQueryList.push({ department : { $regex: '^'+regex, $options: 'i' } });
      }
      orQueryList.push({ classification : words[i] });
      orQueryList.push({ academic_year : words[i] });
    } else {
      /* 한국인이므로 영문은 약자로 입력하지 않는다고 가정 */
      let regex = words[i];
      orQueryList.push({ course_title : { $regex: regex, $options: 'i' } });
      /* 영문 이름의 교수는 성이나 이름만 입력하는 경우가 많음 */
      orQueryList.push({ instructor : { $regex: regex, $options: 'i' } });
      orQueryList.push({ course_number : words[i] });
      orQueryList.push({ lecture_number : words[i] });
    }
    
    andQueryList.push({"$or" : orQueryList});
  }
  mquery["$or"] = [ {course_title : mquery["course_title"]}, {$and : andQueryList} ];

  /*
   * Course title can be in the subchunk of the keyword.
   * ex) '컴공 논설실' => '논리설계실험'
   * We have to reset course_title regex to find those.
   */
  delete mquery["course_title"];

  var offset, limit;
  if (!lquery.offset) offset = 0;
  else offset = lquery.offset;
  if (!lquery.limit) limit = 20;
  else limit = lquery.limit;
  try {
    return await lectureCollection.find(mquery, {
      limit: limit,
      skip: offset
    })
  } catch (err) {
    logger.error(err);
    throw errcode.SERVER_FAULT;
  }
}
