/**
 * 유저로부터 피드백을 입력 받아 DB에 삽입
 */

import db = require('../db');

// FeedbackSchema.index({timestamp: -1});
var feedbackCollection = db.collection("feedbacks");

export class FeedbackModel {
  _id: string
  email: string
  message: string
  timestamp: number
  platform: string

  static async insert(email: string, message: string, platform: string): Promise<void> {
    let feedback = {
      email: email,
      message: message,
      timestamp: Date.now(),
      platform: platform
    };
  
    await feedbackCollection.insertOne(feedback);
  }

  static async get(limit: number, offset: number): Promise<FeedbackModel[]> {
    return await feedbackCollection.find({}, {
      sort: {timestamp: 1},
      skip: offset,
      limit: limit
    });
  }

  static async remove(ids: any[]): Promise<any> {
    return feedbackCollection.deleteMany({_id: { $in: ids }});
  }
}
