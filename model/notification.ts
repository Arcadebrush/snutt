/**
 * Notification Model
 * Jang Ryeol, ryeolj5911@gmail.com
 */
import db = require('../db');
import errcode = require('../lib/errcode');
import {UserModel} from './user';
import fcm = require('../lib/fcm');

/**
 * Types
 * - Type.NORMAL      : Normal Messages. Detail would be null
 * - Type.COURSEBOOK  : Course Book Changes. Detail contains lecture difference
 * - Type.LECTURE     : Lecture Changes. Course book changes are for all users.
 *                      Lecture changes contains per-user update log.
 * - Type.LINK_ADDR   : 사용자가 클릭하면 브라우저로 연결되도록 하는 알림
 */
export let Type = {
  NORMAL : 0,
  COURSEBOOK : 1,
  LECTURE_UPDATE : 2,
  LECTURE_REMOVE : 3,
  LINK_ADDR : 4
};

/*
NotificationSchema.index({user_id: 1});
NotificationSchema.index({created_at: -1});
*/

var notificationCollection = db.collection("notifications");

export class NotificationModel {
  _id: string
  user_id: string
  message: string
  created_at: Date
  type: number
  detail: any

  static getNewest(user: UserModel, offset, limit): Promise<NotificationModel[]> {
    let query = {
      user_id: { $in: [ null, user._id ] }
    };
    let regDate = user.getRegDate();
    if (regDate) query["created_at"] = { $gt: regDate };
    return notificationCollection.find(query, {
      sort: {created_at: -1},
      skip: offset,
      limit: limit
    })
  }

  static countUnread(user: UserModel): Promise<number> {
    return notificationCollection.count({
      user_id: {
        $in: [null, user._id]
      },
      created_at: {
        $gt: user.notificationCheckedAt
      }
    });
  }

  static async insert(user_id: string, message: string, type: number, detail: any) {
    if (!type) type = 0;
    if (Number(type) == Type.LINK_ADDR && typeof(detail) != "string") throw errcode.INVALID_NOTIFICATION_DETAIL;
    await notificationCollection.insertOne({
      user_id : user_id,
      message : message,
      created_at : Date.now(),
      type : Number(type),
      detail : detail
    })
  }
}
