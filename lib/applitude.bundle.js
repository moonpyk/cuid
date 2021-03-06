;!function(exports, undefined) {

  var isArray = Array.isArray ? Array.isArray : function _isArray(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
  var defaultMaxListeners = 10;

  function init() {
    this._events = new Object;
  }

  function configure(conf) {
    if (conf) {
      conf.delimiter && (this.delimiter = conf.delimiter);
      conf.wildcard && (this.wildcard = conf.wildcard);
      if (this.wildcard) {
        this.listenerTree = new Object;
      }
    }
  }

  function EventEmitter(conf) {
    this._events = new Object;
    configure.call(this, conf);
  }

  //
  // Attention, function return type now is array, always !
  // It has zero elements if no any matches found and one or more
  // elements (leafs) if there are matches
  //
  function searchListenerTree(handlers, type, tree, i) {
    if (!tree) {
      return [];
    }
    var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached,
        typeLength = type.length, currentType = type[i], nextType = type[i+1];
    if (i === typeLength && tree._listeners) {
      //
      // If at the end of the event(s) list and the tree has listeners
      // invoke those listeners.
      //
      if (typeof tree._listeners === 'function') {
        handlers && handlers.push(tree._listeners);
        return [tree];
      } else {
        for (leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {
          handlers && handlers.push(tree._listeners[leaf]);
        }
        return [tree];
      }
    }

    if ((currentType === '*' || currentType === '**') || tree[currentType]) {
      //
      // If the event emitted is '*' at this part
      // or there is a concrete match at this patch
      //
      if (currentType === '*') {
        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+1));
          }
        }
        return listeners;
      } else if(currentType === '**') {
        endReached = (i+1 === typeLength || (i+2 === typeLength && nextType === '*'));
        if(endReached && tree._listeners) {
          // The next element has a _listeners, add it to the handlers.
          listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));
        }

        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            if(branch === '*' || branch === '**') {
              if(tree[branch]._listeners && !endReached) {
                listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));
              }
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            } else if(branch === nextType) {
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+2));
            } else {
              // No match on this one, shift into the tree but not in the type array.
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            }
          }
        }
        return listeners;
      }

      listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i+1));
    }

    xTree = tree['*'];
    if (xTree) {
      //
      // If the listener tree will allow any match for this part,
      // then recursively explore all branches of the tree
      //
      searchListenerTree(handlers, type, xTree, i+1);
    }
    
    xxTree = tree['**'];
    if(xxTree) {
      if(i < typeLength) {
        if(xxTree._listeners) {
          // If we have a listener on a '**', it will catch all, so add its handler.
          searchListenerTree(handlers, type, xxTree, typeLength);
        }
        
        // Build arrays of matching next branches and others.
        for(branch in xxTree) {
          if(branch !== '_listeners' && xxTree.hasOwnProperty(branch)) {
            if(branch === nextType) {
              // We know the next element will match, so jump twice.
              searchListenerTree(handlers, type, xxTree[branch], i+2);
            } else if(branch === currentType) {
              // Current node matches, move into the tree.
              searchListenerTree(handlers, type, xxTree[branch], i+1);
            } else {
              isolatedBranch = {};
              isolatedBranch[branch] = xxTree[branch];
              searchListenerTree(handlers, type, { '**': isolatedBranch }, i+1);
            }
          }
        }
      } else if(xxTree._listeners) {
        // We have reached the end and still on a '**'
        searchListenerTree(handlers, type, xxTree, typeLength);
      } else if(xxTree['*'] && xxTree['*']._listeners) {
        searchListenerTree(handlers, type, xxTree['*'], typeLength);
      }
    }

    return listeners;
  }

  function growListenerTree(type, listener) {

    type = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
    
    //
    // Looks for two consecutive '**', if so, don't add the event at all.
    //
    for(var i = 0, len = type.length; i+1 < len; i++) {
      if(type[i] === '**' && type[i+1] === '**') {
        return;
      }
    }

    var tree = this.listenerTree;
    var name = type.shift();

    while (name) {

      if (!tree[name]) {
        tree[name] = new Object;
      }

      tree = tree[name];

      if (type.length === 0) {

        if (!tree._listeners) {
          tree._listeners = listener;
        }
        else if(typeof tree._listeners === 'function') {
          tree._listeners = [tree._listeners, listener];
        }
        else if (isArray(tree._listeners)) {

          tree._listeners.push(listener);

          if (!tree._listeners.warned) {

            var m = defaultMaxListeners;
            
            if (typeof this._events.maxListeners !== 'undefined') {
              m = this._events.maxListeners;
            }

            if (m > 0 && tree._listeners.length > m) {

              tree._listeners.warned = true;
              console.error('(node) warning: possible EventEmitter memory ' +
                            'leak detected. %d listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit.',
                            tree._listeners.length);
              console.trace();
            }
          }
        }
        return true;
      }
      name = type.shift();
    }
    return true;
  };

  // By default EventEmitters will print a warning if more than
  // 10 listeners are added to it. This is a useful default which
  // helps finding memory leaks.
  //
  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.

  EventEmitter.prototype.delimiter = '.';

  EventEmitter.prototype.setMaxListeners = function(n) {
    this._events || init.call(this);
    this._events.maxListeners = n;
  };

  EventEmitter.prototype.event = '';

  EventEmitter.prototype.once = function(event, fn) {
    this.many(event, 1, fn);
    return this;
  };

  EventEmitter.prototype.many = function(event, ttl, fn) {
    var self = this;

    if (typeof fn !== 'function') {
      throw new Error('many only accepts instances of Function');
    }

    function listener() {
      if (--ttl === 0) {
        self.off(event, listener);
      }
      fn.apply(this, arguments);
    };

    listener._origin = fn;

    this.on(event, listener);

    return self;
  };

  EventEmitter.prototype.emit = function() {
    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener') {
      if (!this._events.newListener) { return false; }
    }

    // Loop through the *_all* functions and invoke them.
    if (this._all) {
      var l = arguments.length;
      var args = new Array(l - 1);
      for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
      for (i = 0, l = this._all.length; i < l; i++) {
        this.event = type;
        this._all[i].apply(this, args);
      }
    }

    // If there is no 'error' event listener then throw.
    if (type === 'error') {
      
      if (!this._all && 
        !this._events.error && 
        !(this.wildcard && this.listenerTree.error)) {

        if (arguments[1] instanceof Error) {
          throw arguments[1]; // Unhandled 'error' event
        } else {
          throw new Error("Uncaught, unspecified 'error' event.");
        }
        return false;
      }
    }

    var handler;

    if(this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    }
    else {
      handler = this._events[type];
    }

    if (typeof handler === 'function') {
      this.event = type;
      if (arguments.length === 1) {
        handler.call(this);
      }
      else if (arguments.length > 1)
        switch (arguments.length) {
          case 2:
            handler.call(this, arguments[1]);
            break;
          case 3:
            handler.call(this, arguments[1], arguments[2]);
            break;
          // slower
          default:
            var l = arguments.length;
            var args = new Array(l - 1);
            for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
            handler.apply(this, args);
        }
      return true;
    }
    else if (handler) {
      var l = arguments.length;
      var args = new Array(l - 1);
      for (var i = 1; i < l; i++) args[i - 1] = arguments[i];

      var listeners = handler.slice();
      for (var i = 0, l = listeners.length; i < l; i++) {
        this.event = type;
        listeners[i].apply(this, args);
      }
      return (listeners.length > 0) || this._all;
    }
    else {
      return this._all;
    }

  };

  EventEmitter.prototype.on = function(type, listener) {
    
    if (typeof type === 'function') {
      this.onAny(type);
      return this;
    }

    if (typeof listener !== 'function') {
      throw new Error('on only accepts instances of Function');
    }
    this._events || init.call(this);

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    this.emit('newListener', type, listener);

    if(this.wildcard) {
      growListenerTree.call(this, type, listener);
      return this;
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    }
    else if(typeof this._events[type] === 'function') {
      // Adding the second element, need to change to array.
      this._events[type] = [this._events[type], listener];
    }
    else if (isArray(this._events[type])) {
      // If we've already got an array, just append.
      this._events[type].push(listener);

      // Check for listener leak
      if (!this._events[type].warned) {

        var m = defaultMaxListeners;
        
        if (typeof this._events.maxListeners !== 'undefined') {
          m = this._events.maxListeners;
        }

        if (m > 0 && this._events[type].length > m) {

          this._events[type].warned = true;
          console.error('(node) warning: possible EventEmitter memory ' +
                        'leak detected. %d listeners added. ' +
                        'Use emitter.setMaxListeners() to increase limit.',
                        this._events[type].length);
          console.trace();
        }
      }
    }
    return this;
  };

  EventEmitter.prototype.onAny = function(fn) {

    if(!this._all) {
      this._all = [];
    }

    if (typeof fn !== 'function') {
      throw new Error('onAny only accepts instances of Function');
    }

    // Add the function to the event listener collection.
    this._all.push(fn);
    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype.off = function(type, listener) {
    if (typeof listener !== 'function') {
      throw new Error('removeListener only takes instances of Function');
    }

    var handlers,leafs=[];

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);
    }
    else {
      // does not use listeners(), so no side effect of creating _events[type]
      if (!this._events[type]) return this;
      handlers = this._events[type];
      leafs.push({_listeners:handlers});
    }

    for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
      var leaf = leafs[iLeaf];
      handlers = leaf._listeners;
      if (isArray(handlers)) {

        var position = -1;

        for (var i = 0, length = handlers.length; i < length; i++) {
          if (handlers[i] === listener ||
            (handlers[i].listener && handlers[i].listener === listener) ||
            (handlers[i]._origin && handlers[i]._origin === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0) {
          return this;
        }

        if(this.wildcard) {
          leaf._listeners.splice(position, 1)
        }
        else {
          this._events[type].splice(position, 1);
        }

        if (handlers.length === 0) {
          if(this.wildcard) {
            delete leaf._listeners;
          }
          else {
            delete this._events[type];
          }
        }
      }
      else if (handlers === listener ||
        (handlers.listener && handlers.listener === listener) ||
        (handlers._origin && handlers._origin === listener)) {
        if(this.wildcard) {
          delete leaf._listeners;
        }
        else {
          delete this._events[type];
        }
      }
    }

    return this;
  };

  EventEmitter.prototype.offAny = function(fn) {
    var i = 0, l = 0, fns;
    if (fn && this._all && this._all.length > 0) {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++) {
        if(fn === fns[i]) {
          fns.splice(i, 1);
          return this;
        }
      }
    } else {
      this._all = [];
    }
    return this;
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function(type) {
    if (arguments.length === 0) {
      !this._events || init.call(this);
      return this;
    }

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      var leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);

      for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
        var leaf = leafs[iLeaf];
        leaf._listeners = null;
      }
    }
    else {
      if (!this._events[type]) return this;
      this._events[type] = null;
    }
    return this;
  };

  EventEmitter.prototype.listeners = function(type) {
    if(this.wildcard) {
      var handlers = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handlers, ns, this.listenerTree, 0);
      return handlers;
    }

    this._events || init.call(this);

    if (!this._events[type]) this._events[type] = [];
    if (!isArray(this._events[type])) {
      this._events[type] = [this._events[type]];
    }
    return this._events[type];
  };

  EventEmitter.prototype.listenersAny = function() {

    if(this._all) {
      return this._all;
    }
    else {
      return [];
    }

  };

  if (typeof define === 'function' && define.amd) {
    define(function() {
      return EventEmitter;
    });
  } else {
    exports.EventEmitter2 = EventEmitter; 
  }

}(typeof process !== 'undefined' && typeof process.title !== 'undefined' && typeof exports !== 'undefined' ? exports : window);

