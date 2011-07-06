var net = require('net');

var Peer = function (host, port) {
  if ("string" === typeof host) {
    if (host.indexOf(':') && !port) {
      var parts = host.split(':');
      host = parts[0];
      port = parts[1];
    }
    this.host = host;
    this.port = port ? +port : 8333;
  } else if (host instanceof Peer) {
    this.host = host.host;
    this.port = host.port;
  } else {
    logger.warn('Could not instantiate peer, invalid parameter type: ' +
                typeof host);
  }
};

Peer.prototype.createConnection = function () {
  var c = net.createConnection(this.port, this.host);
  return c;
};

Peer.prototype.toString = function () {
  return this.host + ":" + this.port;
};

exports.Peer = Peer;
