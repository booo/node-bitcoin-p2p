var sys = require('sys');
var net = require('net');
var logger = require('./logger');
var Peer = require('./peer').Peer;
var Connection = require('./connection').Connection;

var PeerManager = exports.PeerManager = function (node) {
  events.EventEmitter.call(this);

  this.node = node;
  this.enabled = false;
  this.timer = null;

  this.peers = [];
  this.forcePeers = [];
  this.connections = [];
  this.isConnected = false;
  this.connectAutoConn = null;
  this.peerDiscovery = true;

  // Move these to the Node's settings object
  this.interval = 5000;
  this.minConnections = 8;
  this.minKnownPeers = 10;
};

sys.inherits(PeerManager, events.EventEmitter);

PeerManager.prototype.enable = function ()
{
  this.enabled = true;

  var initialPeers = this.node.cfg.network.initialPeers;
  var forcePeers = this.node.cfg.network.initialPeers;
  var bootstrap = this.node.cfg.network.bootstrap;

  if (this.node.cfg.network.connect === "auto") {
    // Connect auto mode, try to connect to localhost:8333 and if that doesn't
    // work fall back to bootstrapping.

    logger.info('Trying to detect local Bitcoin node (connect="auto")');

    var localPeer = new Peer('localhost', this.node.cfg.network.port);
    this.addPeer(localPeer);
    var localConn = this.connectTo(localPeer);
    if (localConn) {
      localConn.once('verack', function verackHandler() {
        // Once we have made a successful connection once, we will enter
        // full-on proxy node mode and connect only to the local peer.
        this.connectAutoConn = false;
        this.bootstrap = [];
        this.peers = [localPeer];
        this.peerDiscovery = false;
      }.bind(this));

      this.connectAutoConn = localConn;
    } else {
      // Could not create local connection, nothing to do, we'll fallback to
      // the standard peer-to-peer mode with bootstrapping.
    }

  } else if (this.node.cfg.network.connect === "p2p") {
    // P2P is the default, do nothing
  } else if (this.node.cfg.network.connect === "none") {
    initialPeers = [];
    bootstrap = [];
    this.peerDiscovery = false;
  } else if ("string" === typeof this.node.cfg.network.connect) {
    initialPeers = [this.node.cfg.network.connect];
    bootstrap = [];
    this.peerDiscovery = false;
  } else if (Array.isArray(this.node.cfg.network.connect)) {
    initialPeers = this.node.cfg.network.connect;
    bootstrap = [];
    this.peerDiscovery = false;
  }

  initialPeers.forEach(function (peer) {
    if ("string" !== typeof peer) {
      throw new Error("PeerManager.enable(): Invalid configuration for initial"
                      + "peers.");
    }
    this.addPeer(peer);
  }.bind(this));
  this.bootstrap = bootstrap;

  this.forcePeers = forcePeers.map(function (peer) {
    if ("string" !== typeof peer) {
      throw new Error("PeerManager.enable(): Invalid configuration for initial"
                      + "peers.");
    }
    return new Peer(peer);
  });

  // Listen to incoming connections
  if (!this.node.cfg.network.noListen) {
    logger.info('Listening for Bitcoin connections on port '+
                this.node.cfg.network.port);
    try {
      this.server = net.createServer(function (socketConn) {
        this.addConnection(socketConn, new Peer(socketConn.remoteAddress));
      }.bind(this));
      this.server.listen(this.node.cfg.network.port);
    } catch (e) {
      logger.warn("Could not start Bitcoin server");
      logger.warn("Reason: "+e.message);
    }
  }

  if (!this.timer) {
    this.pingStatus();
  }
};

PeerManager.prototype.disable = function ()
{
  this.enabled = false;
};

PeerManager.prototype.addPeer = function (peer, port) {
  if (peer instanceof Peer) {
    this.peers.push(peer);
  } else if ("string" == typeof peer) {
    this.addPeer(new Peer(peer, port));
  } else {
    logger.log('error', 'Node.addPeer(): Invalid value provided for peer',
               {val: peer});
    throw 'Node.addPeer(): Invalid value provided for peer.';
  }
};

PeerManager.prototype.pingStatus = function pingStatus()
{
  if (!this.enabled) {
    return;
  }

  this.checkStatus();

  this.timer = setTimeout(this.pingStatus.bind(this), this.interval);
};

