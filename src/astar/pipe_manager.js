'use strict';

const {turn_dir, is_dir_cardinal} = require('../utils.js');
const {Instance} = require('../parser/dmm.js');

const PIPE_TYPE_SIMPLE = Symbol('PIPE_TYPE_SIMPLE');
const PIPE_TYPE_STRAIGHT = Symbol('PIPE_TYPE_STRAIGHT');
const PIPE_TYPE_MANIFOLD = Symbol('PIPE_TYPE_MANIFOLD');
const PIPE_TYPE_MANIFOLD4W = Symbol('PIPE_TYPE_MANIFOLD4W');
const PIPE_TYPE_NODE = Symbol('PIPE_TYPE_NODE');
const PIPE_TYPE_CABLE = Symbol('PIPE_TYPE_CABLE');
const PIPE_TYPE_AUTO = Symbol('PIPE_TYPE_AUTO');

const pipe_type_list = {
	PIPE_TYPE_SIMPLE, PIPE_TYPE_STRAIGHT, PIPE_TYPE_MANIFOLD, PIPE_TYPE_MANIFOLD4W, PIPE_TYPE_NODE, PIPE_TYPE_CABLE, PIPE_TYPE_AUTO
};

const pipe_type_mixin = {
	var_overrides: new Map(Object.entries(pipe_type_list))
};

class PipeManager {
	constructor(editor) {
		/** @type {import("../editor.js")} */
		this.editor = editor;

		this.pipe_groups = new Map();
		this.pipe_typecache = new Set();

		this.pipe_type_cache = new WeakMap();
		this.pipe_group_cache = new WeakMap();
		this.pipe_group_interference_cache = new WeakMap();
		this.astar_cost_cache = new WeakMap();

		for(let [path, type_obj] of editor.parser.types) {
			let pipe_group = this.get_pipe_group(type_obj);
			let pipe_type = this.get_pipe_type(type_obj);
			if(pipe_group) {
				if(!pipe_type) throw new Error("Type " + path + " has pipe_group but no pipe_type");
				let group_obj = this.pipe_groups.get(pipe_group);
				if(!group_obj) {
					group_obj = new Map();
					this.pipe_groups.set(pipe_group, group_obj);
				}
				if(group_obj.has(pipe_type)) throw new Error(`${group_obj.get(pipe_type)} and ${path} both have the same pipe_group (${pipe_group}) and pipe_type (${pipe_type.toString()})`);
				group_obj.set(pipe_type, path);
			}
			if(pipe_type) {
				this.pipe_typecache.add(path);
			}
		}
	}

	get_astar_cost(thing) {
		if(this.astar_cost_cache.has(thing)) return this.astar_cost_cache.get(thing);
		let astar_cost = thing.get_fastdmm_prop("pipe_astar_cost", thing.make_eval_context(this.editor.parser));
		if(astar_cost == null) {
			if(thing.istype("/turf")) astar_cost = 1;
			else astar_cost = 0;
		}
		this.astar_cost_cache.set(thing, astar_cost);
		return astar_cost;
	}

