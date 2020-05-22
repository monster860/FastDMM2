'use strict';

const byond_stringify = require('./stringify.js');
const Appearance = require('../rendering/appearance.js');
const Parser = require('./parser.js');
const parse_color = require('color-parser');
let id_ctr = 0;

const error_appearance = new Appearance({
	icon: '_fastdmm_interface.dmi',
	icon_state: 'error'
});

const INSTANCE_VAR_DEFAULT = Symbol('INSTANCE_VAR_DEFAULT');
const INSTANCE_VAR_KEEP = Symbol('INSTANCE_VAR_KEEP');

const set_instance_vars_mixin = {var_overrides: new Map(Object.entries({INSTANCE_VAR_DEFAULT, INSTANCE_VAR_KEEP}))}

class Instance {
	constructor(context, type = "/obj", init_vars) {
		this.context = context;
		if(type instanceof Instance) {
			this.vars = new Map(type.vars);
			type = type.type;
		} else {
			this.vars = new Map();
			if(type.includes("{")) {
				let parsed = Parser.eval_text(type);
				type = parsed.path;
				init_vars = parsed.vars;
			}
		}
		this.type = type;
		/** @type {import("./typedef")} */
		this.type_obj = null;
		if(context && context.types.has(type)) {
			this.type_obj = context.types.get(type);
		}
		if(init_vars) {
			for(let [k,v] of (init_vars instanceof Map ? init_vars : Object.entries(init_vars))) {
				this.vars.set(k,v);
			}
		}
		this.cached_appearance = null;

		this.cached_hidden = false;
		this.cached_hidden_cache_index = -1;
		this.id = ++id_ctr;

		this.update_vars();
		Object.seal(this);
	}

	toString(tgm = false) {
		let encoded_vars = [];
		for(let [key, val] of [...this.vars].sort((a,b) => {return a[0] > b[0] ? 1 : -1;})) {
			encoded_vars.push(key + " = " + byond_stringify(val));
		}
		if(encoded_vars.length) {
			if(tgm) {
				return `${this.type}{\n\t${encoded_vars.join(";\n\t")}\n\t}`;
			} else {
				return `${this.type}{${encoded_vars.join("; ")}}`;
			}
		} else {
			return this.type;
		}
	}

	istype(t, strict = false) {
		if(this.type == t)
			return true;
		if(!strict && this.type_obj && this.type_obj.istype(t))
			return true;
		if(!strict && !this.type_obj && this.type.startsWith(t + "/"))
			return true;
		return false;
	}

	get_var(key) {
		if(this.vars.has(key)) return this.vars.get(key);
		if(this.type_obj) return this.type_obj.get_var(key);
	}

	/** DO NOT MODIFY INSTANCES AFTER PUTTING THEM ON THE MAP, IT FUCKS UP THE UNDO - MAKE NEW ONE INSTEAD. */
	set_var(key, val) {
		this.vars.set(key, val);
		this.cached_appearance = null;
	}
	eval_var(context, key) {
		return this.get_var(key);
	}

	make_eval_context() {
		return {types: this.context.types, src: this};
	}

	copy() {
		return new Instance(this.context, this.type, this.vars);
	}

	get_appearance() {
		if(!this.type_obj) return error_appearance;
		if(!this.cached_appearance) {
			let icon = this.get_var("icon");
			let alpha = this.get_var("alpha");
			let color = this.get_var("color");
			let plane = this.get_var("plane") << 16 >> 16;
			if(plane > 10000 || plane < -10000) {
				plane = (plane - -32767) << 16 >> 16;
			}
			if(alpha == null) alpha = 1;
			else alpha /= 255;
			if(typeof color == "string" && color != "") {
				let parsed = parse_color(color);
				if(parsed) {
					color = [parsed.r/255, parsed.g/255, parsed.b/255];
					if(parsed.a != null)
						alpha *= parsed.a;
				} else {
					console.warn("Cannot parse " + color);
					color = [1,1,1];
				}
			} else {
				color = [1,1,1];
			}
			this.cached_appearance = new Appearance({
				icon: icon ? icon.file : null,
				icon_state: this.get_var("icon_state"),
				dir: this.get_var("dir") & 0xF,
				color,
				layer: +this.get_var("layer") || 0,
				plane,
				pixel_x: this.get_var("pixel_x") << 16 >> 16,
				pixel_y: this.get_var("pixel_y") << 16 >> 16,
				pixel_w: this.get_var("pixel_w") << 16 >> 16,
				pixel_z: this.get_var("pixel_z") << 16 >> 16,
				alpha
			});
		}
		return this.cached_appearance;
	}

	/**
	 */
	get_fastdmm_prop(key, eval_context = undefined) {
		if(this.type_obj) return this.type_obj.get_fastdmm_prop(key, eval_context);
	}
	get_fastdmm_macros(name, parent_first = false) {
		if(this.type_obj) return this.type_obj.get_fastdmm_macros(name, parent_first);
		return [];
	}

