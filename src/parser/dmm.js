'use strict';
const Parser = require('./parser.js');
const lexer = require('./lexer.js');
const {CommentToken, SymbolToken, StringToken, NewlineToken} = require('./tokens.js');
const {Tile, Instance} = require('./dmm_instance.js');
const EventEmitter = require('events');
const crypto = require('crypto');
const {shuffle} = require('../utils.js');

let id_ctr = 0;

class DMM extends EventEmitter {
	/**
	 * 
	 * @param {Parser} context 
	 * @param {string} filename 
	 * @param {string|number} maxx 
	 * @param {number} [maxy]
	 * @param {number} [maxz]
	 * @param {boolean} [initialize_tiles] 
	 */
	constructor(context, filename, maxx, maxy, maxz, empty_tiles = false) {
		super();
		this.context = context;
		this.modified = false;
		this.filename = filename;
		this.z_levels = [];
		/** @type {"standard"|"tgm"|"maphash"} */
		this.format = "standard";
		this.is_crlf = true;
		this.original_keys = new Map();
		this.running_object_count = new Map();
		this.external_handle = null;
		this.tab_elem = null;

		this.undo_frames = [];
		this.redo_frames = [];
		this.undo_frame = [];

		this.last_change_index = ++id_ctr;

		this.mapwindow_x = 1;
		this.mapwindow_y = 1;
		this.mapwindow_z = 1;
		this.mapwindow_zoom = 1;
		this.mapwindow_log_zoom = 0;

		if(typeof maxx == "number") {
			this.maxx = maxx;
			this.maxy = maxy;
			this.maxz = maxz;
			for(let z = 0; z < maxz; z++) {
				let z_level = [];
				this.z_levels.push(z_level);
				for(let y = 0; y < maxy; y++) {
					let row = [];
					z_level.push(row);
					for(let x = 0; x < maxx; x++) {
						row.push(new Tile(this, x+1, y+1, z+1, undefined, empty_tiles));
					}
				}
			}
		} else {
			this.maxx = 0;
			this.maxy = 0;
			this.maxz = 0;
			let dmm_text = maxx;
			let grid_models = new Map();
			let key_len = 1;
			this.is_crlf = dmm_text.includes("\r");
			let pointer = new Parser.TokenPointer(lexer(filename, dmm_text)); // .dmm files don't get a preprocessor run.
			if(pointer.tokens[0] instanceof CommentToken) {
				let comment = pointer.tokens[0].value;
				if(comment.includes("dmm2tgm.py")) {
					this.format = "tgm";
				} else if(comment.includes("maphash")) {
					this.format = "maphash";
				}
			}
			let next = pointer.get_next();
			while(next) {
				if(next instanceof NewlineToken) {
					pointer.advance();
					next = pointer.get_next();
				} else if(next instanceof StringToken) {
					let key = next.value[0];
					key_len = key.length;
					pointer.advance();
					next = pointer.get_next();
					if(!(next instanceof SymbolToken && next.value == "=")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					if(!(next instanceof SymbolToken && next.value == "(")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					let model = [];
					while(next && !(next instanceof SymbolToken && next.value == ")")) {
						while(next instanceof NewlineToken) {
							pointer.advance();
							next = pointer.get_next();
						}
						if(model.length) {
							if(!(next instanceof SymbolToken && next.value == ",")) {
								throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
							}
							pointer.advance();
							next = pointer.get_next();
						}
						while(next instanceof NewlineToken) {
							pointer.advance();
							next = pointer.get_next();
						}
						let item = Parser.parse_primary(pointer).evaluate_constant();
						model.push(new Instance(this.context, item.path, item.vars));
						next = pointer.get_next();
						while(next instanceof NewlineToken) {
							pointer.advance();
							next = pointer.get_next();
						}
					}
					let back_to_string = "(" + model.join(",") + ")";
					if(this.original_keys.has(back_to_string)) {
						console.warn(`Duplicate key - ${back_to_string} is both ${key} and ${this.original_keys.get(back_to_string)}`);
					} else {
						this.original_keys.set(back_to_string, key);
					}
					if(!(next instanceof SymbolToken && next.value == ")")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					if(!(next instanceof NewlineToken)) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					if(!grid_models.has(key)) {
						grid_models.set(key, model);
					}
				} else if(next instanceof SymbolToken && next.value == "(") {
					pointer.advance();
					next = pointer.get_next();
					let init_x = +Parser.parse_expression(pointer).evaluate_constant();
					next = pointer.get_next();
					if(!(next instanceof SymbolToken && next.value == ",")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					let y = +Parser.parse_expression(pointer).evaluate_constant();
					next = pointer.get_next();
					if(!(next instanceof SymbolToken && next.value == ",")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					let z = +Parser.parse_expression(pointer).evaluate_constant();
					next = pointer.get_next();
					if(!(next instanceof SymbolToken && next.value == ")")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					if(!(next instanceof SymbolToken && next.value == "=")) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					pointer.advance();
					next = pointer.get_next();
					if(!(next instanceof StringToken)) throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
					let lines = next.value[0].trim().split(/\r?\n/g);
					pointer.advance();
					next = pointer.get_next();
					let z_level = this.z_levels[z-1];
					if(!z_level) {
						z_level = [];
						this.z_levels[z-1] = z_level;
					}
					this.maxz = Math.max(this.maxz, z);
					for(let line of lines) {
						line = line.trim();
						if(!line.length) continue;
						this.maxy = Math.max(this.maxy, y);
						let row = z_level[y-1];
						if(!row) {
							row = [];
							z_level[y-1] = row;
						}
						let x = init_x;
						for(let i = 0; i < line.length; i += key_len) {
							let orig_model = grid_models.get(line.substring(i, i + key_len));
							if(!orig_model) console.error("Key " + line.substring(i, i + key_len) + " does not exist!");
							let model = [];
							for(let item of orig_model) {
								model.push(item.copy());
								//model.push(item);
							}
							row[x-1] = new Tile(this, 0, 0, 0, model, true);
							this.maxx = Math.max(this.maxx, x);
							x++;
						}
						y++;
					}
				} else {
					throw new Error(`Unexpected ${next} at ${next.format_pos()}`);
				}
			}
			for(let z_level of this.z_levels) {
				z_level.reverse(); // origin is bottom left.
			}
			for(let [x,y,z] of this.all_coordinates()) {
				let tile = this.get_tile(x, y, z);
				tile.x = x;
				tile.y = y;
				tile.z = z;
			}
		}
	}

	/** @param {string} instance_string */
	handle_instance_added(instance_string, amount = 1) {
		let count = this.running_object_count.get(instance_string) || 0;
		count += amount;
		if(count <= 0)
			this.running_object_count.delete(instance_string);
		else
			this.running_object_count.set(instance_string, count);
		this.emit("instance_added", instance_string, amount);
	}

	/** @param {string} instance_string */
	handle_instance_removed(instance_string, amount = 1) {
		let count = this.running_object_count.get(instance_string) || 0;
		count -= amount;
		if(count <= 0)
			this.running_object_count.delete(instance_string);
		else
			this.running_object_count.set(instance_string, count);
		this.emit("instance_removed", instance_string, amount);
	}

	push_undo() {
		if(this.undo_frame.length) {
			this.undo_frames.push(this.undo_frame);
			this.undo_frame = [];
			this.redo_frames.length = 0;
		}
	}

	undo() {
		this.push_undo();
		if(this.undo_frames.length <= 0) return;
		let frame = this.undo_frames.pop();
		this.do_undo_frame(frame);
		if(this.undo_frame && this.undo_frame.length) {
			this.redo_frames.push(this.undo_frame);
			this.undo_frame = [];
		}
	}

	redo() {
		if(this.redo_frames.length) {
			let frame = this.redo_frames.pop();
			this.do_undo_frame(frame);
			if(this.undo_frame && this.undo_frame.length) {
				this.undo_frames.push(this.undo_frame);
				this.undo_frame = [];
			}
		}
	}

	do_undo_frame(frame) {
		for(let i = frame.length-1; i >= 0; i--) {
			frame[i][1].apply(frame[i][0], frame[i].slice(2));
		}
	}

	resize(maxx, maxy, maxz) {
		for(let z = 0; z < maxz; z++) {
			let z_level;
			if(this.z_levels.length > z) {
				z_level = this.z_levels[z];
			} else {
				z_level = [];
				this.z_levels.push(z_levels);
			}
			for(let y = 0; y < maxy; y++) {
				let row;
				if(z_level.length > y) {
					row = z_level[y];
				} else {
					row = [];
					z_level.push(row);
				}
				for(let x = row.length; x < maxx; x++) {
					row.push(new Tile(this, x+1, y+1, z+1, undefined, false));
				}
				row.length = maxx;
			}
			z_level.length = maxy;
		}
		this.z_levels.length = maxz;
		this.maxx = maxx;
		this.maxy = maxy;
		this.maxz = maxz;
		if(this.mapwindow_x > maxx) this.mapwindow_x = maxx;
		if(this.mapwindow_y > maxy) this.mapwindow_y = maxy;
		if(this.mapwindow_z > maxz) this.mapwindow_z = maxz;
		this.undo_frames.length = 0;
		this.redo_frames.length = 0;
		this.undo_frame = [];
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} z 
	 * @returns {Tile}
	 */
	get_tile(x,y,z) {
		if(x < 1 || y < 1 || z < 1) return undefined;
		if(x > this.maxx || y > this.maxy || z > this.maxz) return undefined;
		return this.z_levels[z-1][y-1][x-1];
	}

	* all_coordinates() {
		for(let z = 1; z <= this.maxz; z++) {
			for(let y = 1; y <= this.maxy; y++) {
				for(let x = 1; x <= this.maxx; x++) {
					yield [x,y,z];
				}
			}
		}
	}

	toString(format = this.format) {
		let out = "";
		let instance_keys = new Map();
		if(format == "tgm") out += "//MAP CONVERTED BY dmm2tgm.py THIS HEADER COMMENT PREVENTS RECONVERSION, DO NOT REMOVE\n";
		else if(format == "maphash") out += "// This map has been converted using maphash\n";

		if(format == "maphash") {
			let instance_strings = new Map();
			for(let [x,y,z] of this.all_coordinates()) {
				let str = this.get_tile(x,y,z).toString();
				instance_strings.set(str, (instance_strings.get(str) || 0) + 1);
			}
			let key_len = 1;
			while(instance_strings.size > 52**key_len)
				key_len++;
			let used_keys = new Set();

			let collision_arr = [];
			let instance_string_comparator = (a,b) => {
				// Instances with more occurences get higher precedence.
				// This is to prevent situations where a hash conflict causes the hash of something like
				// (/turf/open/space/basic,/area/space) occuring and re-keying the entire space area.
				if(a[1] == b[1]) return b[1] - a[1];
				return a[0] > b[0] ? 1 : (a[0] < b[0] ? -1 : 0);
			};
			for(let [str] of [...instance_strings].sort(instance_string_comparator)) {
				let key;
				let i;
				for(i = 0; i < 10000; i++) {
					let hash_num = parseInt(crypto.createHash('sha1').update((str).substring(1, str.length - 1) + i, 'utf8').digest('hex').substring(0, 4), 16);
					let hash_key = number_to_key(hash_num);
					if(!used_keys.has(hash_key) && hash_num < 65535) {
						key = hash_key;
						break;
					}
				}
				used_keys.add(key);
				collision_arr[i] = (collision_arr[i] || 0) + 1;
				if(!key) throw new Error('Could not find a key');
				instance_keys.set(str, key);
			}
			for(let i = 1; i < collision_arr.length; i++) {
				if(collision_arr[i]) {
					console.log(collision_arr[i] + " " + i + "x collisions")
				}
			}
			for(let [str, key] of [...instance_keys].sort((a,b) => {return compare_keys(a[1],b[1]);})) {
				out += `"${key}" = ${str}\n`;
			}
			out += '\n';
		} else {
			let instance_strings = new Set();
			let original_keys_used = new Set();
			for(let [x,y,z] of this.all_coordinates()) {
				let tile = this.get_tile(x,y,z);
				instance_strings.add(tile.toString(format == "tgm"));
				if(this.original_keys.has(tile.toString(false))) {
					let key = this.original_keys.get(tile.toString(false));
					original_keys_used.add(key);
					instance_keys.set(tile.toString(format == "tgm"), key);
				}
			}
			console.log(`Using ${original_keys_used.size}/${this.original_keys.size} original keys`);
			let key_len = original_keys_used.size ? [...original_keys_used][0].length : 1;
			while(instance_strings.size > 52**key_len) {
				key_len++;
				original_keys_used = new Set([...original_keys_used].map(item => {return "a" + item}));
				instance_keys = new Map([...instance_keys].map(item => {return [item[0], "a"+item[1]]}));
			}
			let keys = [];
			let max_key = Math.min(0xFFFF, 52 ** key_len);
			for(let i = 0; i < max_key; i++) {
				let key = number_to_key(i, key_len);
				if(!original_keys_used.has(key)) {
					keys.push(key);
				}
			}
			shuffle(keys);
			console.log(keys);
			let keygen = keys[Symbol.iterator]();
			let new_key_amt = 0;
			for(let str of instance_strings) {
				let key = instance_keys.get(str) || keygen.next().value;
				if(instance_keys.has(str)) continue;
				instance_keys.set(str, key);
				new_key_amt++;
			}
			let sorted_keys = [...instance_keys].sort((a, b) => {return compare_keys(a[1], b[1]);});
			for(let [str, key] of sorted_keys) {
				out += `"${key}" = ${str}\n`;
			}
			console.log(`Using ${new_key_amt} new keys`);
			out += '\n';
		}

		for(let z = 1; z <= this.maxz; z++) {
			if(format == "tgm" || format == "maphash") {
				for(let x = 1; x <= this.maxx; x++) {
					out += `(${x},1,${z}) = {"\n`;
					for(let y = this.maxy; y >= 1; y--) {
						let key = instance_keys.get(this.get_tile(x,y,z).toString(format == "tgm"));
						if(!key) {
							console.error(instance_keys);
							throw new Error("Instance " + this.get_tile(x,y,z).toString(format == "tgm") + " doesn't exist!");
						}
						out += key;
						out += '\n';
					}
					out += `"}\n`;
				}
			} else {
				out += `(1,1,${z}) = {"\n`;
				for(let y = this.maxy; y >= 1; y--) {
					for(let x = 1; x <= this.maxx; x++) {
						out += instance_keys.get(this.get_tile(x,y,z).toString(format == "tgm"));
					}
					out += `\n`;
				}
				out += `"}\n`;
			}
			if(z != this.maxz) out += "\n";
		}
		out = out.replace(/\r?\n/g, this.is_crlf ? "\r\n" : "\n"); // make sure the line endings are peachy
		return out;
	}

	// filename thingy works whether there is a / or not because -1 + 1 = 0 or beginning of string.
	download(filename = this.filename.substring(this.filename.indexOf("/") + 1)) {
		let str = this.toString();
		let blob = new Blob([str], {type: "text/plain"});
		let a = document.createElement("a");
		let url = URL.createObjectURL(blob);
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => {
			URL.revokeObjectURL(url);
		}, 1000);
	}
}

DMM.Tile = Tile;
DMM.Instance = Instance;

function number_to_key(num, key_len = 3) {
	let arr = [];
	for(let i = 0; i < key_len; i++) {
		let num_thing = (num % 52);
		if(num_thing < 26) arr.push(String.fromCharCode(97 + num_thing));
		else arr.push(String.fromCharCode(65-26+num_thing));
		num = Math.floor(num / 52);
	}
	return arr.reverse().join("");
}

function key_to_number(key) {
	let num = 0;
	for(let i = 0; i < key.length; i++) {
		num *= 52;
		let c = key[i];
		if(c >= 'a' && c <= 'z') {
			num += (c.charCodeAt(0) - 'a'.charCodeAt(0));
		} else {
			num += (c.charCodeAt(0) - 'A'.charCodeAt(0)) + 26;
		}
	}
	return num;
}

function compare_keys(a, b) {
	return key_to_number(a) - key_to_number(b);
}

module.exports = DMM;