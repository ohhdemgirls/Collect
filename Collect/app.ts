﻿import debug = require('debug');
import express = require('express');
import path = require('path');
import io = require('socket.io');
import fs = require('fs');
import auth = require('http-auth');
const user_file: string = "users.json";

var bodyParser = require('body-parser')
var app = express()

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

var users = JSON.parse(fs.readFileSync(user_file).toString());

var basic = auth.basic({
    realm: "Web."
}, function (username, password, callback) { // Custom authentication method.
    callback(users.some(item => item.username === username && item.password === password));
});


import views from './routes/views';
import api from './routes/api_v1';
import site from './routes/sites';
import details from './routes/details';

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use('/', views);
app.use('/details/', details);
app.use('/site/', site);
app.use('/api/v1/', api);


app.use(express.static(path.join(__dirname, 'public')));

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err['status'] = 404;
    next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.locals.pretty = true;
    app.use((err: any, req, res, next) => {
        res.status(err['status'] || 500);
        if (err['api'] || false) {
            delete err.api;
            res.json(err);
        } else {
            res.render('error', {
                message: err.message,
                error: err
            });
        }
    });
}

// production error handler
// no stacktraces leaked to user
app.use((err: any, req, res, next) => {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

var port = app.get('port') || 3000;
console.log("Server listening on port " + port);
var server = app.listen(port);

//Set variables
var io = require('socket.io')(server);
app.set('socketio', io);

global["notif_count"] = 0;

//Socket.io response
io.sockets.on('connection', function (socket) {
    socket.emit('notifcount', global["notif_count"])
});