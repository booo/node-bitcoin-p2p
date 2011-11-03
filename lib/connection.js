var util = require('util');
var events = require('events');
var Buffers = require('buffers');
var logger = require('./logger');
var Binary = require('./binary');
var Parser = require('./parser').Parser;
var Util = require('./util');

Buffers.prototype.skip = function (i) {
  if (i === 0) return;
  if (i < 0 || i > this.length) throw new Error('oob');

  var l = i, bi = 0, bu = null;
  for (;;) {
    bu = this.buffers[bi];
    if (l <= bu.length) {
      this.buffers = this.buffers.slice(bi);
      bu.length -= l;
      bu.offset += l;
      this.length -= i;
      return;
    } else {
      l -= bu.length;
    }
    bi++;
  }
};

var Connection = exports.Connection = function Connection(node, socket, peer) {
  events.EventEmitter.call(this);

  this.node = node;
  this.socket = socket;
  this.peer = peer;

  // A connection is considered "active" once we have received verack
  this.active = false;
  // The version incoming packages are interpreted as
  this.recvVer = 0;
  // The version outgoing packages are sent as
  this.sendVer = 0;
  // The (claimed) height of the remote peer's block chain
  this.bestHeight = 0;
  // Is this an inbound connection?
  this.inbound = !!socket.server;
  // Have we sent a getaddr on this connection?
  this.getaddr = false;

  // Receive buffer
  this.buffers = new Buffers();

  // Starting 20 Feb 2012, Version 0.2 is obsolete
  // This is the same behavior as the official client
  if (new Date().getTime() > 1329696000000) {
    this.recvVer = 209;
    this.sendVer = 209;
  }

  this.setupHandlers();
};

util.inherits(Connection, events.EventEmitter);

Connection.prototype.setupHandlers = function () {
  this.socket.addListener('connect', this.handleConnect.bind(this));
  this.socket.addListener('error', this.handleError.bind(this));
  this.socket.addListener('end', this.handleDisconnect.bind(this));
  this.socket.addListener('data', (function (data) {
    var dumpLen = 35;
    logger.netdbg('['+this.peer+'] '+
                  'Recieved '+data.length+' bytes of data:');
    logger.netdbg('... '+ data.slice(0, dumpLen > data.length ?
                                     data.length : dumpLen).toHex() +
                  (data.length > dumpLen ? '...' : ''));
  }).bind(this));
  this.socket.addListener('data', this.handleData.bind(this));
};

Connection.prototype.handleConnect = function () {
  this.sendVersion();
  this.emit('connect', {
    conn: this,
    socket: this.socket,
    peer: this.peer
  });
};

Connection.prototype.handleError = function (err) {
  if (err.errno == 111) { // ECONNREFUSED
    logger.info('Connection refused for '+this.peer);
  } else {
    logger.warn(err);
  }
  this.emit('error', {
    conn: this,
    socket: this.socket,
    peer: this.peer,
    err: err
  });
};

Connection.prototype.handleDisconnect = function () {
  this.emit('disconnect', {
    conn: this,
    socket: this.socket,
    peer: this.peer
  });
};

Connection.prototype.handleMessage = function (message) {
  if (!message) {
    // Parser was unable to make sense of the message, drop it
    return;
  }

  try {
    switch (message.command) {
    case 'version':
      // Did we connect to ourself?
      if (this.node.nonce.compare(message.nonce) === 0) {
        this.socket.end();
        return;
      }

      if (message.version >= 209) {
        this.sendMessage('verack', new Buffer([]));
      }
      this.sendVer = Math.min(message.version, this.node.version);
      if (message.version < 209) {
        this.recvVer = Math.min(message.version, this.node.version);
      } else {
        // We won't start expecting a checksum until after we've received
        // the "verack" message.
        this.once('verack', (function () {
          this.recvVer = message.version;
        }).bind(this));
      }
      this.bestHeight = message.start_height;
      break;

    case 'verack':
      this.recvVer = Math.min(message.version, this.node.version);
      this.active = true;
    }

    this.emit(message.command, {
      conn: this,
      socket: this.socket,
      peer: this.peer,
      message: message
    });
  } catch (e) {
    logger.error('Error while handling message '+message.command+' from ' +
                 this.peer + ':\n' +
                 (e.stack ? e.stack : e.toString()));
  }
};

Connection.prototype.sendVersion = function () {
  var put = Binary.put();
  put.word32le(this.node.version); // version
  put.word64le(1); // services
  put.word64le(Math.round(new Date().getTime()/1000)); // timestamp
  put.pad(26); // addr_me
  put.pad(26); // addr_you
  put.put(this.node.nonce);
  put.word8(0);
  put.word32le(10);

  this.sendMessage('version', put.buffer());
};

