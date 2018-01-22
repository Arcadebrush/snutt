import mongoose = require('mongoose');
import config = require('../config');
import bcrypt = require('bcrypt');
import crypto = require('crypto');
import errcode = require('../errcode');
import {TimetableModel} from './timetable';
import {courseBookService} from '../courseBook';
import {writeFcmLog} from './fcmLog';
import * as log4js from 'log4js';
import * as fcm from '../fcm';
var logger = log4js.getLogger();

let UserSchema = new mongoose.Schema({
  credential : {
    localId: {type: String, default: null},
    localPw: {type: String, default: null},
    fbName: {type: String, default: null},
    fbId: {type: String, default: null},

    // 위 항목이 없어도 unique credentialHash을 생성할 수 있도록
    tempDate: {type: Date, default: null},          // 임시 가입 날짜
    tempSeed: {type: Number, default: null}         // 랜덤 seed
  },
  credentialHash : {type: String, default: null},   // credential이 변경될 때 마다 SHA 해싱 (model/user.ts 참조)
  isAdmin: {type: Boolean, default: false},         // admin 항목 접근 권한
  regDate: Date,                                    // 회원가입 날짜
  lastLoginTimestamp: Number,                       // routes/api/api.ts의 토큰 인증에서 업데이트
  notificationCheckedAt: Date,                      // 새로운 알림이 있는지 확인하는 용도
  email: String,
  fcmKey: String,                                   // Firebase Message Key

  // if the user remove its account, active status becomes false
  // Should not remove user object, because we must preserve the user data and its related objects
  active: {type: Boolean, default: true}
});

UserSchema.index({ credentialHash : 1 })            // 토큰 인증 시
UserSchema.index({ "credential.localId": 1 })       // ID로 로그인 시
UserSchema.index({ "credential.fbId": 1 })          // 페이스북으로 로그인 시

let MongooseUserModel = mongoose.model('User', UserSchema ,'users');

export class UserModel {
  _id: string;
  private credential : {
    localId?: string,
    localPw?: string,
    fbName?: string,
    fbId?: string,
    tempDate?: Date,
    tempSeed?: number
  };
  private credentialHash : string;
  isAdmin: boolean;
  private regDate: Date;
  private notificationCheckedAt: Date;
  email: string;
  fcmKey: string;
  active: boolean;
  lastLoginTimestamp: number;

  mongooseDocument: mongoose.Document;