	update_vars() {
		let eval_context;
		let touched_vars = [];
		for(let macro of this.get_fastdmm_macros('set_instance_vars', false)) {
			for(let i = 0; i < macro.args.length; i++) {
				let varname = macro.arg_names[i];
				if(!varname || touched_vars.includes(varname)) continue;
				touched_vars.push(varname);
				if(!eval_context) {
					eval_context = this.make_eval_context();
					Object.assign(eval_context, set_instance_vars_mixin);
				}
				let value = macro.args[i].evaluate_constant(eval_context);
				if(value == INSTANCE_VAR_KEEP) {
					continue;
				} if(value == INSTANCE_VAR_DEFAULT) {
					this.vars.delete(varname);
				} else {
					this.vars.set(varname, value);
				}
			}
		}
	}
}

class Tile {
	/**
	 * 
	 * @param {import("./dmm")} dmm 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} z 
	 * @param {Array<Instance>} [contents]
	 * @param {boolean} [allow_empty]
	 */
	constructor(dmm, x, y, z, contents = [], allow_empty = false) {
		this.dmm = dmm;
		this.x = x;
		this.y = y;
		this.z = z;
		/** Do not modify directly or you will break undo. */
		this.contents = contents;
		if(!this.contents.length && !allow_empty) {
			let turf_type = this.dmm.context.types.get("/world").get_var("turf");
			let area_type = this.dmm.context.types.get("/world").get_var("area");
			this.contents.push(new Instance(this.dmm.context, turf_type ? turf_type.path : "/turf"));
			this.contents.push(new Instance(this.dmm.context, area_type ? area_type.path : "/area"));
		}
		for(let item of this.contents) {
			this.dmm.handle_instance_added(item.toString());
		}
		this.id = ++id_ctr;
		this.area_frame_appearance = undefined;
	}
	[Symbol.iterator]() {
		return this.contents[Symbol.iterator]();
	}

	get_step(dir) {
		let x = this.x;
		let y = this.y;
		let z = this.z;
		if(dir & 1) y++;
		if(dir & 2) y--;
		if(dir & 4) x++;
		if(dir & 8) x--;
		return this.dmm.get_tile(x, y, z);
	}

	/**
	 * 
	 * @param {Instance} other 
	 * @param {boolean} [cardinal_only]
	 */
	get_dir(other, cardinal_only = false) {
		let dir = 0;
		if(other) {
			if(cardinal_only) {
				let dx = other.x - this.x;
				let dy = other.y - this.y;
				if(dx > Math.abs(dy)) return 4;
				else if(dx < -Math.abs(dy)) return 8;
				else if(dy > 0) return 1;
				else if(dy < 0) return 2;
			} else {
				if(other.x > this.x) dir |= 4;
				if(other.x < this.x) dir |= 8;
				if(other.y > this.y) dir |= 1;
				if(other.y < this.y) dir |= 2;
			}
		}
		return dir;
	}

