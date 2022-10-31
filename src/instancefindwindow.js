'use strict';

module.exports = class InstanceFindWindow {
	/**
	 * 
	 * @param {import("./editor")} editor 
	 */
	constructor(editor) {
		this.editor = editor;
		/** @type {string} */
		this.container = document.getElementById("instancefindwindow");
	}

	set_instance_search(item) {
		if(!item) return;
		this.selected = item;
		// Clear old entries
		this.container.innerHTML = '';
		let found_tiles = [];
		// Search the entire map
		for(let x = 1; x <= this.editor.dmm.maxx; x++) {
			for(let y = 1; y <= this.editor.dmm.maxy; y++) {
				for(let z = 1; z <= this.editor.dmm.maxz; z++) {
					let tile = this.editor.dmm.get_tile(x, y, z);
					for(let content of tile.contents) {
						if(content.toString() == item) {
							found_tiles.push([x, y, z]);
						}
					}
				}
			}
		}
		for(let tile of found_tiles) {
			let entry = document.createElement("div");
			entry.dataset.coordinates = tile;
			let gotoButton = document.createElement("button");
			gotoButton.innerText = "Jump";
			gotoButton.addEventListener("click", this.on_goto.bind(this))
			let text = document.createElement("span");
			text.innerText = "  at " + tile[0] + ", " + tile[1] + ", " + tile[2];
			entry.appendChild(gotoButton);
			entry.appendChild(text);
			this.container.appendChild(entry);
		}
	}

	on_goto(e) {
		if(!e.target) return;
		let leaf = e.target.closest("div");
		if(leaf && leaf.dataset.coordinates) {
			let coord = leaf.dataset.coordinates.split(",")
			this.editor.dmm.mapwindow_x = Math.min(Math.max(coord[0], 1), this.editor.dmm.maxx);
			this.editor.dmm.mapwindow_y = Math.min(Math.max(coord[1], 1), this.editor.dmm.maxy);
			this.editor.dmm.mapwindow_z = Math.min(Math.max(coord[2], 1), this.editor.dmm.maxz);
		}
	}
}