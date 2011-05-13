var logger = require('./logger');
var Util = require('./util');
var Binary = require('binary');
var Opcode = require('./opcode').Opcode;
var Put = require('binary').put;

// Make opcodes available as pseudo-constants
for (var i in Opcode.map) {
	eval(i + " = " + Opcode.map[i] + ";"); //FIXME dirty hack ;)
}


var Script = exports.Script = function Script(buffer) {
	if (buffer) {
		this.buffer = buffer;
	} else {
		this.buffer = new Buffer(0);
	}

	this.chunks = [];

	this.parse();
};

Script.prototype.parse = function () {
	this.chunks = [];

	var parser = Binary.parse(this.buffer);
	while (!parser.eof()) {
		var opcode = parser.word8('opcode').vars.opcode;
		if (opcode >= 0xF0) {
			// Two byte opcode
			opcode = (opcode << 8) | parser.word8('opcode2').vars.opcode2;
		}

		if (opcode > 0 && opcode < OP_PUSHDATA1) {
			// Read some bytes of data, opcode value is the length of data
			this.chunks.push(parser.buffer('data', opcode).vars.data);
		} else if (opcode == OP_PUSHDATA1) {
			parser.word8('len');
			this.chunks.push(parser.buffer('data', 'len').vars.data);
		} else if (opcode == OP_PUSHDATA2) {
			parser.word16le('len');
			this.chunks.push(parser.buffer('data', 'len').vars.data);
		} else if (opcode == OP_PUSHDATA4) {
			parser.word32le('len');
			this.chunks.push(parser.buffer('data', 'len').vars.data);
		} else {
			this.chunks.push(opcode);
		}
	}
};

Script.prototype.isSentToIP = function ()
{
	if (this.chunks.length != 2) {
		return false;
	}
	return this.chunks[1] == OP_CHECKSIG && this.chunks[0] instanceof Buffer;
};

Script.prototype.getOutType = function ()
{
	if (this.chunks.length == 5 &&
		this.chunks[0] == OP_DUP &&
		this.chunks[1] == OP_HASH160 &&
		this.chunks[3] == OP_EQUALVERIFY &&
		this.chunks[4] == OP_CHECKSIG) {

		// Transfer to Bitcoin address
		return 'Address';
	} else if (this.chunks.length == 2 &&
		this.chunks[1] == OP_CHECKSIG) {

		// Transfer to IP address
		return 'Pubkey';
	} else {
		return 'Strange';
	}
};

Script.prototype.simpleOutPubKeyHash = function ()
{
	switch (this.getOutType()) {
	case 'Address':
		return this.chunks[2];
	case 'Pubkey':
		return Util.sha256ripe160(this.chunks[0]);
	default:
		logger.info("Encountered non-standard scriptPubKey");
		logger.debug("Strange script was:" + this.toString());
		return null;
	}
};

Script.prototype.getInType = function ()
{
	if (this.chunks.length == 1) {
        // Direct IP to IP transactions only have the public key in their scriptSig.
		return 'Pubkey';
	} else if (this.chunks.length == 2 &&
			   this.chunks[0] instanceof Buffer &&
			   this.chunks[1] instanceof Buffer) {
		return 'Address';
	} else {
		return 'Strange';
	}
};

Script.prototype.simpleInPubKey = function ()
{
	switch (this.getInType()) {
	case 'Address':
		return this.chunks[1];
	case 'Pubkey':
		return this.chunks[0];
	default:
		logger.info("Encountered non-standard scriptSig");
		logger.debug("Strange script was:" + this.toString());
		return null;
	}
};

Script.prototype.getBuffer = function ()
{
	return this.buffer;
};

Script.prototype.getStringContent = function (truncate)
{
	if (truncate === null) {
		truncate = true;
	}

	var script = '';
	this.chunks.forEach(function (chunk, i) {
		script += " ";

		if (chunk instanceof Buffer) {
			script += Util.formatBuffer(chunk, truncate ? null : 0);
		} else {
			script += Opcode.reverseMap[chunk];
		}
	});
	return script;
};

Script.prototype.toString = function (truncate)
{
	var script = "<Script";
	script += this.getStringContent(truncate);
	script += ">";
	return script;
};

Script.verify = function (scriptSig, scriptPubKey, txTo, n, hashType) {
	// TODO: Implement

	// Create stack
	var stack = [];

	// DUMMY
	stack.unshift(true);

	// Evaluate scriptSig
	//scriptSig.eval(stack, txTo, n, hashType);

	// Evaluate scriptPubKey
	//scriptPubKey.eval(stack, txTo, n, hashType);

	// Check stack
	//if (stack.length == 0)
	//	throw new Error("Empty stack after script evaluation");

	return !!stack.shift();
};


Script.prototype.writeOp = function (opcode)
{
	var buf = Put();
	buf.put(this.buffer);
	buf.word8(opcode);
	this.buffer = buf.buffer();

	this.chunks.push(opcode);
};

Script.prototype.writeBytes = function (data)
{
	var buf = Put();
	buf.put(this.buffer);
	if (data.length < OP_PUSHDATA1) {
		buf.word8(data.length);
	} else if (data.length <= 0xff) {
		buf.word8(OP_PUSHDATA1);
		buf.word8(data.length);
	} else if (data.length <= 0xffff) {
		buf.word8(OP_PUSHDATA2);
		buf.word16le(data.length);
	} else {
		buf.word8(OP_PUSHDATA4);
		buf.word32le(data.length);
	}
	buf.put(data);
	this.buffer = buf.buffer();
	this.chunks.push(data);
};

/**
 * Creates a simple OP_CHECKSIG with pubkey output script.
 *
 * These are used for coinbase transactions and at some point were used for
 * IP-based transactions as well.
 */
Script.createPubKeyOut = function (pubkey) {
	var script = new Script();
	script.writeBytes(pubkey);
	script.writeOp(OP_CHECKSIG);
	return script;
};

/**
 * Creates a standard txout script.
 */
Script.createPubKeyHashOut = function (pubKeyHash) {
	var script = new Script();
	script.writeOp(OP_DUP);
	script.writeOp(OP_HASH160);
	script.writeBytes(pubKeyHash);
	script.writeOp(OP_EQUALVERIFY);
	script.writeOp(OP_CHECKSIG);
	return script;
};
