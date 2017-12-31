import { MongoClient, Db, Collection,
  MongoCountPreferences, CollectionOptions,
  DeleteWriteOpResultObject, FindOneOptions, ReplaceOneOptions, WriteOpResult, CollectionInsertOneOptions, InsertOneWriteOpResult, FindAndModifyWriteOpResultObject, FindOneAndReplaceOption, Cursor, InsertWriteOpResult, CollectionInsertManyOptions } from 'mongodb';
import config = require('./config/config');
import * as log4js from 'log4js';
var logger = log4js.getLogger();

async function getMongoDb(): Promise<Db> {
  let db: Db = await MongoClient.connect(config.mongoUri);
  if (process.env.NODE_ENV == 'mocha') {
    db = db.db(config.mongoTestDbName);
  } else {
    db = db.db(config.mongoDbName);
  }

  /**
   * DB 버전이 2.4 이상인지 확인
   * 서치 쿼리에서 사용하는 로직이 2.4 이사zz이어야만 함
   */
  var info = await db.admin().buildInfo();
  logger.info("MongoDB "+info.version+" connected");
  if (parseFloat(info.version) < 2.4) {
    logger.warn("MongoDB version is outdated. (< 2.4) Service might not work properly");
  }

  db["info"] = info;

  return db;
}

/**
 *  Mongo DB native driver는 async하게 초기화할 수 밖에 없음.
 *  편의를 위해 wrapper를 작성, synchronous하게 초기화하도록 함.
 */

class MongoDb {
  rawDb: Promise<Db>;

  constructor() {
    this.rawDb = getMongoDb();
  }

  async buildInfo(): Promise<any> {
    return (await this.rawDb)["info"];
  }

  dropDatabase(): Promise<any> {
    return this.rawDb.then(function(db) {
      return db.dropDatabase();
    });
  }

  collection(name: string): MongoCollection {
    return new MongoCollection(this.rawDb, name);
  }
}

class MongoCollection {
  rawDb: Promise<Db>;
  rawCollection: Collection;
  name: string;

  constructor (rawDb: Promise<Db>, name: string) {
    this.rawDb = rawDb;
    this.name = name;
    this.rawCollection = null;
  }

  async count(query, options?: MongoCountPreferences): Promise<number> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.count(query, options);
  }

  async deleteMany(query, options?: CollectionOptions): Promise<DeleteWriteOpResultObject> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.deleteMany(query, options);
  }

  async find(query?, options?: any): Promise<any[]> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return this.rawCollection.find(query, options).toArray();
  }

  async findOne(query, options?: FindOneOptions): Promise<any> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.findOne(query, options);
  }

  async findOneAndUpdate(query, update, options?: FindOneAndReplaceOption): Promise<FindAndModifyWriteOpResultObject> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.findOneAndUpdate(query, update, options);
  }

  async findOneAndDelete(query, options?: { projection?: Object, sort?: Object, maxTimeMS?: number }): Promise<FindAndModifyWriteOpResultObject> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.findOneAndDelete(query, options);
  }

  async update(query, update, options?: ReplaceOneOptions & { multi?: boolean }): Promise<WriteOpResult> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.update(query, update, options);
  }

  async insertOne(docs, options?: CollectionInsertOneOptions): Promise<InsertOneWriteOpResult> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.insertOne(docs, options);
  }

  async insertMany(docs, options?: CollectionInsertManyOptions): Promise<InsertWriteOpResult> {
    if (this.rawCollection === null) this.rawCollection = (await this.rawDb).collection(this.name);
    return await this.rawCollection.insertMany(docs, options);
  }
}

export = new MongoDb();