/**
 * odotjs - Prototypal OO made easy.
 *
 * Copyright (c) Eric Elliott 2012
 * MIT License
 * http://www.opensource.org/licenses/mit-license.php
 */

/*global exports */

// Polyfills
(function () {
  'use strict';
  // Shim .forEach()
  if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (fn, scope) {
      var i,
        length = this.length;
      for (i = 0, length; i < length; ++i) {
        fn.call(scope || this, this[i], i, this);
      }
    };
  }

  // Shim Object.create()
  if (!Object.create) {
    Object.create = function (o) {
      if (arguments.length > 1) {
        throw new Error('Object.create implementation only accepts the first parameter.');
      }
      function F() {}
      F.prototype = o;
      return new F();
    };
  }

  // Shim String.prototype.trim()
  if(!String.prototype.trim) {
    String.prototype.trim = function () {
      return this.replace(/^\s+|\s+$/g,'');
    };
  }
}());

(function (exports) {
  'use strict';
  var namespace = 'odotjs',

    // Adapted from Underscore.
    extend = function extend(obj) {
      var args = [].slice.call(arguments, 1);
      args.forEach(function (source) {
        var prop;
        for (prop in source) {
          obj[prop] = source[prop];
        }
      });
      return obj;
    },

    plugins = {},

    // Add to the global plugin collection.
    addPlugins = function (newPlugins) {
      extend(plugins, newPlugins);
    },

    // Add to the current object prototype.
    share = function share(name, prop) {
      this.proto[name] = prop;
    },

    // Pass the global plugins to the object
    // prototype.
    bless = function bless(proto) {
      proto.share = share;

      extend(proto, plugins);

      return proto;
    },

    copy = function copy(input) {
      return JSON.parse(JSON.stringify(input));
    },

    o,
    api,
    defaultInit = function init() {
      return this;
    },

    /**
     * The user can pass in the formal parameters, or a named
     * parameters. Either way, we need to initialize the
     * variables to the expected values.
     *
     * @param {String} optionNames Parameter names.
     *
     * @return {object} New configuration object.
     */
    mapOptions = function mapOptions(optionNames) {
      var config = {}, // New config object

        // Comma separated string to Array
        names = optionNames.split(/\s*\,\s*/),

        // Turn arguments into array, starting at index 1
        args = [].slice.call(arguments, 1),
        isHash;

      names.forEach(function (optionName) {
        // Use first argument as params object...
        if (args[0] && args[0][optionName]) {
          config[optionName] = args[0][optionName];
          isHash = true;
        }
      });

      // Or, grab the options from the arguments
      if (!isHash) {
        names.forEach(function (optionName, index) {
          config[optionName] = args[index];
        });
      }

      return config;
    };

  /**
   * Create a new, blessed object with public properties,
   * shared properties (on prototype), and support for
   * privacy (via initFunction).
   *
   * @param {object} sharedProperties Prototype
   * @param {object} instanceProperties Instance safe
   * @param {function} initFunction Init and privacy
   *
   * @return {object}
   */
  o = function o(sharedProperties, instanceProperties,
      initFunction) {
    var optionNames = 'sharedProperties, instanceProperties,' +
        ' initFunction',
      config,
      proto,
      obj;

    config = mapOptions(optionNames, sharedProperties,
      instanceProperties, initFunction);
    config.initFunction = config.initFunction || defaultInit;
    proto = config.sharedProperties || {};

    bless(proto);

    obj = extend(Object.create(proto), {proto: proto},
      config.instanceProperties);

    return config.initFunction.call(obj);
  };

  bless(o);

  extend(o, {
    /**
     * Returns an object factory that stamps out objects
     * using a specified shared prototype and init.
     * 
     * @param  {Object} sharedProperties  prototype
     * @param  {Object} defaultProperties instance properties
     * @param  {Function} instanceInit    instance level init
     * @param  {Function} factoryInit     factory level init
     * @param  {Boolean} ignoreOptions    ignore instance options?        
     * @return {Function}                 factory function
     */
    factory: function factory(sharedProperties, defaultProperties,
        instanceInit, factoryInit, ignoreOptions) {
      var optionNames = 'sharedProperties, defaultProperties,' +
          ' instanceInit, factoryInit, ignoreOptions',
        config,
        initObj = o();

      config = mapOptions(optionNames, sharedProperties,
        defaultProperties, instanceInit, factoryInit, ignoreOptions);
      config.instanceInit = config.instanceInit || defaultInit;

      // factoryInit can be used to initialize shared private state.
      if (typeof config.factoryInit === 'function') {
        config.factoryInit.call(initObj);
      }

      return bless(function (options) {
        var defaultProperties = copy(config.defaultProperties || {},
          sharedProperties = extend(config.sharedProperties ||
            {}, initObj)),
          instance = (config.ignoreOptions) ?
            defaultProperties :
            extend({}, defaultProperties, options),
          obj, 
          init;

        obj = extend(o(sharedProperties, instance));
        init = config.instanceInit;

        return ((typeof init === 'function') ?
          init.call(obj, options)
          : obj);
      });
    },
    addPlugins: addPlugins,
    extend: extend,
    mapOptions: mapOptions,
    getConfig: mapOptions
  });

  api = o;

  exports[namespace] = api;
}((typeof exports === 'undefined') ?
    this
    : exports));

