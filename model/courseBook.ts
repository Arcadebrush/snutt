import db = require('../db');

var coursebookCollection = db.collection("coursebooks");

export class CourseBookModel {
  year: number
  semester: number
  updated_at: Date

  static async getAll(): Promise<CourseBookModel[]> {
    return await coursebookCollection.find({}, {
      sort: [["year", -1], ["semester", -1]]
    });
  }
  
  static async getRecent(): Promise<CourseBookModel> {
    return await coursebookCollection.findOne({}, {
      sort: [["year", -1], ["semester", -1]]
    });
  }

  static async update(year: number, semester: number): Promise<CourseBookModel> {
    return (await coursebookCollection.findOneAndUpdate({ year: year, semester: semester },
    { updated_at: new Date() },
    {
      upsert: true // insert the document if it does not exist
    })).value;
  }
}
