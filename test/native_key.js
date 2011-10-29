var vows = require('vows'),
    assert = require('assert');

var ccmodule = require('../native');
var BitcoinKey = ccmodule.BitcoinKey;
var Util = require('../lib/util');
var encodeHex = Util.encodeHex;
var decodeHex = Util.decodeHex;

vows.describe('BitcoinKey').addBatch({
  'A generated key': {
    topic: function () {
      return BitcoinKey.generateSync();
    },

    'is a BitcoinKey': function (topic) {
      assert.instanceOf(topic, BitcoinKey);
    },

    'has a valid public key': {
      topic: function (topic) {
        return topic.public;
      },

      'that is a Buffer': function (topic) {
        assert.isTrue(Buffer.isBuffer(topic, Buffer));
      },

      'that is 65 bytes long': function (topic) {
        assert.equal(topic.length, 65);
      },

      'that begins with a 0x04 byte': function (topic) {
        assert.equal(topic[0], 4);
      }
    },

    'has a valid private key': {
      topic: function (topic) {
        return topic.private;
      },

      'that is a Buffer': function (topic) {
        assert.isTrue(Buffer.isBuffer(topic, Buffer));
      },

      'that is 32 bytes long': function (topic) {
        assert.equal(topic.length, 32);
      },

      'that correctly reimports': function (topic) {
        var newKey = new BitcoinKey();
        newKey.private = topic;
        assert.equal(encodeHex(topic),
                     encodeHex(newKey.private));
      }
    },

    'has a DER encoding': {
      topic: function (topic) {
        return topic.toDER();
      },

      'that is a Buffer': function (topic) {
        assert.isTrue(Buffer.isBuffer(topic, Buffer));
      },

      'that is 279 bytes long': function (topic) {
        assert.equal(topic.length, 279);
      }
    },

    'can regenerate its public key': function (topic) {
      var pubkeyBefore = topic.public;

      // We'll overwrite the public key with some other one, so we can be sure
      // that it as actually been regenerated.
      topic.public = decodeHex("0478314155256b51105268fd1ef12f63a6deb4ac7955489cd023f6e0137f0e3889c54f533d3212d9d65636825f11b2d1e0a0da20504b010370008c7c8a945333be");

      topic.regenerateSync();

      assert.equal(encodeHex(topic.public),
                   encodeHex(pubkeyBefore));
    }
  },

  'A predefined key': {
    topic: function () {
      var key = new BitcoinKey();
      key.private = decodeHex("59441e38964bafc959c730a86ba4deee5bdd3674a1a4dff7a2a3bff04a5e5929");
      key.public = decodeHex("04b7c931bb4947c1964455cb7dd0d2e28c6bafcac1a2e8cb9d6970634ac2313e2a4a054d90936dce1bd4663ccf2dcec8f49ff8733bb0815e2b90e6dff173ff00ba");
      return key;
    },

    'is a BitcoinKey': function (topic)
    {
      assert.instanceOf(topic, BitcoinKey);
    }
  },

  'A predefined public key': {
    topic: function () {
      var key = new BitcoinKey();
      key.public = decodeHex("04a19c1f07c7a0868d86dbb37510305843cc730eb3bea8a99d92131f44950cecd923788419bfef2f635fad621d753f30d4b4b63b29da44b4f3d92db974537ad5a4");
      return key;
    },

    'is a BitcoinKey': function (topic)
    {
      assert.instanceOf(topic, BitcoinKey);
    },

    'correctly verifies a signature synchronously': function (topic)
    {
      assert.isTrue(topic.verifySignatureSync(decodeHex("230aba77ccde46bb17fcb0295a92c0cc42a6ea9f439aaadeb0094625f49e6ed8"), decodeHex("3046022100a3ee5408f0003d8ef00ff2e0537f54ba09771626ff70dca1f01296b05c510e85022100d4dc70a5bb50685b65833a97e536909a6951dd247a2fdbde6688c33ba6d6407501")));
    },

    'verifying a signature asynchronously': {
      topic: function (topic) {
        topic.verifySignature(decodeHex("230aba77ccde46bb17fcb0295a92c0cc42a6ea9f439aaadeb0094625f49e6ed8"), decodeHex("3046022100a3ee5408f0003d8ef00ff2e0537f54ba09771626ff70dca1f01296b05c510e85022100d4dc70a5bb50685b65833a97e536909a6951dd247a2fdbde6688c33ba6d6407501"), this.callback);
      },

      'returns true': function (topic) {
        assert.isTrue(topic);
      }
    }
  }
}).export(module);