	/**
	 * 
	 * @param {string} type 
	 * @param {boolean} strict 
	 * @returns {Instance}
	 */
	locate(type,strict = false) {
		for(let inst of this.contents) {
			if(strict ? inst.type == type : inst.istype(type)) {
				return inst;
			}
		}
	}
	/**
	 * @returns {Instance}
	 */
	get_turf() {return this.locate("/turf");}
	/**
	 * @returns {Instance}
	 */
	get_area() {return this.locate("/area");}
	/**
	 * 
	 * @param {Instance|string} inst 
	 */
	set_turf(inst) {
		if(typeof inst == "string") inst = new Instance(this.dmm.context, inst);
		let turf_index = -1;
		let area_index = -1;
		for(let i = 0; i < this.contents.length; i++) {
			if(this.contents[i].istype("/turf")) turf_index = i;
			if(this.contents[i].istype("/area")) area_index = i;
		}
		if(turf_index != -1) {
			this.replace_object(turf_index, inst);
		} else if(area_index != -1) {
			this.splice(area_index, 0, inst);
		} else {
			this.push(inst);
		}
	}
	/**
	 * 
	 * @param {Instance|string} inst 
	 */
	set_area(inst) {
		if(typeof inst == "string") inst = new Instance(this.dmm.context, inst);
		let turf_index = -1;
		let area_index = -1;
		for(let i = 0; i < this.contents.length; i++) {
			if(this.contents[i].istype("/turf")) turf_index = i;
			if(this.contents[i].istype("/area")) area_index = i;
		}
		if(area_index != -1) {
			this.replace_object(area_index, inst);
		} else if(turf_index != -1) {
			this.splice(turf_index+1, 0, inst);
		} else {
			this.push(inst);
		}
	}
	/**
	 * 
	 * @param {Instance|string} inst 
	 */
	add_object(inst) {
		if(typeof inst == "string") inst = new Instance(this.dmm.context, inst);
		let insert_index = -1;
		for(let i = 0; i < this.contents.length; i++) {
			let type = this.contents[i].type;
			if(type.startsWith("/turf") || type.startsWith("/area")) {
				insert_index = i;
				break;
			}
		}
		if(insert_index != -1) {
			this.splice(insert_index, 0, inst);
		} else {
			this.push(inst);
		}
	}
	/**
	 * 
	 * @param {Instance|string} inst 
	 */
	place(inst) {
		if(typeof inst == "string") inst = new Instance(this.dmm.context, inst);
		if(inst.istype("/turf")) {
			this.set_turf(inst);
		} else if(inst.istype("/area")) {
			this.set_area(inst);
		} else {
			this.add_object(inst);
		}
	}
	/**
	 * 
	 * @param {Instance} inst 
	 */
	delete(inst) {
		let index = this.contents.indexOf(inst);
		if(index == -1) return;
		if(inst == this.get_turf()) {
			let turf_type = this.dmm.context.types.get("/world").get_var("turf");
			this.set_turf(turf_type ? turf_type.path : "/turf");
		} else if(inst == this.get_area()) {
			let area_type = this.dmm.context.types.get("/world").get_var("area");
			this.set_area(area_type ? area_type.path : "/area");
		} else {
			this.splice(index, 1);
		}
	}
	push(item) {
		this.dmm.modified = true;
		this.dmm.undo_frame.push([this, this.pop]);
		this.dmm.last_change_index = ++id_ctr;
		this.dmm.handle_instance_added(""+item);
		if(item.istype("/area")) this.area_dirty();
		return this.contents.push(item);
	}
	pop() {
		this.dmm.modified = true;
		if(!this.contents.length) throw new Error("Cannot pop empty contents for tile");
		let popped = this.contents.pop();
		this.dmm.undo_frame.push([this, this.push, this.popped]);
		this.dmm.last_change_index = ++id_ctr;
		this.dmm.handle_instance_removed(""+popped);
		if(popped.istype("/area")) this.area_dirty();
		return popped;
	}
	splice(index, amount, ...to_insert) {
		this.dmm.modified = true;
		if(index < 0) throw new Error("Negative splice index");
		if(index > this.contents.length) index = this.contents.length;
		if(amount < 0) throw new Error("Negative splice amount");
		for(let item of to_insert) {
			this.dmm.handle_instance_added(""+item);
			if(item.istype("/area")) this.area_dirty();
		}
		let removed = this.contents.splice(index, amount, ...to_insert);
		for(let item of removed) {
			this.dmm.handle_instance_removed(""+item);
			if(item.istype("/area")) this.area_dirty();
		}
		
		this.dmm.undo_frame.push([this, this.splice, index, to_insert.length, ...removed]);
		this.dmm.last_change_index = ++id_ctr;
		return removed;
	}
	replace_object(index, inst) {
		this.dmm.modified = true;
		if(this.index < 0 || this.index >= this.contents.length) throw new Error(`Cannot set index ${index} of tile ${x},${y},${z} with only ${this.contents.length} elements`);
		this.dmm.handle_instance_added(""+inst);
		if(inst.istype("/area")) this.area_dirty();
		this.dmm.handle_instance_removed(""+this.contents[index]);
		if(this.contents[index].istype("/area")) this.area_dirty();
		this.dmm.undo_frame.push([this, this.replace_object, index, this.contents[index]]);
		this.dmm.last_change_index = ++id_ctr;
		this.contents[index] = inst;
	}
	toString(tgm = false) {
		let text = "(";
		for(let i = 0; i < this.contents.length; i++) {
			if(i != 0) text += ",";
			if(tgm) text += "\n";
			text += this.contents[i].toString(tgm);
		}
		text += ")";
		return text;
	}

	area_dirty() {
		this.area_frame_appearance = undefined;
		for(let i = 0; i < 4; i++) {
			let dir = 1 << i;
			let other = this.get_step(dir);
			if(other) other.area_frame_appearance = undefined;
		}
	}
	get_frame_appearance() {
		if(this.area_frame_appearance !== undefined) return this.area_frame_appearance;
		let area = this.get_area();
		let num = 0;
		for(let i = 0; i < 4; i++) {
			let dir = 1 << i;
			let other = this.get_step(dir);
			if(!other) {
				num |= dir;
				continue;
			}
			let other_area = other.get_area();
			if(other_area.toString() != area.toString()) {
				num |= dir;
			}
		}
		return (this.area_frame_appearance = frame_appearances[num]);
	}
}

const frame_appearances = [null];
for(let i = 1; i < 16; i++) {
	frame_appearances.push(new Appearance({
		icon: '_fastdmm_interface.dmi',
		icon_state: ""+i,
		layer: 100,
		plane: 100000,
		alpha: 0.5
	}));
}
frame_appearances[0] = null;

module.exports = {Tile, Instance};