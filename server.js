//  Sigma.io

//  (c) 2013 Davy Duperron
//  Server side

"use strict";

//  Main app
var Sigma = {},
    express = require('express');

//  Main dependencies
Sigma.app = express();
Sigma.server = require('http').createServer(Sigma.app);
Sigma.io = require('socket.io').listen(Sigma.server);
Sigma.mongo = require('mongodb').MongoClient;
Sigma.crypto = require('crypto');

//  Internal dependencies
Sigma.routes = require('./modules/routes.js');
Sigma.database = require('./modules/database.js');

//  Set teplate engine to jade and set public folder
Sigma.app.set('view engine', 'jade');
Sigma.app.use('/public', express.static('public'));

//  Use Gzip in express
Sigma.app.use(express.compress());

//  Socket.io settings
Sigma.io.enable('browser client minification');
//Sigma.io.enable('browser client gzip');
Sigma.io.set('log level', 1);

//  Utils
Sigma.getHash = function(data) {
  var hash = Sigma.crypto.createHash('md5').update(data).digest('hex');
  return hash;
};

//  Create an empty channel during app init
Sigma.id = "";

//  Init routes
Sigma.routes.init(Sigma);

//  Init database connection
Sigma.database.init(Sigma);

//  Set listening port
Sigma.server.listen(1337);

//  Socket.io
Sigma.io.sockets.on('connection', function (socket) {

  //  Join route as room
  socket.join(Sigma.id);

  //  Find articles for that channel
  Sigma.database.collection('articles')
    .find({ 'channel': Sigma.id })
    .sort('date')
    .limit(9)
    .toArray(function (error, documents) {
      if (error) {
        socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
      } else {
        if (documents.length === 0) {
          socket.emit('history', { empty: true });
        } else {
          socket.emit('history', { empty: false, documents: documents });
        }
      }
    });

  //  Send current id to client
  socket.emit('id', { data: Sigma.id });

  //  If client is sending data
  socket.on(Sigma.id, function (data) {
    switch (data.action) {
      //  Create new content
      case 'create':
        Sigma.database.collection('articles').insert(
          { 'html': data.html, 'owner': data.owner, 'channel': Sigma.id, 'date': new Date()},
          { safe: true},
          function (error, document) {
            if (error) {
              socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
            } else {
              //  Broadcast changes to channel
              socket.broadcast.to(Sigma.id).emit('broadcast', { action: 'create', html: data.html, id: document[0]._id });
              //  Send new content id's to client
              socket.emit('mongoId', { tempId: data.mongoId, id: document[0]._id, type: 'article' });
              //  Send save state
              socket.emit('saveState', { tempId: data.mongoId, id: document[0]._id, state: true });
            }
          });
        break;
      //  Update content
      case 'update':
        //  Broadcast changes to channel
        socket.broadcast.to(Sigma.id).emit('broadcast', { action: 'update', html: data.html, id: data.mongoId });
        //  Update content
        Sigma.database.collection('articles').update(
          { '_id': new Sigma.objectId(data.mongoId)},
          { $set: { 'html': data.html}},
          { safe: true},
          function (error) {
            if (error) {
              socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
            } else {
              //  Send save state
              socket.emit('saveState', { id: data.mongoId, state: true });
            }
          });
        break;
      //  Delete content
      case 'delete':
        Sigma.database.collection('articles').remove(
          { '_id': new Sigma.objectId(data.mongoId)},
          function (error) {
            if (error) {
              socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
            } else {
              //  Broadcast changes to channel
              socket.broadcast.to(Sigma.id).emit('broadcast', { action: 'delete', id: data.mongoId });
            }
          });
        break;
    }
  });

  //  If a user is trying to sign in
  socket.on('signIn', function (data) {
    Sigma.database.collection('users').findOne(
      { 'username': data.username },
      function (error, document) {
      if (error) {
        socket.emit('socketMessage', { message: 'Something is going wrong with your connection!', type: false });
      } else {
        if (document) {
          if (document.password === data.password) {
            //  If username & password are ok
            socket.emit('isConnected', { username: data.username });
          } else {
            socket.emit('socketMessage', { message: 'Wrong password!', type: false });
          }
        } else {
          // Offer to create new user
          socket.emit('signUp', { username: data.username });
        }
      } 
    });
  });

  //  If a user is trying to sign up
  socket.on('signUp', function (data) {
    //  Save user
    Sigma.database.collection('users').insert(
      { 'username': data.username, 'password': data.password},
      { safe: true},
      function (error) {
        if (error) {
          socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
        } else {
          //  Then connect user
          socket.emit('isConnected', { username: data.username });
        }
      });
  });

  //  If a client want to store an image
  socket.on('storeImage', function (data) {
    //  Slice and decode dataURL
    var dataURL = new Buffer(data.src),
        source = dataURL.toString('utf8', 22);
    Sigma.database.collection('images').insert(
      { 'source': source},
      { safe: true},
      function (error, document) {
        if (error) {
          socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
        } else {
          //  Send new content id's to client
          socket.emit('mongoId', { tempId: data.tempId, id: document[0]._id, type: 'image' });
        }
      });
  });

  //  If a client want to delete an image
  socket.on('deleteImage', function (data) {
    var ids = data.ids,
        returnIds = ids,
        removeImage = function (id) {
          Sigma.database.collection('images').remove(
            { '_id': new Sigma.objectId(id)},
            function (error) {
              if (error) {
                socket.emit('socketMessage', { message: 'Something goes wrong server-side!', type: false });
              } else {
                //  Remove id from the array to be sent to the client
                returnIds.splice(returnIds.indexOf(id), 1);
                // Update the original array on client
                socket.emit('updateImageArray', { array: returnIds });
              }
            });
        };
    ids.forEach(function (id) {
      removeImage(id);
    });
  });

});