Connection.prototype.sendGetBlocks = function (starts, stop) {
  var put = Binary.put();
  put.word32le(this.sendVer);

  put.varint(starts.length);
  for (var i = 0; i < starts.length; i++) {
    if (starts[i].length != 32) {
      throw new Error('Invalid hash length');
    }

    put.put(starts[i]);
  }

  var stopBuffer = new Buffer(stop, 'binary');
  if (stopBuffer.length != 32) {
    throw new Error('Invalid hash length');
  }

  put.put(stopBuffer);

  this.sendMessage('getblocks', put.buffer());
};

Connection.prototype.sendGetData = function (invs) {
  var put = Binary.put();

  put.varint(invs.length);
  for (var i = 0; i < invs.length; i++) {
    put.word32le(invs[i].type);
    put.put(invs[i].hash);
  }

  this.sendMessage('getdata', put.buffer());
};

Connection.prototype.sendGetAddr = function (invs) {
  var put = Binary.put();

  this.sendMessage('getaddr', put.buffer());
};

Connection.prototype.sendInv = function (data) {
  if (!Array.isArray(data)) {
    data = [data];
  }

  var put = Binary.put();

  put.varint(data.length);
  data.forEach(function (value) {
    if (value.collection.name == 'blocks') {
      // Block
      put.word32le(2); // MSG_BLOCK
    } else {
      // Transaction
      put.word32le(1); // MSG_TX
    }
    put.put(value.getHash());
  });

  this.sendMessage('inv', put.buffer());
};

Connection.prototype.sendTx = function (tx) {
  this.sendMessage('tx', tx.serialize());
};

Connection.prototype.sendBlock = function (block, txs) {
  var put = Binary.put();

  // Block header
  put.put(block.getHeader());

  // List of transactions
  put.varint(txs.length);
  txs.forEach(function (tx) {
    put.put(tx.serialize());
  });

  this.sendMessage('block', put.buffer());
};

Connection.prototype.sendMessage = function (command, payload) {
  try {
    var magic = this.node.cfg.network.magicBytes;

    var commandBuf = new Buffer(command, 'ascii');
    if (commandBuf.length > 12) {
      throw 'Command name too long';
    }

    var checksum;
    if (this.sendVer >= 209) {
      checksum = Util.twoSha256(payload).slice(0, 4);
    } else {
      checksum = new Buffer([]);
    }

    var message = Binary.put();           // -- HEADER --
    message.put(magic);                   // magic bytes
    message.put(commandBuf);              // command name
    message.pad(12 - commandBuf.length);  // zero-padded
    message.word32le(payload.length);     // payload length
    message.put(checksum);                // checksum
    // -- BODY --
    message.put(payload);                 // payload data

    var buffer = message.buffer();

    logger.netdbg('['+this.peer+'] '+
                  "Sending message "+command+" ("+payload.length+" bytes)");

    this.socket.write(buffer);
  } catch (err) {
    // TODO: We should catch this error one level higher in order to better
    //       determine how to react to it. For now though, ignoring it will do.
    logger.error("Error while sending message to peer "+this.peer+": "+
                 (err.stack ? err.stack : err.toString()));
  }
};

Connection.prototype.handleData = function (data) {
  this.buffers.push(data);

  if (this.buffers.length > (this.node.cfg.maxReceiveBuffer * 1000)) {
    logger.error("Peer "+this.peer+" exceeded maxreceivebuffer, disconnecting."+
                 (err.stack ? err.stack : err.toString()));
    this.socket.destroy();
    return;
  }

  this.processData();
};

Connection.prototype.processData = function () {
  // If there are less than 20 bytes there can't be a message yet.
  if (this.buffers.length < 20) return;

  var magic = this.node.cfg.network.magicBytes;
  var i = 0;
  for (;;) {
    if (this.buffers.get(i  ) === magic[0] &&
        this.buffers.get(i+1) === magic[1] &&
        this.buffers.get(i+2) === magic[2] &&
        this.buffers.get(i+3) === magic[3]) {
      if (i !== 0) {
        logger.netdbg('['+this.peer+'] '+
                      'Received '+i+
                      ' bytes of inter-message garbage: ');
        logger.netdbg('... '+this.buffers.slice(0,i));

        this.buffers.skip(i);
      }
      break;
    }

    if (i > (this.buffers.length - 4)) {
      this.buffers.skip(i);
      return;
    }
    i++;
  }

  var payloadLen = (this.buffers.get(16)      ) +
                   (this.buffers.get(17) <<  8) +
                   (this.buffers.get(18) << 16) +
                   (this.buffers.get(19) << 24);

  var startPos = (this.recvVer >= 209) ? 24 : 20;
  var endPos = startPos + payloadLen;

  if (this.buffers.length < endPos) return;

  var command = this.buffers.slice(4, 16).toString('ascii').replace(/\0+$/,"");
  var payload = this.buffers.slice(startPos, endPos);
  var checksum = (this.recvVer >= 209) ? this.buffers.slice(20, 24) : null;

  logger.netdbg('['+this.peer+'] ' +
                "Received message " + command +
                " (" + payloadLen + " bytes)");

  if (checksum !== null) {
    var checksumConfirm = Util.twoSha256(payload).slice(0, 4);
    if (checksumConfirm.compare(checksum) !== 0) {
      logger.error('['+this.peer+'] '+
                   'Checksum failed',
                   { cmd: command,
                     expected: Util.encodeHex(checksumConfirm),
                     actual: Util.encodeHex(checksum) });
      return;
    }
  }

  var message;
  try {
    message = Connection.parseMessage(command, payload);
  } catch (e) {
    logger.error('Error while parsing message '+command+' from ' +
                 this.peer + ':\n' +
                 (e.stack ? e.stack : e.toString()));
  }

  if (message) {
    this.handleMessage(message);
  }

  this.buffers.skip(endPos);
  this.processData();
};

