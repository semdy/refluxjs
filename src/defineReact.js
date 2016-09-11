/* globals Reflux: false */

/**
 * Reflux.defineReact function where you can manually supply
 * the React object in order to create in case Reflux needs to load before
 * React or there is a modular environment where there won't be a global
 * React variable. If Reflux is not global either then it can be included
 * as a second parameter.
 */
function defineReact(react, reflux)
{
	var rflx, proto;
	
	// if no Reflux object is yet available then return and just wait until defineReact is called manually with it
	try {
		rflx = reflux || Reflux;
	} catch (e) {
		return;
	}
	
	/**
	 * Reflux.GlobalState is where data is stored for any Reflux.Store that has a static id property. Each store's
	 * state will be on the Reflux.GlobalState object with the id as the key. So a store with the id "MyStore" and
	 * a state {"color":"red"} will end up with a Reflux.GlobalState of {"MyStore":{"color":"red"}}
	 * Reflux.GlobalState is an accessible part of the API. However, keep in mind that non-primitive properties you
	 * read off of it will continue to mutate and you can only manually mutate Reflux.GlobalState BEFORE any component
	 * mounting of components with ES6 stores. For more functionality look to Reflux.setGlobalState to change the global
	 * state at any point, and Reflux.getGlobalState to return a deep clone of the Reflux.GlobalState object which will
	 * not continue to mutate as Reflux.GlobalState continues to mutate.
	 */
	rflx.GlobalState = rflx.GlobalState || {};
	
	/**
	 * Reflux.stores
	 * All initialized stores that have an id will have a reference to their singleton stored here with the key being the id.
	 */
	rflx.stores = {};
	
	// this is utilized by some of the global state functionality in order to get a clone that will
	// not continue to be modified as the GlobalState mutates
	function clone(frm, to) {
		if (frm === null || typeof frm !== "object") {
			return frm;
		}
		if (frm.constructor !== Object && frm.constructor !== Array) {
			return frm;
		}
		if (frm.constructor === Date || frm.constructor === RegExp || frm.constructor === Function ||
			frm.constructor === String || frm.constructor === Number || frm.constructor === Boolean) {
			return new frm.constructor(frm);
		}
		to = to || new frm.constructor();
		for (var name in frm) {
			to[name] = typeof to[name] === "undefined" ? clone(frm[name], null) : to[name];
		}
		return to;
	}
	
	/**
	 * Reflux.getGlobalState takes no arguments, and returns a deep clone of Reflux.GlobalState 
	 * which will not continue to mutate as Reflux.GlobalState does. It can essentially store
	 * snapshots of the global state as the program goes for saving or for in-app time travel.
	 */
	rflx.getGlobalState = function() {
		return clone(rflx.GlobalState);
	};
	
	/**
	 * Reflux.setGlobalState takes one argument that is a representation of the a possible
	 * global state. It updates all stores in the program to represent data in that given state.
	 * This includes triggering those stores so that that state is represented in any Reflux.Component
	 * instances they are attached to. Partial states may be given to it, and only the represented
	 * stores/state values will be updated.
	 */
	rflx.setGlobalState = function(obj) {
		for (var storeID in obj) {
			if (rflx.stores[storeID]) {
				rflx.stores[storeID].setState(obj[storeID]);
			} else {
				rflx.GlobalState[storeID] = obj[storeID];
			}
		}
	};
	
	// if Reflux, React, and React.Component are present then build Reflux.Component and Reflux.Store classes
	if (rflx && react && react.Component)
	{
		/**
		 * Reflux.Component:
		 * An implementation for idiomatic React.js classes that mix with
		 * Reflux stores. To utilize extend Reflux.Component instead of
		 * React.Component. Then you may hook any Reflux store that has a
		 * `this.state` property containing its state values to the component
		 * via `this.store` or an Array of Reflux stores via `this.stores` in
		 * the component's constructor (similar to how you assign initial state
		 * in the constructor in ES6 style React). The default values of the
		 * stores will automatically reflect in the component's state, and any
		 * further `trigger` calls from that store will update properties passed
		 * in the trigger into the component automatically.
		 */
		var RefluxComponent = function(props) {
			_super.call(this, props);
		};
		
		// equivalent of `extends React.Component`
		var _super = react.Component;
		ext(RefluxComponent, _super);
		
		proto = RefluxComponent.prototype;
		
		/**
		 * this.storeKeys
		 * When this is a falsey value (null by default) the component mixes in
		 * all properties from the stores attached to it and updates on changes
		 * from all of them. When set to an array of string keys it will only
		 * utilized state property names of those keys in any store attached. This
		 * lets you choose which parts of stores update the component on a component-
		 * by-component basis. If using this it is best set in the constructor.
		 */
		proto.storeKeys = null;
		
		// on the mounting of the component that is where the store/stores are attached and initialized if needed
		proto.componentWillMount = function () {
			// if there is a this.store then simply push it onto the this.stores array or make one if needed
			if (this.store) {
				if (Array.isArray(this.stores)) {
					this.stores.unshift(this.store);
				} else {
					this.stores = [this.store];
				}
			}
			
			if (this.stores) {
				this.__storeunsubscribes__ = this.__storeunsubscribes__ || [];
				var sS = this.setState.bind(this);
				// this handles the triggering of a store, checking what's updated if proto.storeKeys is utilized
				var onStoreTrigger = function(obj){
					// if there are not storeKeys defined then simply merge the state into the component
					if (!this.storeKeys) {
						sS(obj);
						return;
					}
					// otherwise go through and only update properties that are in the storeKeys array, and only trigger if there are some
					var doUpdate = false;
					var updateObj = {};
					for (var i = 0, ii = this.storeKeys.length; i < ii; i++) {
						var prop = this.storeKeys[i];
						if (obj.hasOwnProperty(prop)) {
							doUpdate = true;
							updateObj[prop] = obj[prop];
						}
					}
					if (doUpdate) {
						sS(updateObj);
					}
				}.bind(this);
				// for each store in this.stores...
				for (var i = 0, ii = this.stores.length; i < ii; i++) {
					var str = this.stores[i];
					// if it has the .isES6Store property then we know it's a class getting passed, not an instance
					if (str.isES6Store) {
						var storeId = str.id;
						// if there is NOT a .singleton property on the store then this store has not been initialized yet, so do so
						if (!str.singleton) {
							str.singleton = new str();
							if (storeId) {
								rflx.stores[storeId] = str.singleton;
							}
						}
						// before we weren't sure if we were working with an instance or class, so now we know an instance is created set it
						// to the variables we were using so that we can just continue on knowing it's the instance we're working with
						this.stores[i] = str = str.singleton;
						// the instance should have an .id property as well if the class does, so set that here
						str.id = storeId;
						// if there is an id and there is a global state property for this store then merge
						// the properties from that global state into the default state of the store AND then
						// set the global state to that new state (since it may have previously been partial)
						if (storeId && rflx.GlobalState[storeId]) {
							for (var key in rflx.GlobalState[storeId]) {
								str.state[key] = rflx.GlobalState[storeId][key];
							}
							rflx.GlobalState[storeId] = str.state;
						// otherwise (if it has an id) set the global state to the default state of the store
						} else if (storeId) {
							rflx.GlobalState[storeId] = str.state;
						}
						// if no id, then no messing with global state
					}
					// listen/subscribe for the ".trigger()" in the store, and track the unsubscribes so that we can unsubscribe on unmount
					this.__storeunsubscribes__.push(str.listen(onStoreTrigger));
					// run set state so that it mixes in the props from the store with the component
					this.setState(str.state);
				}
			}
			
			// mapStoreToState needs to know if is ready to map or must wait
			this.__readytomap__ = true;
			// if there are mappings that were delayed, do them now
			var dmaps = this.__delayedmaps__;
			if (dmaps) {
				for (var j=0,jj=dmaps.length; j<jj; j++) {
					dmaps[j].func( dmaps[j].state );
				}
			}
			this.__delayedmaps__ = null;
		};
		
		// on the unmount phase of the component unsubscribe that which we subscribed earlier to keep our garbage trail clean
		proto.componentWillUnmount = function () {
			for (var i = 0, ii = this.__storeunsubscribes__.length; i < ii; i++) {
				this.__storeunsubscribes__[i]();
			}
			this.__readytomap__ = false;
		};
		
		/**
		 * this.mapStoreToState
		 * This function allow you to supply map the state of a store to the
		 * state of this component manually via your own logic. This method
		 * is completely separate from this.store/this.stores and/or this.storeKeys.
		 * Call this function with an ES6 store (class or singleton instance) as the
		 * first argument and your filter function as the second. Your filter function
		 * will receive an object of the parts of the ES6 store being updated every
		 * time its setState is called. Your filter function then returns an object
		 * which will be merged with the component state (IF it has any properties at all,
		 * should you return a blank object the component will not rerender).
		 */
		proto.mapStoreToState = function(store, filterFunc)
		{
			// make sure we have a proper singleton instance to work with
			if (store.isES6Store) {
				if (store.singleton) {
					store = store.singleton;
				} else if (store.id) {
					store = Reflux.initializeGlobalStore(store);
				} else {
					store = store.singleton = new store();
				}
			}
			
			// we need a closure so that the called function can remember the proper filter function to use, so function gets defined here
			var self = this;
			function onMapStoreTrigger(obj) {
				// get an object 
				var update = filterFunc.call(self, obj);
				// if no object returned from filter functions do nothing
				if (!update) {
					return;
				}
				// check if the update actually has any mapped props
				/*jshint unused: false */
				var hasProps = false;
				for (var check in update) {
					hasProps = true;
					break;
				}
				// if there were props mapped, then update via setState
				if (hasProps) {
					self.setState(update);
				}
			}
			
			// add the listener to know when the store is triggered
			this.__storeunsubscribes__ = this.__storeunsubscribes__ || [];
			this.__storeunsubscribes__.push(store.listen(onMapStoreTrigger));
			
			// now actually run onMapStoreTrigger with the full store state so that we immediately have all store state mapped to component state
			if (this.__readytomap__) {
				onMapStoreTrigger(store.state);
			} else {
				this.__delayedmaps__ = this.__delayedmaps__ || [];
				this.__delayedmaps__.push({func:onMapStoreTrigger, state:store.state});
			}
		};
		
		rflx.Component = RefluxComponent;
		
		// ---------------------------------------------------
		
		/**
		 * Reflux.initializeGlobalStore takes one argument (a class that extends Reflux.Store) and returns a singleton
		 * intance of that class. Its main functionality is to be able to mimic what happens to stores attached to
		 * this.store or this.stores during the mounting phase of a component without having to actually attach the
		 * store to a component in order to work properly with the global state.
		 */
		rflx.initializeGlobalStore = function(str) {
			var storeId = str.id;
			// this is primarily for making stores work with global state when not in a component, so if no id then notify something is wrong
			if (!storeId) {
				throw new Error('Invalid store id.');
			}
			// if they're initializing something twice then that's a problem, throw an error
			if (str.singleton) {
				throw new Error('Store already initialized.');
			}
			// create the singleton and assign it to the class's singleton static property
			var inst = str.singleton = new str();
			// store it on the Reflux.stores array to be accessible later
			rflx.stores[storeId] = inst;
			// the singleton instance itself should also have the id property of the class
			inst.id = storeId;
			// if the global state has something set for this id, copy it to the state and then
			// make sure to set the global state to the end result, since it may have only been partial
			if (rflx.GlobalState[storeId]) {
				for (var key in rflx.GlobalState[storeId]) {
					inst.state[key] = rflx.GlobalState[storeId][key];
				}
				rflx.GlobalState[storeId] = inst.state;
			// otherwise just set the global state to the default state of the class
			} else {
				rflx.GlobalState[storeId] = inst.state;
			}
			// returns the singleton itself, though it will also be accessible as as `MyClass.singleton`
			return inst;
		};
		
		/**
		 * Reflux.Store:
		 * Also implements optional Reflux.Store class that is idiomatic with
		 * the React ES6 style. You extend Reflux.Store and then the rest works
		 * the same as createStore, except the constructor instead of init, and
		 * it holds state in a state property, and a .setState method is available
		 * which automatically updates state and does a trigger. Then when using
		 * with this.store or this.stores in an ES6 component just plass the class,
		 * it will deal with a singleton instantiation of the class automatically.
		 */
		var RefluxStore = function() {
			// extending doesn't really work well here, so instead we create an internal instance
			// and just loop through its properties/methods and make a getter/setter for each
			// that will actually be getting and setting on that internal instance.
			this.__store__ = rflx.createStore();
			this.state = {};
			var self = this;
			for (var key in this.__store__) {
				/*jshint loopfunc: true */
				(function (prop) {
					Object.defineProperty(self, prop, {
						get: function () { return self.__store__[prop]; },
						set: function (v) { self.__store__[prop] = v; }
					});
				})(key);
			}
		};
		
		proto = RefluxStore.prototype;
		
		// this defines the listenables property, mostly intended to be set as `this.listenables` in the constructor of the store
		// it is essentially a shortcut to the `listenToMany` method
		Object.defineProperty(proto, "listenables", {
			get: function () {
				return this.__listenables__;
			},
			set: function (v) {
				this.__listenables__ = v;
				this.listenToMany(v);
			},
			enumerable: true,
			configurable: true
		});
		
		// allows simple usage of `this.setState(obj)` within the store to both update the state and trigger the store to update
		// components that it is attached to in a simple way that is idiomatic with React
		proto.setState = function (obj) {
			// Object.assign(this.state, obj); // later turn this to Object.assign and remove loop once support is good enough
			for (var key in obj) {
				this.state[key] = obj[key];
			}
			// if there's an id (i.e. it's being tracked by the global state) then make sure to update the global state
			if (this.id) {
				rflx.GlobalState[this.id] = this.state;
			}
			// trigger, because any component it's attached to is listening and will merge the store state into its own on a store trigger
			this.trigger(obj);
		};
		
		// this is a static property so that other code can identify that this is a Reflux.Store class
		Object.defineProperty(RefluxStore, "isES6Store", {
			get: function () {
				return true;
			},
			enumerable: true,
			configurable: true
		});
		
		/* NOTE:
		If a Reflux.Store definition is given a static id property and used
		properly within a Reflux.Component or with Reflux.initializeGlobalStore then
		it will be added to the Reflux.GlobalState object which automatically tracks the
		current state of all such defined stores in the program. */
		
		rflx.Store = RefluxStore;
	}
}

// used as a well tested way to mimic ES6 class `extends` in ES5 code
function ext(d, b) {
    for (var p in b) {
		if (b.hasOwnProperty(p)) {
			d[p] = b[p];
		}
	}
    function __() {
		this.constructor = d;
	}
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

module.exports = defineReact;

