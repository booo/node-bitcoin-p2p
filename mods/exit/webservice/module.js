var extend = require('extend');
var Webservice = require('./webservice').Webservice;
var Schema = require('./schema').Schema;

var Module = exports.Module = function () {};

Module.define = function (customOptions) {
  var options = extend({}, Module.defaultOptions, customOptions);

  var module = function (customOptions) {
    customOptions = customOptions || {};
    customOptions = this.schema.apply(customOptions);

    this.options = extend({}, Module.defaultConstructOptions, customOptions);

    if ("function" == typeof options.construct) {
      options.construct.call(this, this.options);
    }

    for (var i in Module.obj) {
      module[i] = Module.obj[i];
    }
  };
  module.prototype = new Module();
  module.prototype.options = options;
  module.prototype.methods = {};
  module.prototype.schema = new Schema(options.schema);

  for (var i in Module.obj) {
    module[i] = Module.obj[i];
  }

  return module;
};

// Defaults for Module.define()
Module.defaultOptions = {
  constructor: function () {}
};

// Defaults for MyModule.method()
Module.defaultMethodOptions = {
  // Default webservice handler
  webHandler: function (method, params, req, res, callback) {
    method.handler.call(this, params, callback);
  },

  // Default handler for calling from node
  nodeHandler: function (method, params, callback) {
    if ("function" != typeof callback) {
      // We guarantee that the callback is defined, so if we didn't get
      // one, we need to create a dummy.
      callback = function (err, result) {};
    }
    method.handler.call(this, params, callback);
  },

  // Default generic handler
  handler: function (params, callback) {
    // We assume that it's only the generic handler that's not defined, i.e.
    // specific handlers are defined, so we give an error message that
    // complains about the type of request.
    callback.error({
      type: 'BadRequest',
      message: 'This access method is not supported for this API call.'
    });
  }
};

// Defaults for "new MyModule()" parameter object
Module.defaultConstructOptions = {
};

// Defaults for for myMod.attach(app, options)
Module.defaultAttachOptions = {
  prefix: '/'
};

Module.obj = {};

Module.obj.method = function (name, options) {
  var method = extend({}, Module.defaultMethodOptions, options);

  method.name = name;

  if (!(method.schema instanceof Schema)) {
    method.schema = new Schema(method.schema);
  }

  this.prototype.methods[name] = method;

  this.prototype[name] = function (params, callback) {
    method.nodeHandler.call(this, method, params, callback);
  };
};

Module.prototype.attach = function (app, customOptions) {
  var self = this;

  customOptions = customOptions || {};
  if ("string" == typeof customOptions) customOptions = {prefix: customOptions};

  var options = extend({}, Module.defaultAttachOptions, customOptions);

  function createService(method) {
    app.get(options.prefix+i, function (req, res) {
      var contentType =  "application/json";

      var callback = function (err, result) {
        if (err) {
          var errType = err.type || 'ServerError';

          var error = {
            error: errType
          };
          error.message = ("string" == typeof err) ? err : err.message;

          if (err.stack) error.stack = err.stack;

          result = JSON.stringify(error);
          console.log(err);
        }

        result = result || '{}';
        if (typeof result != 'string'){
          result = JSON.stringify(result);
        }

        // Check for JSONP
        if (req.query.callback) {
          contentType =  "text/javascript";
          result = req.query.callback+"("+result+")";
        }

        // Return result
        res.header('Content-Type', contentType);
        res.send(result);
      };

      try {
        var params = req.query;
        params = method.schema.apply(params);
      } catch (e) {
        e.type = "BadRequest";
        callback(e);
      }

      try {
        method.webHandler.call(self, method, params, req, res, callback);
      } catch (e) {
        callback(e);
      }
    });
  };

  for (var i in this.methods) {
    createService(this.methods[i]);
  }
};