Connection.parseMessage = function (command, payload) {
  var parser = new Parser(payload);

  var data = {
    command: command
  };

  var i;

  switch (command) {
  case 'version': // https://en.bitcoin.it/wiki/Protocol_specification#version
    data.version = parser.word32le();
    data.services = parser.word64le();
    data.timestamp = parser.word64le();
    data.addr_me = parser.buffer(26);
    data.addr_you = parser.buffer(26);
    data.nonce = parser.buffer(8);
    data.sub_version_num = parser.scan(0);
    data.start_height = parser.word32le();
    break;

  case 'inv':
  case 'getdata':
    data.count = Connection.parseVarInt(parser);

    data.invs = [];
    for (i = 0; i < data.count; i++) {
      data.invs.push({
        type: parser.word32le(),
        hash: parser.buffer(32)
      });
    }
    break;

  case 'block':
    data.version = parser.word32le();
    data.prev_hash = parser.buffer(32);
    data.merkle_root = parser.buffer(32);
    data.timestamp = parser.word32le();
    data.bits = parser.word32le();
    data.nonce = parser.word32le();

    var txCount = Connection.parseVarInt(parser);

    data.txs = [];
    for (i = 0; i < txCount; i++) {
      data.txs.push(Connection.parseTx(parser));
    }

    data.size = payload.length;
    break;

  case 'tx':
    var txData = Connection.parseTx(parser);
    return {
      command: command,
      version: txData.version,
      lock_time: txData.lock_time,
      ins: txData.ins,
      outs: txData.outs
    };

  case 'getblocks':
    // TODO: Limit block locator size?
    // TODO: version field?
    var startCount = Connection.parseVarInt(parser);

    data.starts = [];
    for (i = 0; i < startCount; i++) {
      data.starts.push(parser.buffer(32));
    }
    data.stop = parser.buffer(32);
    break;

  case 'addr':
    var addrCount = Connection.parseVarInt(parser);

    // Enforce a maximum number of addresses per message
    if (addrCount > 1000) {
      addrCount = 1000;
    }

    data.addrs = [];
    for (i = 0; i < addrCount; i++) {
      // TODO: Time actually depends on the version of the other peer (>=31402)
      data.addrs.push({
        time: parser.word32le(),
        services: parser.word64le(),
        ip: parser.buffer(16),
        port: parser.word16be()
      });
    }
    break;

  case 'getaddr':
  case 'verack':
  case 'ping':
    // Empty message, nothing to parse
    break;

  default:
    logger.error('Connection.parseMessage(): Command not implemented',
                 {cmd: command});

    // This tells the calling function not to issue an event
    return null;
  }

  return data;
};

Connection.parseVarInt = function (parser)
{
  var firstByte = parser.word8();
  switch (firstByte) {
  case 0xFD:
    return parser.word16le();

  case 0xFE:
    return parser.word32le();

  case 0xFF:
    return parser.word64le();

  default:
    return firstByte;
  }
};


Connection.parseTx = function (parser) {
  if (Buffer.isBuffer(parser)) {
    parser = new Parser(parser);
  }

  var data = {}, i, sLen;

  data.version = parser.word32le();
  
  var txinCount = Connection.parseVarInt(parser, 'tx_in_count');

  data.ins = [];
  for (j = 0; j < txinCount; j++) {
    var txin = {};
    txin.o = parser.buffer(36);               // outpoint
    sLen = Connection.parseVarInt(parser);    // script_len
    txin.s = parser.buffer(sLen);             // script
    txin.q = parser.word32le();               // sequence
    data.ins.push(txin);
  }

  var txoutCount = Connection.parseVarInt(parser);

  data.outs = [];
  for (j = 0; j < txoutCount; j++) {
    var txout = {};
    txout.v = parser.buffer(8);               // value
    sLen = Connection.parseVarInt(parser);    // script_len
    txout.s = parser.buffer(sLen);            // script
    data.outs.push(txout);
  }

  data.lock_time = parser.word32le();

  return data;
};