/**
 * Applitude - Application namespacing and module management.
 *
 * Depends on jQuery, EventEmitter2, and odotjs
 *
 * Copyright (c) Eric Elliott 2012
 * MIT License
 * http://opensource.org/licenses/MIT
 */

/*global jQuery, EventEmitter2, odotjs, window,
console, exports */
(function (root, $, o, events) {
  'use strict';
  var namespace = 'applitude',
    debugLog = [],
    loadErrors = {},

    /**
     * Deferred utilities
     */
    deferred = $.Deferred,
    when = $.when,
    resolved = deferred().resolve().promise(),
    rejected = deferred().reject().promise(),
    app,
    register,
    stringToArray,
    addMixins,
    whenRenderReady = deferred(),
    setModule;

  setModule = function val(cursor, location, value) {
    var tree = location.split('.'),
      key = tree.shift(),
      returnValue;

    while (tree.length) {
      if (cursor[key] !== undefined) {
        cursor = cursor[key];
      } else {
        cursor = cursor[key] = {};
      }
      key = tree.shift();
    }

    if (cursor[key] === undefined) {
      cursor[key] = value;
      returnValue = true;
    } else {
      returnValue = false;
    }
    return returnValue;
  };

  stringToArray = function stringToArray(input, pattern) {
    var result;
    pattern = pattern || /\s*\,\s*/;

    result = (typeof input !== 'string') ?
      result = [] :
      result = input.trim().split(pattern);

    return result;
  };

  addMixins = function addMixins(module) {
    var mixins = stringToArray(module.mixins),
      backup = o.extend({}, module);
    mixins.forEach(function (mixin) {
      if (app[mixin]) {
        o.extend(module, app[mixin]);
      }
    });
    return o.extend(module, backup);
  };

  app = function applitudeFunction(appNs, environment, options) {
    var whenPageLoaded = deferred(),
      beforeRenderOption = (options && options.beforeRender) || [],
      beforeRender = [whenPageLoaded].concat(beforeRenderOption),
      tryRender;

    whenRenderReady = when.apply(null, beforeRender);

    tryRender = function tryRender(module) {
      if (typeof module.render === 'function') {
        whenRenderReady.then(module.render, module.render);
      }
    };

    register = function register(ns, module) {
      var whenLoaded,
        newModule;

      module.moduleNamespace = ns;

      newModule = setModule(app, ns, module, function () {
        app.events.trigger('module_added' + app.appNamespace, ns);            
      });

      if (newModule) {

        if (module.mixins) {
          addMixins(module);
        }

        // If load exists, try to load
        if (typeof module.load === 'function') {
          try {
            // If a promise is returned, wait for load to finish.
            whenLoaded = module.load();
            if (whenLoaded && whenLoaded.done) {
              whenLoaded.done(function () {
                tryRender(module);
              });
            } else {
              tryRender(module);
            }
          } catch (loadError) {
            loadErrors[ns] = loadError;
            app.log('Error loading module: ', ns, loadError);
          }
        } else if (!loadErrors[ns]) {
          // if .render() exists, try to render
          tryRender(module);
        }

      } else {
        app.log('Error: Module already registered: ', ns);
      }

      return app;
    };

    $(function () {
      whenPageLoaded.resolve();
    });

    // aliases
    events.trigger = events.emit;

    o.extend(app, {
      register: register,
      environment: environment,
      appNamespace: appNs,
      options: options
    });

    return app;
  };

  function on() {
    app.events.on.apply(app.events, arguments);
  }

  function trigger() {
    app.events.trigger.apply(app.events, arguments);
  }

  o.extend(app, {
    deferred: deferred,
    resolved: resolved,
    rejected: rejected,
    when: when,
    o: o,
    $: $,
    get: $.get,
    stringToArray: stringToArray,
    isArray: $.isArray,
    events: events,
    on: on,
    trigger: trigger,
    debugLog: debugLog
  });

  app.log = function log() {
    var debug = app.environment && app.environment.debug,
      hasConsole = (window.console !== undefined) && console.log;
    if (debug && hasConsole) {
      console.log.apply(console, [].slice.call(arguments, 0));
    } else {
      debugLog.push(arguments);
    }
  };

  root[namespace] = app;

}((typeof exports !== 'undefined') ?
    exports : window,
  jQuery,
  odotjs,
  new EventEmitter2({
    wildcard: true
  })));
