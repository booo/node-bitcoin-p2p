require('buffertools');

var suite = require('./common');

var obj = {
  prop: 0
};

var obj1 = {
  _prop: 0,
  getProp: function() {
    return this._prop;
  },
  setProp: function(value) {
    this._prop = value;
  }
};

var obj2 = {
  _prop: 0,
  get prop() {
    return this._prop;
  },
  set prop(value) {
    this._prop = value;
  }
};


var obj3 = {
  _prop: 0
}


Object.defineProperty(obj3, "prop", {
  get: function() {
    return this._prop;
    
  },
  set: function(val) {
    this._prop = val;
  }
});

var obj4 = {
  _prop: 0
}


obj4.__defineGetter__("prop", function() {
  return this._prop;
});

obj4.__defineSetter__("prop", function(val) {
  this._prop = val;
});

var obj5 = {
  _prop: 0,
  prop: function(value) {
    if (value !== void 0)
      this._prop = value;
    else
      return this._prop;
  }
};

var obj6 = {
  attributes: {
    prop: 0
  },
  get: function(name) {
    return this.attributes[name];
  },
  set: function(name, value) {
    this.attributes[name] = value;
  }
};

var obj7 = {
  _prop: 0,
  get: function(key) {
    return this[key];
  },
  set: function(key, value) {
    this[key] = value;
  }
};

// add tests
suite.add('Regular property', function () {
  obj.prop = obj.prop + 1;
});

suite.add('Getter / setter methods', function() {
  obj1.setProp(obj1.getProp() + 1);
});

suite.add('get / set syntax', function() {
	obj2.prop = obj2.prop + 1;
});

suite.add('Object.defineProperty', function () {
  obj3.prop = obj3.prop + 1;
});

suite.add('__defineGetter__', function () {
  obj4.prop = obj4.prop + 1;
});

suite.add('Combined getter / setter method', function () {
  obj5.prop(obj5.prop() + 1);
});

suite.add('Generic get/set methods (with key)', function () {
  obj7.set('_prop', obj7.get('_prop') + 1);
});

// run async
suite.run({ 'async': true });
