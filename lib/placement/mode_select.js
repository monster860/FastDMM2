'use strict';
const PlacementMode = require('./_mode.js');
const PlacementHandler = require('./_handler.js');
const DMM = require('../parser/dmm.js');
const {Tile, Instance} = require('../parser/dmm.js');
const Appearance = require('../rendering/appearance.js');
const RenderInstance = require('../render_instance.js');
const {draw_box} = require('../utils.js');

/** @typedef {"replace"|"add"|"subtract"} SelectMode */

class HandlerSelect extends PlacementHandler {
	mousedown(tile, select_tool, select_mode) {
		/** @type {PlacementModeSelect} */
		this.select_tool = select_tool;
		/** @type {SelectMode} */
		this.select_mode = select_mode;
		
		if(this.select_mode == "replace") {
			let info = this.select_tool.get_selection_info(this.dmm);
			info.tiles.clear();
			info.tiles_vis.clear();
		}

		this.tile_a = tile;
		this.tile_b = tile;
	}
	mousemove(tile) {
		if(tile.dmm != this.dmm) return;
		this.tile_b = tile;
	}
	mouseup() {
		let selection_info = this.select_tool.get_selection_info(this.dmm);
		selection_info.tiles_vis.clear();
		let minz = Math.min(this.tile_a.z, this.tile_b.z);
		let miny = Math.min(this.tile_a.y, this.tile_b.y);
		let minx = Math.min(this.tile_a.x, this.tile_b.x);
		let maxz = Math.max(this.tile_a.z, this.tile_b.z);
		let maxy = Math.max(this.tile_a.y, this.tile_b.y);
		let maxx = Math.max(this.tile_a.x, this.tile_b.x);
		if(this.select_mode == "replace") selection_info.tiles.clear();
		for(let z = minz; z <= maxz; z++) {
			for(let y = miny; y <= maxy; y++) {
				for(let x = minx; x <= maxx; x++) {
					let tile = this.dmm.get_tile(x, y, z);
					if(!tile) continue;
					if(this.select_mode == "subtract") {
						selection_info.tiles.delete(tile);
					} else {
						selection_info.tiles.add(tile);
					}
				}
			}
		}
		
	}
	visualize(instances) {
		draw_box(instances, selection_appearances, this.tile_a, this.tile_b);
	}
	dx() {
		return this.curr_mouse_tile ? this.curr_mouse_tile.x - this.mouse_tile.x : 0;
	}
	dy() {
		return this.curr_mouse_tile ? this.curr_mouse_tile.y - this.mouse_tile.y : 0;
	}
	get_status_text() {
		let x1 = this.tile_a.x;
		let y1 = this.tile_a.y;
		let z1 = this.tile_a.z;
		let x2 = this.tile_b.x;
		let y2 = this.tile_b.y;
		let z2 = this.tile_b.z;
		return `${Math.abs(x2-x1) + 1}x${Math.abs(y2-y1) + 1}x${Math.abs(z2-z1) + 1} (${x1},${y1},${z1})-(${x2},${y2},${z2})`;
	}
}

class HandlerMoveSelection extends PlacementHandler {
	mousedown(tile, selection_info) {
		/** @type {SelectionInfo} */
		this.selection_info = selection_info;
		this.last_tile = tile;
	}
	mousemove(tile) {
		if(tile.dmm != this.dmm) return;
		let dx = tile.x - this.last_tile.x;
		let dy = tile.y - this.last_tile.y;
		let dz = tile.z - this.last_tile.z;
		this.selection_info.float_offset_x += dx;
		this.selection_info.float_offset_y += dy;
		this.selection_info.float_offset_z += dz;
		this.last_tile = tile;
	}
}

class PlacementModeSelect extends PlacementMode {
	constructor(editor) {
		super(editor);

		/** @type {WeakMap<DMM, SelectionInfo>} */
		this.selection_info_map = new WeakMap();
	}

	update_is_pixel() {this.is_pixel = false;}

	get_handler(e, tile, type) {
		let selection_info = this.get_selection_info(tile.dmm);
		if(selection_info.tiles.has(tile) && !e.ctrlKey == !e.shiftKey) {
			selection_info.float(e.ctrlKey && e.shiftKey ? this.editor.objtree_window.hidden_set : null, true);
		}
		if(selection_info.float_dmm) {
			let float_tile = selection_info.float_dmm.get_tile(tile.x - selection_info.float_offset_x, tile.y - selection_info.float_offset_y, tile.z - selection_info.float_offset_z);
			if(float_tile) {
				return new HandlerMoveSelection(this.editor, tile, type, selection_info);
			}
		}
		if(selection_info.float_dmm) selection_info.anchor();
		return new HandlerSelect(this.editor, tile, type, this, e.ctrlKey ? "subtract" : (e.shiftKey ? "add" : "replace"));
	}