  constructor(mongooseDocument:mongoose.Document) {
    if (mongooseDocument === null) {
      logger.error("UserModel: mongoose document is null");
      throw "mongoose document is null";
    }
    let wrapper = <any>mongooseDocument;
    this._id = wrapper._id;
    this.credential = wrapper.credential;
    this.credentialHash = wrapper.credentialHash;
    this.isAdmin = wrapper.isAdmin;
    this.regDate = wrapper.regDate;
    this.notificationCheckedAt = wrapper.notificationCheckedAt;
    this.email = wrapper.email;
    this.fcmKey = wrapper.fcmKey;
    this.active = wrapper.active;
    this.lastLoginTimestamp = wrapper.lastLoginTimestamp;

    this.mongooseDocument = mongooseDocument;
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

  private async saveCredential():Promise<void> {
    var hmac = crypto.createHmac('sha256', config.secretKey);
    hmac.update(JSON.stringify(this.credential));
    this.credentialHash = hmac.digest('hex');
    (<any>this.mongooseDocument).credential = this.credential;
    (<any>this.mongooseDocument).credentialHash = this.credentialHash;
    this.mongooseDocument = await this.mongooseDocument.save();
  }

  compareCredentialHash(hash: string):boolean {
    return this.credentialHash == hash;
  }

  async updateNotificationCheckDate(): Promise<void> {
    this.notificationCheckedAt = new Date();
    (<any>this.mongooseDocument).notificationCheckedAt = this.notificationCheckedAt;
    this.mongooseDocument = await this.mongooseDocument.save();
  }
  
  async changeLocalPassword(password:string): Promise<void> {
    if (!password ||
      !password.match(/^(?=.*\d)(?=.*[a-z])\S{6,20}$/i))
      return Promise.reject(errcode.INVALID_PASSWORD);

    let passwordHash = await new Promise<string>(function(resolve, reject) {
      bcrypt.hash(password, 4, function(err, encrypted) {
        if (err) return reject(err);
        resolve(encrypted);
      });
    });
    this.credential.localPw = passwordHash;
    this.saveCredential();
  }

  hasFb():boolean {
    return !(this.credential.fbId === null || this.credential.fbId === undefined );
  }

  attachFb(fbName:string, fbId:string):Promise<void> {
    if (!fbId) {
      var err = errcode.NO_FB_ID_OR_TOKEN;
      return Promise.reject(err);
    }
    this.credential.fbName = fbName;
    this.credential.fbId = fbId;
    console.log(this.credential.fbId);
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
    return this.credential.localId !== null;
  }

  async attachLocal(id:string, password:string):Promise<void> {
    if (!id || !id.match(/^[a-z0-9]{4,32}$/i)) {
      throw errcode.INVALID_ID;
    }

    if (await UserModel.getByLocalId(id)) {
      throw errcode.DUPLICATE_ID;
    }

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
    (<any>this.mongooseDocument).active = this.active;
    this.mongooseDocument = await this.mongooseDocument.save();
  }

  async setUserInfo(email: string): Promise<void> {
    this.email = email;
    (<any>this.mongooseDocument).email = this.email;
    this.mongooseDocument = await this.mongooseDocument.save();
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
    (<any>this.mongooseDocument).fcmKey = this.fcmKey;
    this.mongooseDocument = await this.mongooseDocument.save();
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
    await writeFcmLog(this._id, author, title + '\n' + body, cause, response);
    return response;
  }

  getRegDate(): Date {
    return this.regDate;
  }

  private async createDefaultTimetable(): Promise<TimetableModel> {
    let userId = this._id;
    let coursebook = await courseBookService.getRecent();
    return await TimetableModel.createFromParam({
        user_id : userId,
        year : coursebook.year,
        semester : coursebook.semester,
        title : "나의 시간표"});
  }

  updateLastLoginTimestamp(): void {
    let timestamp = Date.now();
    // Mongoose를 사용하면 성능이 저하되므로, raw mongodb를 사용한다.
    mongoose.connection.db.collection('users').updateOne({_id: this._id}, {$set: {lastLoginTimestamp: timestamp}})
    .catch(function(err){
      logger.error("UserModel.updateLastLoginTimestamp: Failed to update timestamp");
      logger.error(err);
    });
    this.lastLoginTimestamp = timestamp;
  }

  static async sendGlobalFcmMsg(title:string, body: string, author: string, cause: string) {
    let destination = "/topics/global";
    let response = await fcm.sendMsg(destination, title, body);
    await writeFcmLog("global", author, title + '\n' + body, cause, response);
    return response;
  }

  static getUserFromCredentialHash(hash:string) : Promise<UserModel> {
    if (!hash) {
      return Promise.reject(errcode.SERVER_FAULT);
    } else {
      return mongoose.model('User').findOne({
        'credentialHash' : hash,
        'active' : true
      }).exec().then(function(mongooseDocument) {
        if (mongooseDocument === null) return null;
        return Promise.resolve(new UserModel(mongooseDocument));
      });
    }
  }

  static getByMongooseId(mid:string) : Promise<UserModel> {
    return MongooseUserModel.findOne({'_id' : mid, 'active' : true })
    .exec().then(function(userDocument){
      if (userDocument === null) return null;
      return Promise.resolve(new UserModel(userDocument));
    });
  }

  static getByLocalId(id:string) : Promise<UserModel> {
    return MongooseUserModel.findOne({'credential.localId' : id, 'active' : true })
    .exec().then(function(userDocument){
      if (userDocument === null) return null;
      return Promise.resolve(new UserModel(userDocument));
    });
  }

  private static async create(): Promise<UserModel> {
    let mongooseDocument = new MongooseUserModel({regDate: new Date, lastLoginTimestamp: Date.now()});
    let user = new UserModel(mongooseDocument);
    await user.createDefaultTimetable();
    return user;
  }

  static async createLocal(id:string, password:string) : Promise<UserModel> {
    let user = await this.create();
    await user.attachLocal(id, password);
    return user;
  }
  
  static async getByFb(name:string, id:string) : Promise<UserModel> {
    let mongooseDocument = await MongooseUserModel.findOne({'credential.fbId' : id, 'active' : true }).exec();
    if (mongooseDocument === null) return null;
    return new UserModel(mongooseDocument);
  }

  static async createFb(name:string, id:string): Promise<UserModel> {
    let user = await this.create();
    await user.attachFb(name, id);
    return user;
  }

  static async getFbOrCreate(name:string, id:string) : Promise<UserModel> {
    let user = await UserModel.getByFb(name, id);
    if (user) return user;
    else return UserModel.createFb(name, id);
  }

  static async createTemp() : Promise<UserModel> {
    let user = await this.create();
    user.credential = {
      tempDate: new Date(),
      tempSeed: Math.floor(Math.random() * 1000)
    }
    await user.saveCredential();
    return user;
  }
}