	get_pipe_type(thing) {
		if(this.pipe_type_cache.has(thing)) return this.pipe_type_cache.get(thing);
		let pipe_type = thing.get_fastdmm_prop("pipe_type", Object.assign(thing.make_eval_context(this.editor.parser), pipe_type_mixin));
		this.pipe_type_cache.set(thing, pipe_type);
		return pipe_type;
	}
	get_pipe_group(thing) {
		if(this.pipe_group_cache.has(thing)) return this.pipe_group_cache.get(thing);
		let pipe_group = thing.get_fastdmm_prop("pipe_group", thing.make_eval_context(this.editor.parser));
		this.pipe_group_cache.set(thing, pipe_group);
		return pipe_group
	}
	get_pipe_interference_groups(thing) {
		if(this.pipe_group_interference_cache.has(thing)) return this.pipe_group_interference_cache.get(thing);
		let groups = thing.get_fastdmm_prop("pipe_interference_group", thing.make_eval_context(this.editor.parser));
		let ret;
		if(typeof groups == "string") ret = [groups];
		else if(!groups) ret = null;
		else ret = groups.keys;
		this.pipe_group_interference_cache.set(thing, ret);
		return ret;
	}
	get_pipe_dirs(thing) {
		let dirs = [];
		let pipe_type = this.get_pipe_type(thing);
		let dir = thing.get_var("dir");
		if(dir == 0) dir = 2;
		if(!pipe_type) return [];
		switch(pipe_type) {
		case PIPE_TYPE_SIMPLE:
			if((dir & 12) && (dir & 3)) {
				dirs.push(dir & 12);
				dirs.push(dir & 3);
			} else {
				dirs.push(dir);
				dirs.push(turn_dir(dir, 180));
			}
			break;
		case PIPE_TYPE_STRAIGHT:
			dirs.push(dir);
			dirs.push(turn_dir(dir, 180));
			break;
		case PIPE_TYPE_MANIFOLD:
			dirs.push(turn_dir(dir, 90));
			dirs.push(turn_dir(dir, -90));
			dirs.push(turn_dir(dir, 180));
			break;
		case PIPE_TYPE_MANIFOLD4W:
		case PIPE_TYPE_AUTO:
			dirs.push(1, 2, 4, 8);
			break;
		case PIPE_TYPE_CABLE:
			let icon_state = thing.get_var("icon_state");
			let split = icon_state.split("-");
			dirs.push(+split[0]);
			dirs.push(+split[1]);
		}
		return dirs;
	}
	is_pipe_group_diagonal(pipe_group) {
		let group = this.pipe_groups.get(pipe_group);
		if(group.has(PIPE_TYPE_CABLE))
			return true;
		return false;
	}
	check_interference_group(g1, g2) {
		if(!g1 || !g2) return false;
		for(let group of g1) {
			if(g2.includes(group)) return true;
		}
		return false;
	}
	check_pipe_interference(pipe_group, pipe_interference_group, tile, dir, include_self = false) {
		let opp_dir = turn_dir(dir, 180);
		let enemy_tile = tile.get_step(dir);
		if(!enemy_tile) return true;
		for(let inst of tile) {
			if(!this.pipe_typecache.has(inst.type)) continue;
			let inst_group = this.get_pipe_group(inst);
			let inst_interference_group = this.get_pipe_interference_groups(inst);
			if(!this.get_pipe_dirs(inst).includes(dir)) continue;
			if((include_self || !inst_group || inst_group != pipe_group) && this.check_interference_group(inst_interference_group, pipe_interference_group)) {
				return true;
			}
		}
		for(let inst of enemy_tile) {
			if(!this.pipe_typecache.has(inst.type)) continue;
			let inst_group = this.get_pipe_group(inst);
			let inst_interference_group = this.get_pipe_interference_groups(inst);
			if(!this.get_pipe_dirs(inst).includes(opp_dir)) continue;
			if((include_self || !inst_group || inst_group != pipe_group) && this.check_interference_group(inst_interference_group, pipe_interference_group)) {
				return true;
			}
		}
		// handle diagonals
		if((dir & 3) && (dir & 12)) {
			let left_tile = tile.get_step(turn_dir(dir, -45));
			let left_dir = turn_dir(dir, 90);
			let right_tile = tile.get_step(turn_dir(dir, 45));
			let right_dir = turn_dir(dir, -90);
			for(let inst of left_tile) {
				if(!this.pipe_typecache.has(inst.type)) continue;
				let inst_group = this.get_pipe_group(inst);
				let inst_interference_group = this.get_pipe_interference_groups(inst);
				if(!this.get_pipe_dirs(inst).includes(left_dir)) continue;
				if((include_self || !inst_group || inst_group != pipe_group) && this.check_interference_group(inst_interference_group, pipe_interference_group)) {
					return true;
				}
			}
			for(let inst of right_tile) {
				if(!this.pipe_typecache.has(inst.type)) continue;
				let inst_group = this.get_pipe_group(inst);
				let inst_interference_group = this.get_pipe_interference_groups(inst);
				if(!this.get_pipe_dirs(inst).includes(right_dir)) continue;
				if((include_self || !inst_group || inst_group != pipe_group) && this.check_interference_group(inst_interference_group, pipe_interference_group)) {
					return true;
				}
			}
		}
		return false;
	}
	get_group_dirs(pipe_group, tile) {
		let dirs = [];
		for(let inst of tile) {
			if(!this.pipe_typecache.has(inst.type)) continue;
			if(this.get_pipe_group(inst) != pipe_group) continue;
			let inst_dirs = this.get_pipe_dirs(inst);
			for(let dir of inst_dirs) {
				if(!dirs.includes(dir)) dirs.push(dir);
			}
		}
		return dirs;
	}

