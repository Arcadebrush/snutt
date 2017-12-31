/**
 * Created by north on 16. 2. 24.
 */
import db = require('../db');
import errcode = require('../lib/errcode');

// TagListSchema.index({year: 1, semester: 1});
var taglistCollection = db.collection('taglists');

export class TagList {
  year: number;
  semester: number;
  updated_at: Date;
  tags: {
    classification: string[],
    department: string[],
    academic_year: string[],
    credit: string[],
    instructor: string[],
    category: string[]
  };

  static findBySemester(year: number, semester: number): Promise<TagList> {
    return taglistCollection.findOne({year: year, semester: semester});
  }

  static async getUpdateTime(year: number, semester: number): Promise<Date> {
    let result = await taglistCollection.findOne({year: year, semester: semester});
    if (!result) throw errcode.TAG_NOT_FOUND;
    return result.updated_at;
  }

  static async createOrUpdateTags(year: number, semester: number, tags: {
    classification: string[],
    department: string[],
    academic_year: string[],
    credit: string[],
    instructor: string[],
    category: string[]
  }): Promise<void> {
    await taglistCollection.findOneAndUpdate(
      {'year': year, 'semester': semester}, 
      {'tags': tags, 'updated_at': Date.now()}, 
      {upsert: true});
  }
}
