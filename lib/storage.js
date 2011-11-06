var Storage = exports.Storage = function Storage()
{

};

Storage.get = function (uri)
{
  var Storage;
  var storageProtocol = ""+uri.match(/^[a-z]+/i);
  switch (storageProtocol) {
  case 'mongodb':
    Storage = require('./db/mongo/storage').Storage;
    return new Storage(uri);

  case 'kyoto':
    Storage = require('./db/kyoto/storage').Storage;
    return new Storage(uri);

  default:
    throw new Error('Unknown storage protocol "'+storageProtocol+'"');
    return;
  }
};