	visualize(instances) {
		let selection_info = this.selection_info_map.get(this.editor.dmm);
		if(!selection_info) return;
		if(selection_info.float_dmm) {
			for(let [x,y,z] of selection_info.float_dmm.all_coordinates()) {
				let tile = selection_info.float_dmm.get_tile(x,y,z);
				for(let instance of tile) {
					let appearance = instance.get_appearance();
					if(!appearance) continue;
					instances.push(new RenderInstance(appearance, x + selection_info.float_offset_x, y + selection_info.float_offset_y, z + selection_info.float_offset_z, tile, instance, true)); // detect clicks for memes or some shizz I guess
				}
			}
			if(!selection_info.float_tiles_vis.size) {
				for(let tile of selection_info.float_tiles) {
					let state = 15;
					for(let dir of [1,2,4,8]) {
						let enemy = tile.get_step(dir);
						if(enemy && selection_info.float_tiles.has(enemy)) {
							state &= ~dir;
						}
					}
					selection_info.float_tiles_vis.set(tile, state);
				}
			}
			for(let [tile, state] of selection_info.float_tiles_vis) {
				if(state == 0) continue;
				instances.push(new RenderInstance(selection_appearances[state], tile.x + selection_info.float_offset_x, tile.y + selection_info.float_offset_y, tile.z + selection_info.float_offset_z));
			}
			return;
		}
		if(!selection_info.tiles_vis.size) {
			for(let tile of selection_info.tiles) {
				let state = 15;
				for(let dir of [1,2,4,8]) {
					let enemy = tile.get_step(dir);
					if(enemy && selection_info.tiles.has(enemy)) {
						state &= ~dir;
					}
				}
				selection_info.tiles_vis.set(tile, state);
			}
		}
		for(let [tile, state] of selection_info.tiles_vis) {
			if(state == 0) continue;
			instances.push(new RenderInstance(selection_appearances[state], tile.x, tile.y, tile.z));
		}
	}

	get_selection_info(dmm) {
		if(!this.selection_info_map.has(dmm)) {
			let info = new SelectionInfo(dmm);
			this.selection_info_map.set(dmm, info);
			return info;
		}
		return this.selection_info_map.get(dmm);
	}
	handle_hotkey(e) {
		let dmm = this.editor.dmm;
		let info = this.selection_info_map.get(dmm);
		if(!info) return;
		if(e.code == "Delete") {
			if(!info.float_dmm) {
				info.float(e.shiftKey ? this.editor.objtree_window.hidden_set : null);
			}
			info.float_dmm = null;
			this.editor.map_window.draw_dirty = true;
			return true;
		} else if(e.code == "KeyC" && e.ctrlKey) {
			let dmm = info.float_dmm;
			if(!dmm) {
				info.float(e.ctrlKey && e.shiftKey ? this.editor.objtree_window.hidden_set : null, false);
				dmm = info.float_dmm;
				info.float_dmm = null;
			}
			if(!dmm) return true;
			navigator.clipboard.writeText(dmm.toString());
			return true;
		} else if(e.code == "KeyX" && e.ctrlKey) {
			let dmm = info.float_dmm;
			if(!dmm) {
				info.float(e.ctrlKey && e.shiftKey ? this.editor.objtree_window.hidden_set : null, true);
				dmm = info.float_dmm;
			}
			if(!dmm) return true;
			info.float_dmm = null;
			navigator.clipboard.writeText(dmm.toString());
			return true;
		}
		return false;
	}
	handle_global_hotkey(e) {
		if(e.code == "KeyV" && e.ctrlKey) {
			navigator.clipboard.readText().then(text => {
				let dmm = this.editor.dmm;
				if(!dmm) return;
				let info = this.get_selection_info(dmm);
				let float_dmm = new DMM(this.editor.parser, undefined, text);
				if(!float_dmm) return;
				if(info.float_dmm) {
					info.anchor();
				}
				info.tiles.clear();
				info.tiles_vis.clear();
				info.float_dmm = float_dmm;
				info.update_float_tiles();
				info.float_offset_x = Math.round(this.editor.map_window.mouse_x || dmm.mapwindow_x) - Math.floor(float_dmm.maxx / 2);
				info.float_offset_y = Math.round(this.editor.map_window.mouse_y || dmm.mapwindow_y) - Math.floor(float_dmm.maxy / 2);
				info.float_offset_z = Math.round(this.editor.map_window.mouse_z || dmm.mapwindow_z) - float_dmm.maxz;
				this.editor.map_window.draw_dirty = true;
				if(this.editor.placement_mode != this)this.editor.set_placement_mode(this);
			});
			return true;
		}
		return false;
	}
	unselect_tool() {
		for(let dmm of this.editor.dmm_tabs) {
			let info = this.selection_info_map.get(dmm);
			if(info) {
				info.anchor();
			}
		}
	}
}
PlacementModeSelect.fa_icon = "fa-vector-square";
PlacementModeSelect.description = "Select";
PlacementModeSelect.usage = `Click/Drag - Select / Drag Selection
Ctrl-Shift-Click/Drag - Drag selection (visible only)
Shift-Click/Drag - Add To Selection
Ctrl-Click/Drag - Remove From Selection
Ctrl-C - Copy
Ctrl-Shift-C - Copy (visible only)
Ctrl-X - Cut
Ctrl-Shift-X - Cut (visible only)
Ctrl-V - Paste
Delete - Delete
Shift-Delete - Delete (visible only)`;
PlacementModeSelect.uses_instance_panel = false;

