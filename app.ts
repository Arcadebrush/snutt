/**
 * HTTP 서버를 실행하는
 * 메인 엔트리
 */

import express = require("express");
import db = require('./db');
import morgan = require("morgan");
import cookieParser = require("cookie-parser");
import bodyParser = require("body-parser");
import path = require("path");
import cors = require("cors");

import routes = require('./routes/routes');
import http = require('http');
import fs = require('fs');
import config = require('./config/config');
import * as log4js from 'log4js';
import {getLogFilePath} from './log/log';
var logger = log4js.getLogger();

if (process.env.NODE_ENV !== 'mocha') {
  log4js.configure({
    appenders: { 
      'stderr': { type : 'stderr' },
      'file' : { type : 'file',
          filename: getLogFilePath('api.log'),
          layout: { type: "basic" },
          maxLogSize: 20480,
          backups: 10 }
    },
    categories: {
      default: { appenders: [ 'stderr', 'file' ], level: 'info' }
    }
  });
} else {
  log4js.configure({
    appenders: { 
      'stderr': { type : 'stderr' }
    },
    categories: {
      default: { appenders: [ 'stderr' ], level: 'info' }
    }
  });
}

var app = express();


// view engine setup
//app.set('views', path.join(__dirname, 'views'));
//app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
if (process.env.NODE_ENV !== 'mocha')
  app.use(morgan('tiny'));
// Only for development
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/asset', express.static('asset'));
app.use('/', routes);
app.engine('.html', require('ejs').renderFile);
app.set('views', './views')

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development' ||
  app.get('env') === 'mocha') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.send({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send({
    message: err.message,
    error: {}
  });
});
var debug = require('debug')('snutt:server');

/**
 * Get port from environment and store in Express.
 */

var port = normalizePort(config.port || '3000');
var host = config.host || 'localhost';
app.set('port', port);
app.set('host', host);

if (process.env.NODE_ENV != 'mocha') {
    var server = createServer();
}


/**
 * Create server.
 */
function createServer(): http.Server {
  var protocol = "http";
  var server = http.createServer(app);
  server.listen(port, host, function() {
    logger.info("Server listening on http://" + host + ":" + port);
  });
  server.on('error', onError);
  server.on('listening', onListening);
  return server;
}

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      logger.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

export = app;
