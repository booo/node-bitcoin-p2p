#!/usr/bin/env node

var profiler = require('../../v8-profiler/v8-profiler');

var Storage = require('../lib/storage').Storage;
var Settings = require('../lib/settings').Settings;
var BlockChain = require('../lib/blockchain').BlockChain;
var Util = require('../lib/util');
var Miner = require('../lib/miner/javascript.js').JavaScriptMiner;

var settings = new Settings();
var storage = new Storage('mongodb://localhost/bitcointest');

var CHAIN_LENGTH = 1000;

settings.setUnitnetDefaults();

var benchmarkTimer;
var chain;

storage.emptyDatabase(function (err, result) {
	if (err) {
		callback(err);
		return;
	}

	chain = new BlockChain(storage, settings);
	chain.on('initComplete', function (err) {
		if (err) {
			callback(err);
			return;
		}

		// We'll calculate the duration from here.
		benchmarkTimer = (new Date).getTime();
		//profiler.startProfiling('genChain');

		createBlock(chain.getTopBlock());
	});
	chain.init();
});

function createBlock(block) {
	var fakeBeneficiary = new Buffer(65).clear();
	fakeBeneficiary[0] = 0x04;
	for (var i = 1, l = fakeBeneficiary.length; i < l; i++) {
		fakeBeneficiary[i] = Math.floor(Math.random()*256);
	}

	block.mineNextBlock(
		fakeBeneficiary,
		Math.floor(new Date().getTime() / 1000),
		new Miner(),
		handleMiningResult
	);

	block = null;
};

function handleMiningResult(err, newBlock, txs) {
	if (err) {
		console.log(err.stack ? err.stack : err);
		return;
	}

	chain.add(newBlock, txs, handleChainAddResult);
};

function handleChainAddResult(err, result) {
	if (err) {
		console.log(err);
		return;
	}

	if (result.height < CHAIN_LENGTH) {
		process.nextTick(createBlock.bind(null, result));
	} else {
		var util = require('util');
		//console.log(util.inspect(result.__proto__, true, null, true));
		printResult();
	}
};

function printResult() {
	var duration = (new Date).getTime() - benchmarkTimer;
	var memory = process.memoryUsage();

	//profiler.stopProfiling('genChain');
	profiler.takeSnapshot('finalHeap');

	console.log("Generated "+CHAIN_LENGTH+" blocks in " + duration + "ms");
	console.log("Memory usage: "+memory.vsize);

	//debugger;
	process.exit(0);
};