PeerManager.prototype.checkStatus = function checkStatus()
{
  // Make sure we are connected to all forcePeers
  if (this.forcePeers.length) {
    var forcePeerIndex = {};
    this.forcePeers.forEach(function (peer) {
      forcePeerIndex[peer.toString()] = peer;
    });

    // Ignore the ones we're already connected to
    this.connections.forEach(function (conn) {
      var peerName = conn.peer.toString();
      if ("undefined" !== forcePeerIndex[peerName]) {
        delete forcePeerIndex[peerName];
      }
    });

    Object.keys(forcePeerIndex).forEach(function (i) {
      this.connectTo(forcePeerIndex[i]);
    }.bind(this));
  }

  // If this flag is set it means we're still trying the local peer.
  if (this.connectAutoConn) {
    if (this.connections.indexOf(this.connectAutoConn) != -1) {
      // Connection hasn't failed or closed, we'll keep going
      return;
    } else {
      this.connectAutoConn = null;
    }
  }

  var i;
  if (this.peers.length < this.minKnownPeers) {
    var bootstrap = this.bootstrap;
    for (i = 0; i < bootstrap.length; i++) {
      if ("function" == typeof bootstrap[i].bootstrap) {
        bootstrap[i].bootstrap(this.node, this);
      }
    }
  }

  // Find peers that we think are valid, but aren't connected to
  var connectablePeers = [];
  outerloop:
  for (i = 0; i < this.peers.length; i++) {
    for (var j = 0; j < this.connections.length; j++) {
      if (this.connections[j].peer == this.peers[i]) {
        continue outerloop;
      }
    }
    connectablePeers.push(this.peers[i]);
  }

  while (this.connections.length < this.minConnections &&
         connectablePeers.length) {
    var peer = connectablePeers.splice(Math.random()*connectablePeers.length, 1);

    this.connectTo(peer[0]);
  }
};

PeerManager.prototype.connectTo = function (peer)
{
  logger.info('Connecting to peer '+peer);

  try {
    this.addConnection(peer.createConnection(), peer);
  } catch (e) {
    logger.error('Error creating connection',e);
    return null;
  }
};

PeerManager.prototype.addConnection = function (socketConn, peer) {
  var conn = new Connection(this.node, socketConn, peer);
  this.connections.push(conn);
  this.node.addConnection(conn);

  conn.addListener('version', this.handleVersion.bind(this));
  conn.addListener('verack', this.handleReady.bind(this));
  conn.addListener('addr', this.handleAddr.bind(this));
  conn.addListener('getaddr', this.handleGetAddr.bind(this));
  conn.addListener('error', this.handleError.bind(this));
  conn.addListener('disconnect', this.handleDisconnect.bind(this));

  return conn;
};

PeerManager.prototype.handleVersion = function (e) {
  if (!e.conn.inbound) {
    // TODO: Advertise our address (if listening)
  }
  // Get recent addresses
  if (this.peerDiscovery &&
      (e.message.version >= 31402 || this.peers.length < 1000)) {
    e.conn.sendGetAddr();
    e.conn.getaddr = true;
  }
};

PeerManager.prototype.handleReady = function (e) {
  this.emit('connect', {
    pm: this,
    conn: e.conn,
    socket: e.socket,
    peer: e.peer
  });

  if (this.isConnected == false) {
    this.emit('netConnected');

    this.isConnected = true;
  }
};

PeerManager.prototype.handleAddr = function (e) {
  if (!this.peerDiscovery) {
    return;
  }

  var now = this.node.getAdjustedTime();
  e.message.addrs.forEach(function (addr) {
    try {
      // In case of an invalid time, assume "5 days ago"
      if (addr.time <= 100000000 || addr.time > (now + 10 * 60)) {
        addr.time = now - 5 * 24 * 60 * 60;
      }
      var peer = new Peer(addr.ip, addr.port, addr.services);
      peer.lastSeen = addr.time;

      // TODO: Handle duplicate peers
      this.peers.push(peer);

      // TODO: Handle addr relay
    } catch(e) {
      logger.warn("Invalid addr received: "+e.message);
    }
  }.bind(this));
  if (e.message.addrs.length < 1000 ) {
    e.conn.getaddr = false;
  }
};

PeerManager.prototype.handleGetAddr = function (e) {
  // TODO: Reply with addr message.
};

PeerManager.prototype.handleError = function (e) {
  this.handleDisconnect.apply(this, [].slice.call(arguments));
};

PeerManager.prototype.handleDisconnect = function (e) {
  logger.info('Disconnected from peer '+e.peer);
  var i = this.connections.indexOf(e.conn);
  if (i != -1) {
    this.connections.splice(i, 1);
  }

  if (this.connectAutoConn) {
    logger.info('No local proxy, connecting to network instead (connect="auto")');
    this.connectAutoConn = null;
    this.peers = [];
    this.pingStatus();
  }

  if (!this.connections.length) {
    this.emit('netDisconnected');

    this.isConnected = false;
  }
};

PeerManager.prototype.getActiveConnection = function () {
  var activeConnections = this.connections.filter(function (conn) {
    return conn.active;
  });

  if (activeConnections.length) {
    var randomIndex = Math.floor(Math.random()*activeConnections.length);
    var candidate = activeConnections[randomIndex];
    if (candidate.socket.writable) {
      return candidate;
    } else {
      // Socket is not writable, remove it from active connections
      activeConnections.splice(randomIndex, 1);

      // Then try again
      // TODO: This causes an infinite recursion when all connections are dead,
      //       although it shouldn't.
      return this.getActiveConnection();
    }
  } else {
    return null;
  }
};

PeerManager.prototype.getActiveConnections = function () {
  return this.connections.slice(0);
};
