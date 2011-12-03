//   fanout.js
//
//   A fanout messaging server for node.js
//   by @jazzychad - Chad Etzel
//
//   + some modifications to be the default
//     messaging system for SparkleShare
//
//   MIT Licensed

// Usage: subscribe <channel>
//        unsubscribe <channel>
//        announce <channel> <message>
//        ping

var tcp = require("net");

function Client(connection, me) {
  this.socket = connection;
  this.channels = [];
  this.listeners = [];
  this.msgEmitter = me;
}

// adds channel. must use "subscribe" to take effect
Client.prototype.addChannel = function(channel) {
  this.removeChannel(channel);
  this.channels.push(channel);
  this.subscribe();
};

// removes channel. also removes associated listener immediately
Client.prototype.removeChannel = function(channel) {
  // remove channel if it exists
  for (var i = 0; i < this.channels.length; i++) {
    if(channel == this.channels[i]) {
      this.channels.splice(i, 1);
    }
  }
  
  // remove listener
  var listener = this.listeners[channel];
  if (listener) {
    this.msgEmitter.removeListener(channel, listener);
  }

  this.subscribe();
};

Client.prototype.subscribe = function() {
  var client = this;
  this.channels.forEach(function(channel) {
    var listener = client.listeners[channel];
          
    if (listener) {
      client.msgEmitter.removeListener(channel, listener);
    }
  });

  this.listeners = [];

  this.channels.forEach(function(channel) {
    var listener = function(c, msg) {
      client.socket.write(c + "!" + msg + "\n");
    };

    client.listeners[channel] = listener;
    client.msgEmitter.addListener(channel, listener);
  });
};

Client.prototype.deconstruct = function() {
  var client = this;
  this.channels.forEach(function(channel) {
    var listener = client.listeners[channel];
    if (listener) {
      client.msgEmitter.removeListener(channel, listener);
    }
  });
};

function Fanout() {
  this.connections = [];
  this.msgEmitter = new process.EventEmitter();
}

Fanout.prototype.removeConnection = function(connection) {
  for(var i = 0; i < this.connections.length; i++) {
    if(connection == this.connections[i]) {
      this.connections.splice(i, 1);
    }
  }
};

Fanout.prototype.handleMessage = function(connection, socket, data) {
  if (data == "ping") {
    socket.write(Date.now() + "\n");

  } else if (data.indexOf("subscribe ") === 0) {
    connection.addChannel(data.split(' ')[1]);

  } else if (data.indexOf("unsubscribe ") === 0) {
    connection.removeChannel(data.split(' ')[1]);

  } else if (data.indexOf("announce ") === 0) {
    data = data.substring(9);
    var pos = data.indexOf(' ');
    var channel = data.slice(0, pos);
    var msg = data.slice(pos + 1);
    this.msgEmitter.emit(channel, channel, msg);
  }
};


Fanout.prototype.listen = function(port, host, next) {
  var fa = this;
  var server = tcp.createServer(function(socket) {
    var connection = new Client(socket, fa.msgEmitter);
      fa.connections.push(connection);

      socket.setNoDelay();
      socket.setEncoding("utf8");

      connection.addChannel("all");

      socket.addListener("data", function(data) {
        var dataArr = data.split(/\r\n|\r|\n/);
        dataArr.slice(0, -1).forEach(function(line){
          fa.handleMessage(connection, socket, line);
        });
      });
      
      socket.addListener("end", function() {
        // unsubscribe from all here (remove all listeners)
        connection.deconstruct();
        fa.removeConnection(connection);
        connection = null;
      });
  });

  server.listen(port, host, next);
};

module.exports.listen = function(port, host, next) {
  var fa = new Fanout();
  fa.listen(port, host, next);
};
