'use strict';
const Menu = require('./menu.js');
const EditVarsPanel = require('../panels/vars_panel.js');
const stringify_byond = require('../parser/stringify.js');

class MapContextMenu extends Menu {
	constructor(editor) {
		super(editor);
		this.object_menu = new ObjectMenu(this.editor);
	}
	/** @param {import("../parser/dmm").Tile} tile */
	build_menu(tile) {
		let base = this.build_menu_base();
		if(tile) {
			if(this.editor.placement_mode == this.editor.select_tool && this.editor.select_tool.selection_info_map.has(this.editor.dmm)) {
				base.appendChild(this.build_menu_item({
					label: "Rotate 90\u00b0 CW",
					click_handler: this.rotate,
					click_handler_args: [tile, 90]
				}));
				base.appendChild(this.build_menu_item({
					label: "Rotate 90\u00b0 CCW",
					click_handler: this.rotate,
					click_handler_args: [tile, -90]
				}));
				base.appendChild(this.build_menu_item({
					label: "Rotate 180\u00b0",
					click_handler: this.rotate,
					click_handler_args: [tile, 180]
				}));
				base.appendChild(document.createElement("hr"));
			}
			for(let instance of tile) {
				let icon = document.createElement('img');
				this.editor.map_window.build_preview_icon(instance).then((icon_info) => {
					if(!icon_info) return;
					icon.src = icon_info.url;
				});
				let type_elem = document.createElement("span");
				if(!instance.type_obj) {
					type_elem.classList.add("error-text");
				} else {
					type_elem.classList.add("unimportant-text");
				}
				type_elem.textContent = instance.type;
				base.appendChild(this.build_menu_item({
					label: [icon, type_elem, document.createElement("br"), stringify_byond(instance.get_var("name"))],
					submenu: this.object_menu,
					submenu_args: [tile, instance],
					classes_to_add: ['map-instance-dropdown-item']
				}));
			}
		}
		return base;
	}

	rotate(e, tile, angle) {
		let sel = this.editor.select_tool.selection_info_map.get(this.editor.dmm);
		if(this.editor.placement_mode == this.editor.select_tool && sel) {
			this.editor.select_tool.rotate_selection(sel, angle);
		}
	}
}

class ObjectMenu extends Menu {
	build_menu(tile, instance) {
		let base = this.build_menu_base();base.appendChild(this.build_menu_item({
			label: "Make Active Object",
			click_handler: this.make_active_object,
			click_handler_args: [tile, instance]
		}));
		base.appendChild(this.build_menu_item({
			label: "Delete",
			click_handler: this.delete,
			click_handler_args: [tile, instance]
		}));
		base.appendChild(this.build_menu_item({
			label: "View Variables",
			click_handler: this.edit_vars,
			click_handler_args: [tile, instance]
		}));
		return base;
	}

	delete(e, tile, instance) {
		tile.delete(instance);
	}

	edit_vars(e, tile, instance) {
		new EditVarsPanel(this.editor, tile, instance);
	}

	make_active_object(e, tile, instance) {
		this.editor.make_active_object(instance);
	}
}

module.exports = MapContextMenu;