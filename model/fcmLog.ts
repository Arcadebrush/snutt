import db = require('../db');

var fcmlogCollection = db.collection('fcmlogs');

//FcmLogSchema.index({date: -1})

export class FcmLogModel {
  date: Date
  author: String
  to: String
  message: String
  cause: String
  response: String

  static async write(to: string, author: string, message: string, cause: string, response: any) {
    await fcmlogCollection.insertOne({
      date: Date.now(),
      author: author,
      cause: cause,
      to : to,
      message: message,
      response: JSON.stringify(response)
    });
  }

  static async getRecent(): Promise<FcmLogModel[]> {
    return await fcmlogCollection.find({}, {
      sort: {
        date: -1
      },
      limit: 10
    });
  }
};
