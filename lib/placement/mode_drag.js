'use strict';
const PlacementMode = require('./_mode.js');
const PlacementHandler = require('./_handler.js');
const Appearance = require('../rendering/appearance.js');
const RenderInstance = require('../render_instance.js');

const box_appearance = new Appearance({
	icon: '_fastdmm_interface.dmi',
	icon_state: "15",
	color: [1,1,1],
	layer: 500,
	plane: 100000,
	alpha: 0.4
});

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

class HandlerPixelDrag extends PlacementHandler {
	mousedown(tile) {
		/** @type {import("../parser/dmm.js").Tile} */
		this.initial_tile = this.editor.map_window.mouse_pixel_tile;
		/** @type {import("../parser/dmm.js").Instance} */
		this.instance = this.editor.map_window.mouse_pixel_instance;
		/** @type {import("../parser/dmm.js").Instance} */
		this.replacement_instance = this.instance;
		this.start_mx = this.editor.map_window.mouse_x_float;
		this.start_my = this.editor.map_window.mouse_y_float;
		this.last_dx = 0;
		this.last_dy = 0;
	}
	mousemove_pixel(tile) {
		if(!this.editor.map_window.mouse_x_float) return;
		let dx = Math.round((this.editor.map_window.mouse_x_float - this.start_mx) * 32);
		let dy = Math.round((this.editor.map_window.mouse_y_float - this.start_my) * 32);
		if(this.last_dx == dx && this.last_dy == dy) {
			return;
		}
		this.last_dx = dx;
		this.last_dy = dy;
		this.mark_dirty();
		this.replacement_instance = this.instance.copy();
		this.replacement_instance.set_var("pixel_x", this.instance.get_var("pixel_x") + dx);
		this.replacement_instance.set_var("pixel_y", this.instance.get_var("pixel_y") + dy);
		if((dx != 0 || !this.instance.vars.has("pixel_x")) && this.replacement_instance.get_var("pixel_x") == this.replacement_instance.type_obj.get_var("pixel_x")) {
			this.replacement_instance.vars.delete("pixel_x");
		}
		if((dy != 0 || !this.instance.vars.has("pixel_y")) && this.replacement_instance.get_var("pixel_y") == this.replacement_instance.type_obj.get_var("pixel_y")) {
			this.replacement_instance.vars.delete("pixel_y");
		}
	}
	mouseup() {
		let tile = this.initial_tile;
		let idx = tile.contents.indexOf(this.instance);
		if(idx != -1) {
			tile.replace_object(idx, this.replacement_instance);
		}
		tile.dmm.push_undo();
	}
	visualize(instances) {
		for(let inst of instances) {
			if(inst.instance == this.instance && inst.tile == this.initial_tile ) {
				inst.appearance = this.replacement_instance.get_appearance();
			}
		}
		instances.push(new RenderInstance(box_appearance, this.initial_tile.x, this.initial_tile.y, this.initial_tile.z, this.initial_tile));
	}
	get_status_text() {
		return `pixel_x=${this.replacement_instance.get_var("pixel_x")};pixel_y=${this.replacement_instance.get_var("pixel_y")}`;
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
		else if(!e.shiftKey && e.ctrlKey) {
			return new HandlerPixelDrag(this.editor, tile, type);
		}
	}
}
PlacementModeDrag.fa_icon = "fa-arrows-alt";
PlacementModeDrag.description = "Drag";
PlacementModeDrag.usage = `Click/Drag - Move Object
Ctrl Click/Drag - Move object by pixel_x/y
Ctrl Shift Middle Click - Delete Object`;
PlacementModeDrag.uses_instance_panel = false;
module.exports = PlacementModeDrag;