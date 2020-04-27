'use strict';
let id_ctr = 0;

/** @typedef {import("../parser/dmm").Tile} Tile */
/** @typedef {import("../parser/dmm").Instance} Instance */
class PlacementMode {
	/**
	 * 
	 * @param {import("../editor")} editor 
	 */
	constructor(editor) {
		this.editor = editor;
		this.is_pixel = false;
		this.last_change_index = ++id_ctr;
		/** @type {HTMLDivElement} */
		this.button_elem = null;
	}
	/**
	 * 
	 * @param {MouseEvent} e 
	 * @param {Tile} tile 
	 * @param {string} type 
	 * @returns {import("./_handler")}
	 */
	get_handler(e, tile, type) {
		return null;
	}
	/**
	 * 
	 * @param {MouseEvent} e 
	 * @param {Tile} tile 
	 * @param {Instance} instance 
	 * @param {String} type 
	 */
	handle_pixel_mousedown(e, tile, instance, type) {
		if(!this.is_pixel) return;
		// default behavior for all modes is pick object on ctrl-shift
		if(e.button == 0 && e.ctrlKey && e.shiftKey) {
			this.editor.make_active_object(instance);
		} else if(e.button == 1 && e.ctrlKey && e.shiftKey) {
			tile.delete(instance);
			tile.dmm.push_undo();
		}
	}
	/**
	 * 
	 * @param {MouseEvent} e 
	 * @returns {boolean}
	 */
	update_is_pixel(e) {
		// default behavior for all modes is pick object on ctrl-shift
		this.is_pixel = e ? (e.shiftKey && e.ctrlKey) : false;
	}
	/**
	 * 
	 * @param {MouseEvent} e 
	 */
	select_tool(e) {
		this.update_is_pixel(e);
	}
	unselect_tool() {}
	/**
	 * 
	 * @param {Array<import("../render_instance")>} render_instances 
	 */
	visualize(render_instances) {}
	handle_hotkey() { return false;}
	handle_global_hotkey() { return false;}

	mark_dirty() {this.last_change_index = ++id_ctr;}
}

PlacementMode.fa_icon = "fa-question-circle";
PlacementMode.description = "Unknown";
PlacementMode.usage = ``;
PlacementMode.uses_instance_panel = true;

module.exports = PlacementMode;