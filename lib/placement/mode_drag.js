'use strict';
const PlacementMode = require('./_mode.js');
const PlacementHandler = require('./_handler.js');

class HandlerTileDrag extends PlacementHandler {
	mousedown(tile) {
		this.initial_tile = this.editor.map_window.mouse_pixel_tile;
		this.instance = this.editor.map_window.mouse_pixel_instance;
		this.mouse_tile = tile;
		this.curr_mouse_tile = tile;
	}
	mousemove(tile) {
		this.curr_mouse_tile = tile;
	}
	mouseup() {
		let tile = this.initial_tile;
		if(!this.curr_mouse_tile || !tile) return;
		let new_tile = tile.dmm.get_tile(tile.x + this.dx(), tile.y + this.dy(), tile.z);
		if(new_tile && tile && tile.contents.includes(this.instance) && !new_tile.contents.includes(this.instance)) {
			tile.delete(this.instance);
			new_tile.place(this.instance);
		}
		tile.dmm.push_undo();
	}
	visualize(instances) {
		if(!this.curr_mouse_tile) return;
		for(let inst of instances) {
			if(inst.instance == this.instance && inst.tile == this.initial_tile ) {
				inst.x += this.dx();
				inst.y += this.dy();
			}
		}
	}
	dx() {
		return this.curr_mouse_tile ? this.curr_mouse_tile.x - this.mouse_tile.x : 0;
	}
	dy() {
		return this.curr_mouse_tile ? this.curr_mouse_tile.y - this.mouse_tile.y : 0;
	}
}

class PlacementModeDrag extends PlacementMode {
	update_is_pixel() {
		this.is_pixel = true;
	}
	get_handler(e, tile, type) {
		if(!this.editor.map_window.mouse_pixel_instance) return;
		if(!e.shiftKey && !e.ctrlKey) {
			return new HandlerTileDrag(this.editor, tile, type);
		}
	}
}
PlacementModeDrag.fa_icon = "fa-arrows-alt";
PlacementModeDrag.description = "Drag";
PlacementModeDrag.usage = `Click/Drag - Move Object
Ctrl Shift Middle Click - Delete Object`;
PlacementModeDrag.uses_instance_panel = false;
module.exports = PlacementModeDrag;