var BlockLocator = exports.BlockLocator = function () {
};

BlockLocator.createFromBlockChain = function (blockChain, callback) {
  var height = blockChain.getTopBlock().height;
  var step = 1;
  var heights = [];
  while (height > 0) {
    heights.push(height);
    if (heights.length > 10) {
      step *= 2;
    }
    height -= step;
  }
  blockChain.storage.getBlocksByHeights(heights, function (err, result) {
    if (err) {
      callback(err);
      return;
    }

    if (!result) {
      callback(new Error('Failed to construct BlockLocator:'
                         + ' Requested blocks not found.'));
      return;
    }

    var locator = result.map(function (v) {
      return v.getHash();
    }).reverse();

    callback(null, locator);
  });
};
