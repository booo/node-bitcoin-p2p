var Worker = require('webworker').Worker;
var Util = require('../util.js');
var path = require('path');

var NONCE_POS = 76;

var JavaScriptMiner = exports.JavaScriptMiner = function JavaScriptMiner() {
	var self = this;
};

JavaScriptMiner.prototype.solve = function (header, target, callback) {
	var nonce = 0;
	process.nextTick(function () {
		try {
			header[NONCE_POS  ] = nonce        & 0xff;
			header[NONCE_POS+1] = nonce >>>  8 & 0xff;
			header[NONCE_POS+2] = nonce >>> 16 & 0xff;
			header[NONCE_POS+3] = nonce >>> 24 & 0xff;

			var hash = Util.twoSha256(header);

			hash.reverse();

			if (hash.compare(target) < 0) {
				callback(null, nonce);
				return;
			}

			nonce++;

			process.nextTick(arguments.callee);
		} catch (e) {
			callback(e);
		}
	});
};
