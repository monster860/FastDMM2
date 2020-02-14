'use strict';
let id_ctr = 0;
/** @typedef {import("../parser/dmm").Tile} Tile */
module.exports = class PlacementHandler {
	/**
	 * 
	 * @param {import("../editor")} editor 
	 * @param {Tile} tile 
	 * @param {string} type 
	 */
	constructor(editor, tile, type, ...other_shit) {
		this.editor = editor;
		this.type = type;
		this.dmm = tile.dmm;
		this.mousedown(tile, ...other_shit);
		this.last_change_index = ++id_ctr;
	}
	/** @param {Tile} tile */
	mousedown(tile) {}
	/** @param {Tile} tile */
	mousemove(tile) {}
	mouseup() {}
	/** @param {Array<import("../render_instance")>} render_instances */
	visualize(render_instances) {}
}