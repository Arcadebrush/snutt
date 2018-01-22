/**
 * test/api/etc.ts
 * various tests
 * supertest: https://github.com/visionmedia/supertest
 * mocha: http://mochajs.org/#usage
 */
import assert = require('assert');
import errcode = require('core/errcode');

export = function(app, db, request) {
  it('Color lists', function(done) {
    request.get('/colors/vivid_ios')
      .expect(200)
      .end(function(err, res){
        if (err) return done(err);
        var colors = res.body.colors;
        var names = res.body.names;
        if (!colors[0].fg || !colors[0].bg)
            return done("No colors");
        if (!names[0])
          return done("No color names");
        done(err);
      });
  });
}