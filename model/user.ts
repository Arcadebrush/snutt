import db = require('../db');
import { Collection, ObjectId } from 'mongodb';
import config = require('../config/config');
import bcrypt = require('bcrypt');
import crypto = require('crypto');
import errcode = require('../lib/errcode');
import {TimetableModel} from './timetable';
import {CourseBookModel} from './courseBook';
import {FcmLogModel} from './fcmLog';
import * as log4js from 'log4js';
import * as fcm from '../lib/fcm';
var logger = log4js.getLogger();

/*
UserSchema.index({ credentialHash : 1 })            // 토큰 인증 시
UserSchema.index({ "credential.localId": 1 })       // ID로 로그인 시
UserSchema.index({ "credential.fbId": 1 })          // 페이스북으로 로그인 시

mongoose.model('User', UserSchema, 'users');
*/

var userCollection = db.collection('users');

export class UserModel {
  _id: string;
  private credential : {
    localId?: string,
    localPw?: string,
    fbName?: string,
    fbId?: string,
    tempDate?: number,
    tempSeed?: number
  };
  private credentialHash : string;
  isAdmin: boolean;
  private regDate: Date;
  notificationCheckedAt: Date;
  email: string;
  fcmKey: string;
  active: boolean;
  lastLoginTimestamp: number;

  constructor(plain: Object) {
    Object.assign(this, plain);
  }

  verifyPassword(password: string): Promise<boolean> {
    let originalHash = this.credential.localPw;
    if (!password || !originalHash) return Promise.resolve(false);
    return new Promise(function(resolve, reject) {
      bcrypt.compare(password, originalHash, function(err, same) {
        if (err) return reject(err);
        resolve(same);
      });
    });
  }

  getCredentialHash():string {
    return this.credentialHash;
  }

  private signCredential() {
    var hmac = crypto.createHmac('sha256', config.secretKey);
    hmac.update(JSON.stringify(this.credential));
    this.credentialHash = hmac.digest('hex');
  }

  private async saveCredential():Promise<void> {
    this.signCredential();
    await userCollection.update(
      {_id:this._id},
      { $set: {credential: this.credential, credentialHash: this.credentialHash}});
  }

  compareCredentialHash(hash: string):boolean {
    return this.credentialHash == hash;
  }

  async updateNotificationCheckDate(): Promise<void> {
    this.notificationCheckedAt = new Date();
    await userCollection.update(
      {_id:this._id},
      { $set: {notificationCheckedAt: this.notificationCheckedAt}});
  }

  static async assertLocalPassword(password:string): Promise<void> {
    if (!password ||
      !password.match(/^(?=.*\d)(?=.*[a-z])\S{6,20}$/i))
      return Promise.reject(errcode.INVALID_PASSWORD);
  }

  private async setPasswordHash(password: string) {
    let passwordHash = await new Promise<string>(function(resolve, reject) {
      bcrypt.hash(password, 4, function(err, encrypted) {
        if (err) return reject(err);
        resolve(encrypted);
      });
    });
    this.credential.localPw = passwordHash;
  }
  
  async changeLocalPassword(password:string): Promise<void> {
    await UserModel.assertLocalPassword(password);
    await this.setPasswordHash(password);
    await this.saveCredential();
  }

  hasFb():boolean {
    return this.credential.fbId !== null;
  }

  attachFb(fbName:string, fbId:string):Promise<void> {
    if (!fbId) {
      var err = errcode.NO_FB_ID_OR_TOKEN;
      return Promise.reject(err);
    }
    this.credential.fbName = fbName;
    this.credential.fbId = fbId;
    return this.saveCredential();
  }

  detachFb():Promise<void> {
    if (!this.credential.localId) {
      var err = errcode.NOT_LOCAL_ACCOUNT;
      return Promise.reject(err);
    }
    this.credential.fbName = null;
    this.credential.fbId = null;
    return this.saveCredential();
  };

  hasLocal():boolean {
    return !(this.credential.localId === null || this.credential.localId == undefined);
  }

  static async assertLocalId(id: string): Promise<void> {
    if (!id || !id.match(/^[a-z0-9]{4,32}$/i)) {
      throw errcode.INVALID_ID;
    }

    if (await UserModel.getByLocalId(id)) {
      throw errcode.DUPLICATE_ID;
    }
  }

  async attachLocal(id:string, password:string):Promise<void> {
    await UserModel.assertLocalId(id);
    this.credential.localId = id;
    await this.changeLocalPassword(password);
  }

  getUserInfo() {
    return {
      isAdmin: this.isAdmin,
      regDate: this.regDate,
      notificationCheckedAt: this.notificationCheckedAt,
      email: this.email,
      local_id: this.credential.localId,
      fb_name: this.credential.fbName
    }
  }

  getFbName() {
    return this.credential.fbName;
  }

  async deactivate() {
    this.active = false;
    await userCollection.update(
      {_id:this._id},
      { $set: {active: this.active}});
  }

  async setUserInfo(email: string): Promise<void> {
    this.email = email;
    await userCollection.update(
      {_id:this._id},
      { $set: {email: this.email}});
  }

  async refreshFcmKey(registration_id:string): Promise<void> {
    var keyName = "user-"+this._id;
    var keyValue: string;

    try {
      keyValue = await fcm.getNotiKey(keyName);
    } catch (err) {
      keyValue = await fcm.createNotiKey(keyName, [registration_id]);
    }

    if (!keyValue) throw "refreshFcmKey failed";

    this.fcmKey = keyValue;
    await userCollection.update(
      {_id:this._id},
      { $set: {fcmKey: this.fcmKey}});
  }

