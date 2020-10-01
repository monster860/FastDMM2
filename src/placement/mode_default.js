'use strict';
const PlacementMode = require('./_mode.js');
const PlacementHandler = require('./_handler.js');
const {Instance} = require('../parser/dmm.js');
const RenderInstance = require('../render_instance.js');
const PipeManager = require('../astar/pipe_manager.js');

class HandlerDefault extends PlacementHandler {
	mousedown(tile) {
		if(tile.dmm != this.dmm) return;
		this.tiles = new Set();
		this.instance = new Instance(this.editor.parser, this.type);
		this.mousemove(tile);
	}
	mousemove(tile) {
		if(tile.dmm != this.dmm) return;
		if(!this.tiles.has(tile)) {
			this.tiles.add(tile);
			tile.place(this.instance.copy());
		}
	}
	mouseup() {
		this.dmm.push_undo();
	}
	visualize(instances) {
	}
}

class HandlerDirectional extends PlacementHandler {
	mousedown(tile) {
		if(tile.dmm != this.dmm) return;
		this.tile = tile;
		let base_instance = new Instance(this.editor.parser, this.type);
		let dir_count = base_instance.get_fastdmm_prop("dir_amount", base_instance.make_eval_context()) || 0;
		let is_cable = this.editor.pipe_manager.get_pipe_type(base_instance) == PipeManager.PIPE_TYPE_CABLE;
		if(!dir_count && is_cable) dir_count = 8;
		if(!dir_count) {
			dir_count = 1; // as a fallback.
			// use the icon.
			let appearance = base_instance.get_appearance();
			if(appearance.icon) {
				let icon = this.editor.map_window.icons.get(appearance.icon.toLowerCase());
				if(icon) {
					let icon_state = icon.icon_states.get(appearance.icon_state) || icon.icon_states.get("") || icon.icon_states.get(" ");
					if(icon_state) {
						dir_count = icon_state.dir_count || 1;
					}
				}
			}
		}
		this.dir_count = dir_count;
		this.is_cable = is_cable;
		this.instance = base_instance;
	}
	mousemove(tile) {
		if(tile.dmm != this.dmm) return;
		let appropriate_dir = ((this.dir_count == 4 || this.dir_count == 8) ? this.tile.get_dir(tile, this.dir_count == 4) : 2);
		if(appropriate_dir == 0) return;
		if(this.is_cable) {
			let appropriate_state = "0-" + appropriate_dir;
			if(appropriate_state != this.instance.get_var("icon_state")) {
				let new_vars = new Map(this.instance.vars);
				if(this.instance.type_obj && this.instance.type_obj.get_var("icon_state") == appropriate_state) {
					new_vars.delete("icon_state");
				} else {
					new_vars.set("icon_state", appropriate_state);
				}
				this.instance = new Instance(this.editor.parser, this.instance.type, new_vars);
			}
		} else {
			if(appropriate_dir != this.instance.get_var("dir")) {
				let new_vars = new Map(this.instance.vars);
				if(this.instance.type_obj && this.instance.type_obj.get_var("dir") == appropriate_dir) {
					new_vars.delete("dir");
				} else {
					new_vars.set("dir", appropriate_dir);
				}
				this.instance = new Instance(this.editor.parser, this.instance.type, new_vars);
			}
		}
	}
	mouseup() {
		this.tile.place(this.instance.copy());
		this.dmm.push_undo();
	}
	visualize(instances) {
		instances.push(new RenderInstance(this.instance.get_appearance(), this.tile.x, this.tile.y, this.tile.z));
	}
}

class HandlerBlock extends PlacementHandler {
	mousedown(tile) {
		if(tile.dmm != this.dmm) return;
		this.x1 = tile.x;
		this.y1 = tile.y;
		this.z1 = tile.z;
		this.x2 = this.x1;
		this.y2 = this.y1;
		this.z2 = this.z1;
		this.instance = new Instance(this.editor.parser, this.type);
	}
	mousemove(tile) {
		if(tile.dmm != this.dmm) return;
		this.x2 = tile.x;
		this.y2 = tile.y;
		this.z2 = tile.z;
	}
	mouseup() {
		let minx = Math.min(this.x1, this.x2);
		let maxx = Math.max(this.x1, this.x2);
		let miny = Math.min(this.y1, this.y2);
		let maxy = Math.max(this.y1, this.y2);
		let minz = Math.min(this.z1, this.z2);
		let maxz = Math.max(this.z1, this.z2);
		for(let z = minz; z <= maxz; z++) {
			for(let y = miny; y <= maxy; y++) {
				for(let x = minx; x <= maxx; x++) {
					let tile = this.dmm.get_tile(x,y,z);
					if(tile) {
						tile.place(this.instance.copy());
					}
				}
			}
		}
		this.dmm.push_undo();
	}
	visualize(instances) {
		let appearance = this.instance.get_appearance();
		let minx = Math.min(this.x1, this.x2);
		let maxx = Math.max(this.x1, this.x2);
		let miny = Math.min(this.y1, this.y2);
		let maxy = Math.max(this.y1, this.y2);
		let minz = Math.min(this.z1, this.z2);
		let maxz = Math.max(this.z1, this.z2);
		for(let z = minz; z <= maxz; z++) {
			for(let y = miny; y <= maxy; y++) {
				for(let x = minx; x <= maxx; x++) {
					let tile = this.dmm.get_tile(x,y,z);
					instances.push(new RenderInstance(appearance, tile.x, tile.y, tile.z));
				}
			}
		}
	}
	get_status_text() {
		return `${Math.abs(this.x2-this.x1) + 1}x${Math.abs(this.y2-this.y1) + 1}x${Math.abs(this.z2-this.z1) + 1} (${this.x1},${this.y1},${this.z1})-(${this.x2},${this.y2},${this.z2})`;
	}
}

class PlacementModeDefault extends PlacementMode {
	get_handler(e, tile, type) {
		if(this.is_pixel || !type) return;
		if(e.shiftKey) {
			return new HandlerBlock(this.editor, tile, type);
		} else if(e.ctrlKey) {
			return new HandlerDirectional(this.editor, tile, type);
		} else {
			return new HandlerDefault(this.editor, tile, type);
		}
	}
}

PlacementModeDefault.HandlerDefault = HandlerDefault;
PlacementModeDefault.HandlerBlock = HandlerBlock;

PlacementModeDefault.fa_icon = "fa-plus";
PlacementModeDefault.description = "Placement";
PlacementModeDefault.usage = `Click - Place Object
Shift Click/Drag - Block Placement
Ctrl Click - Directional Placement
Ctrl Shift Click - Make Active Object, View Variables
Ctrl Shift Middle Click - Delete Object`;
PlacementModeDefault.uses_instance_panel = true;

module.exports = PlacementModeDefault