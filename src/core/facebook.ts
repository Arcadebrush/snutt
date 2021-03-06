/**
 * 아이디 혹은 페이스북을 이용한 로그인
 * 토큰을 콜백함수로 반환
 * 
 * @author Jang Ryeol, ryeolj5911@gmail.com
 */

import request = require('request');
import errcode = require('./errcode');
import * as log4js from 'log4js';
var logger = log4js.getLogger();

export function getFbInfo(fbId, fbToken): Promise<{fbName:string, fbId:string}> {
  if (process.env.NODE_ENV == 'mocha') {
    if (fbToken == 'correct' && fbId == "1234") return Promise.resolve({fbName: "John", fbId: "1234"});
    if (fbToken == 'correct2' && fbId == "12345") return Promise.resolve({fbName: "Smith", fbId: "12345"});
    return Promise.reject(errcode.WRONG_FB_TOKEN);
  }

  return new Promise(function(resolve, reject) {
    request({
      url: "https://graph.facebook.com/me",
      method: "GET",
      json: true,
      qs: {access_token: fbToken}
    }, function (err, res, body){
      if (err || res.statusCode != 200 || !body || !body.id || fbId !== body.id) {
        return reject(errcode.WRONG_FB_TOKEN);
      } else {
        return resolve({fbName: body.name, fbId: body.id});
      }
    });
  });
}