  /*
  * create_device
  * Add this registration_id for the user
  * and add topic
  */
  async attachDevice(registration_id:string): Promise<void> {
    if (!this.fcmKey) await this.refreshFcmKey(registration_id);

    let keyName = "user-"+this._id;
    try {
      await fcm.addDevice(keyName, this.fcmKey, [registration_id]);
    } catch (err) {
      await this.refreshFcmKey(registration_id);
      await fcm.addDevice(keyName, this.fcmKey, [registration_id]);
    }

    await fcm.addTopic(registration_id);
  }

  async detachDevice(registration_id:string): Promise<void> {
    if (!this.fcmKey) await this.refreshFcmKey(registration_id);
    
    let keyName = "user-"+this._id;
    try {
      await fcm.removeDevice(keyName, this.fcmKey, [registration_id]);
    } catch (err) {
      await this.refreshFcmKey(registration_id);
      await fcm.removeDevice(keyName, this.fcmKey, [registration_id]);
    }

    await fcm.removeTopicBatch([registration_id]);
  }

  async sendFcmMsg(title:string, body: string, author: string, cause: string) {
    if (!this.fcmKey) throw errcode.USER_HAS_NO_FCM_KEY;
    let destination = this.fcmKey;
    let response = await fcm.sendMsg(destination, title, body);
    await FcmLogModel.write(this._id, author, title + '\n' + body, cause, response);
    return response;
  }

  getRegDate(): Date {
    return this.regDate;
  }

  private async createDefaultTimetable(): Promise<TimetableModel> {
    let userId = this._id;
    let coursebook = await CourseBookModel.getRecent();
    var semesterString = (['1', 'S', '2', 'W'])[coursebook.semester-1];
    return await TimetableModel.createFromParam({
        user_id : userId,
        year : coursebook.year,
        semester : coursebook.semester,
        title : coursebook.year + "-" + semesterString});
  }

  updateLastLoginTimestamp(): void {
    let timestamp = Date.now();
    this.lastLoginTimestamp = timestamp;
    // 토큰 인증 시 매번 save하므로 기다리면 안됨
    // Mongoose 말고 raw mongodb로 접근해야함. 안 하면 transactino 때문에 순서가 꼬임
    userCollection.update({_id:this._id}, { $set: {lastLoginTimestamp: timestamp}});
  }

  static async sendGlobalFcmMsg(title:string, body: string, author: string, cause: string) {
    let destination = "/topics/global";
    let response = await fcm.sendMsg(destination, title, body);
    await FcmLogModel.write("global", author, title + '\n' + body, cause, response);
    return response;
  }

  static getUserFromCredentialHash(hash:string) : Promise<UserModel> {
    if (!hash) {
      return Promise.reject(errcode.SERVER_FAULT);
    } else {
      return userCollection.findOne({
        'credentialHash' : hash,
        'active' : true
      }).then(function(document) {
        if (document === null) return null;
        return Promise.resolve(new UserModel(document));
      });
    }
  }

  static getByMongooseId(mid:string) : Promise<UserModel> {
    return userCollection.findOne({'_id' : mid, 'active' : true })
    .then(function(document){
      if (document === null) return null;
      return Promise.resolve(new UserModel(document));
    });
  }

  static getByLocalId(id:string) : Promise<UserModel> {
    return userCollection.findOne({'credential.localId' : id, 'active' : true })
    .then(function(document){
      if (document === null) return null;
      return Promise.resolve(new UserModel(document));
    });
  }

  static async createLocal(id:string, password:string) : Promise<UserModel> {
    await UserModel.assertLocalId(id);
    await UserModel.assertLocalPassword(password);
    let user: UserModel = new UserModel(
      {
        credential: {
          localId: id
        },
        regDate: new Date,
        lastLoginTimestamp: Date.now(),
        active: true
      }
    );
    await user.setPasswordHash(password);
    user.signCredential();
    let result = await userCollection.insertOne(user);
    user._id = <any>result.insertedId;
    await user.createDefaultTimetable();
    return user;
  }

  static async createFb(name:string, id:string): Promise<UserModel> {
    if (!id) {
      var err = errcode.NO_FB_ID_OR_TOKEN;
      return Promise.reject(err);
    }
    let user: UserModel = new UserModel(
      {
        credential: {
          fbName: name,
          fbId: id
        },
        regDate: new Date,
        lastLoginTimestamp: Date.now(),
        active: true
      }
    );
    user.signCredential();
    let result = await userCollection.insertOne(user);
    user._id = <any>result.insertedId;
    await user.createDefaultTimetable();
    return user;
  }

  static async createTemp() : Promise<UserModel> {
    let user: UserModel = new UserModel(
      {
        credential: {
          tempDate: Date.now(),
          tempSeed: Math.floor(Math.random() * 1000)
        },
        regDate: new Date,
        lastLoginTimestamp: Date.now(),
        active: true
      }
    );
    user.signCredential();
    let result = await userCollection.insertOne(user);
    user._id = <any>result.insertedId;
    await user.createDefaultTimetable();
    return user;
  }
  
  static async getByFb(name:string, id:string) : Promise<UserModel> {
    let document = await userCollection.findOne({'credential.fbId' : id, 'active' : true });
    if (document === null) return null;
    return new UserModel(document);
  }

  static async getFbOrCreate(name:string, id:string) : Promise<UserModel> {
    let user = await UserModel.getByFb(name, id);
    if (user) return user;
    else return UserModel.createFb(name, id);
  }
}