	place_group_instance(pipe_group, tile, from_dir, to_dir) {
		let group_obj = this.pipe_groups.get(pipe_group);

		for(let inst of tile) { // make sure we don't already have this exact pipe on the tile. Avoid instances of double-stacking pipes.
			if(!this.pipe_typecache.has(inst.type)) continue;
			if(this.get_pipe_group(inst) != pipe_group) continue;
			let inst_dirs = this.get_pipe_dirs(inst);
			if((!from_dir || inst_dirs.includes(from_dir)) && (!to_dir || inst_dirs.includes(to_dir))) return;
		}

		let existing_dirs = this.get_group_dirs(pipe_group, tile);
		if(group_obj.has(PIPE_TYPE_MANIFOLD) && group_obj.has(PIPE_TYPE_MANIFOLD4W)) {
			if(existing_dirs.length && ((existing_dirs.includes(from_dir) && existing_dirs.includes(to_dir)) || !from_dir || !to_dir)) {
				let final_dirs = [...existing_dirs];
				if(from_dir && !final_dirs.includes(from_dir)) final_dirs.push(from_dir);
				if(to_dir && !final_dirs.includes(to_dir)) final_dirs.push(to_dir);
				let is_fully_cardinal = true;
				for(let dir of final_dirs) if(!is_dir_cardinal(dir)) is_fully_cardinal = false;
				if(is_fully_cardinal && final_dirs.length == 3) {
					let included_dir = 0;
					for(let dir of [1,2,4,8]) if(!final_dirs.includes(dir)) included_dir = dir;
					if(included_dir) {
						let inst = new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_MANIFOLD), included_dir != 2 ? {dir:included_dir} : undefined);
						for(let i = 0; i < tile.contents.length; i++) {
							if(this.get_pipe_group(tile.contents[i]) == pipe_group) {
								tile.replace_object(i, inst);
								return; 
							}
						}
					}
				} else if(is_fully_cardinal && final_dirs.length == 4) {
					let inst = new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_MANIFOLD4W));
					for(let i = 0; i < tile.contents.length; i++) {
						if(this.get_pipe_group(tile.contents[i]) == pipe_group) {
							tile.replace_object(i, inst);
							return; 
						}
					}
				}
			}
		} else if(group_obj.has(PIPE_TYPE_CABLE)) {
			let dir_found;
			let opp_dir_found;
			for(let inst of tile) {
				if(!this.pipe_typecache.has(inst.type)) continue;
				if(this.get_pipe_group(inst) != pipe_group) continue;
				let inst_dirs = this.get_pipe_dirs(inst);
				if(!dir_found) dir_found = inst_dirs[0];
				for(let dir of inst_dirs) {
					if(!opp_dir_found && !(dir & from_dir) && !(dir & to_dir) && (!from_dir || !to_dir)) {
						opp_dir_found = dir
					}
					if(dir == from_dir || dir == to_dir) return;
				}
				if(inst_dirs.includes(from_dir) && inst_dirs.includes(to_dir)) {
					return;
				}
			}
			if(opp_dir_found) dir_found = opp_dir_found;
			if(dir_found && (!from_dir || !to_dir)) {
				if(!from_dir) {
					from_dir = dir_found;
				} else {
					to_dir = dir_found;
				}
			}
		}
		if(!from_dir && to_dir) {
			from_dir = existing_dirs[0];
		} else if(from_dir && !to_dir) {
			to_dir = existing_dirs[0];
		}
		if(from_dir == to_dir) return;
		let inst = this.make_group_instance(pipe_group, from_dir, to_dir);
		if(inst)
			tile.place(inst);
	}

	make_group_instance(pipe_group, from_dir, to_dir) {
		let group_obj = this.pipe_groups.get(pipe_group);
		if(from_dir == turn_dir(to_dir, 180) && is_dir_cardinal(from_dir)) {
			if(group_obj.has(PIPE_TYPE_STRAIGHT)) {
				return new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_STRAIGHT), (from_dir & 12) ? {dir:4} : undefined);
			} else if(group_obj.has(PIPE_TYPE_SIMPLE)) {
				return new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_SIMPLE), (from_dir & 12) ? {dir:4} : undefined);
			}
		}
		if(is_dir_cardinal(from_dir) && is_dir_cardinal(to_dir) && group_obj.has(PIPE_TYPE_SIMPLE)) {
			return new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_SIMPLE), {dir: from_dir | to_dir});
		}
		if(group_obj.has(PIPE_TYPE_CABLE) && from_dir && to_dir) {
			let d1 = Math.min(from_dir, to_dir);
			let d2 = Math.max(from_dir, to_dir);
			return new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_CABLE), {icon_state: `${d1}-${d2}`});
		}
		if(group_obj.has(PIPE_TYPE_AUTO)) {
			return new Instance(this.editor.parser, group_obj.get(PIPE_TYPE_AUTO));
		}
	}
}

PipeManager.PIPE_TYPE_SIMPLE = PIPE_TYPE_SIMPLE;
PipeManager.PIPE_TYPE_STRAIGHT = PIPE_TYPE_STRAIGHT;
PipeManager.PIPE_TYPE_MANIFOLD = PIPE_TYPE_MANIFOLD;
PipeManager.PIPE_TYPE_MANIFOLD4W = PIPE_TYPE_MANIFOLD4W;
PipeManager.PIPE_TYPE_NODE = PIPE_TYPE_NODE;
PipeManager.PIPE_TYPE_CABLE = PIPE_TYPE_CABLE;
PipeManager.PIPE_TYPE_AUTO = PIPE_TYPE_AUTO;

module.exports = PipeManager;