class SelectionInfo {
	/**
	 * 
	 * @param {DMM} dmm 
	 */
	constructor(dmm) {
		this.dmm = dmm;
		/** @type {DMM} */
		this.float_dmm = null;
		this.float_offset_x = 0;
		this.float_offset_y = 0;
		this.float_offset_z = 0;
		/** @type {Set<Tile>} */
		this.float_tiles = new Set();
		/** @type {Map<Tile, number>} */
		this.float_tiles_vis = new Map();
		/** @type {Set<Tile>} */
		this.tiles = new Set();
		/** @type {Map<Tile, number>} */
		this.tiles_vis = new Map();
	}

	float(exclusion_set = null, do_delete = true) {
		if(this.float_dmm) {
			this.anchor();
		}
		if(!this.tiles.size) return;
		let minx=Infinity, miny=Infinity, minz=Infinity, maxx=0, maxy=0, maxz=0;
		for(let tile of this.tiles) {
			minx = Math.min(tile.x,minx);
			miny = Math.min(tile.y,miny);
			minz = Math.min(tile.z,minz);
			maxx = Math.max(tile.x,maxx);
			maxy = Math.max(tile.y,maxy);
			maxz = Math.max(tile.z,maxz);
		}
		this.float_offset_x = minx - 1;
		this.float_offset_y = miny - 1;
		this.float_offset_z = minz - 1;
		this.float_dmm = new DMM(this.dmm.context, undefined, maxx - minx + 1, maxy - miny + 1, maxz - minz + 1, true);
		this.float_dmm.is_crlf = this.dmm.is_crlf;
		this.float_dmm.format = this.dmm.format;
		for(let tile of this.tiles) {
			let float_tile = this.float_dmm.get_tile(tile.x - this.float_offset_x, tile.y - this.float_offset_y, tile.z - this.float_offset_z);
			for(let instance of [...tile.contents]) {
				if(exclusion_set && exclusion_set.has(instance.type)) {
					continue;
				}
				if(do_delete) {
					tile.delete(instance); // this is not very performance friendly but meh unless you have a shitton of objects on one tile you'll be fine.
				}
				float_tile.push(instance);
			}
		}
		if(do_delete) {
			this.tiles.clear();
			this.tiles_vis.clear();
		}
		this.update_float_tiles();
	}

	update_float_tiles() {
		this.float_tiles.clear();
		this.float_tiles_vis.clear();
		if(!this.float_dmm) return;
		for(let [x,y,z] of this.float_dmm.all_coordinates()) {
			let tile = this.float_dmm.get_tile(x,y,z);
			if(tile.contents.length) this.float_tiles.add(tile);
		}
	}

	anchor() {
		if(!this.float_dmm) return;
		for(let [x,y,z] of this.float_dmm.all_coordinates()) {
			let float_tile = this.float_dmm.get_tile(x,y,z);
			let tile = this.dmm.get_tile(x+this.float_offset_x,y+this.float_offset_y,z+this.float_offset_z);
			if(!tile) continue;
			for(let instance of float_tile) {
				tile.place(instance.copy());
			}
		}
		this.dmm.push_undo();
		this.float_dmm = null;
	}
}
PlacementModeSelect.SelectionInfo = SelectionInfo;

const selection_appearances = [];
for(let i = 0; i < 16; i++) {
	selection_appearances.push(new Appearance({
		icon: '_fastdmm_interface.dmi',
		icon_state: "sel"+i,
		layer: 500,
		plane: 100000
	}));
}

module.exports = PlacementModeSelect;