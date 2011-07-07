#!/usr/bin/env node

var createNode = require('./init').createNode;

var node = createNode({ welcome: true });
node.start();
