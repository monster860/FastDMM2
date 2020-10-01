'use strict';
const Menu = require('./menu.js');
const MapPropsPanel = require('../panels/map_props_panel.js');
const DMM = require('../parser/dmm.js');
const ChangelogPanel = require('../panels/changelog_panel.js');

class FileMenu extends Menu {
	build_menu() {
		let base = this.build_menu_base();
		base.appendChild(this.build_menu_item({
			label: "New",
			click_handler: this.new_map
		}));
		base.appendChild(this.build_menu_item({
			label: "Open",
			submenu: new OpenMenu(this.editor),
			disabled: this.editor.file_context == null
		}));
		base.appendChild(this.build_menu_item({
			label: "Export",
			click_handler: this.export_map,
			disabled: !this.editor.dmm
		}));
		if(this.editor.file_context.add_file_menu_options) {
			this.editor.file_context.add_file_menu_options(this, base);
		}
		return base;
	}

	export_map() {
		let dmm = this.editor.dmm;
		if(!dmm) return;
		dmm.download();
	}

	async new_map() {
		let dmm_options = await new MapPropsPanel(this.editor, null, "New Map", false).wait_until_close();
		if(!dmm_options) return;
		let dmm = new DMM(this.editor.parser, dmm_options.filename, dmm_options.maxx, dmm_options.maxy, dmm_options.maxz);
		let found_format = false;
		for(let other_dmm of this.editor.dmm_tabs) {
			found_format = true;
			dmm.is_crlf = other_dmm.is_crlf;
			dmm.format = other_dmm.format;
			break;
		}
		if(!found_format) { // basically try to load maps until it finds one that loads, then steal the crlf/format from it.
			this.editor.set_loading();
			for(let other_dmm_filename of this.editor.file_context.dmm_files) {
				try {
					let other_dmm_text = await this.editor.read_text_file(other_dmm_filename);
					let other_dmm = new DMM(this.editor.parser, other_dmm_filename, other_dmm_text);
					dmm.is_crlf = other_dmm.is_crlf;
					dmm.format = other_dmm.format;
					found_format = true;
					break;
				} catch(e) {
					console.error(e);
				}
			}
			this.editor.clear_loading();	
		}
		this.editor.add_tab(dmm);
	}
}

class OpenMenu extends Menu {
	build_menu(path_start = "") {
		let base = this.build_menu_base();
		let done_paths = new Set();
		if(this.editor.file_context) {
			for(let dmm of this.editor.file_context.dmm_files) {
				if(!dmm.startsWith(path_start)) continue;
				let dmm_part = dmm.substring(path_start.length);
				let slash_index = dmm_part.indexOf("/");
				if(slash_index != -1) {
					let label = dmm_part.substring(0, slash_index);
					if(!done_paths.has(label)) {
						base.appendChild(this.build_menu_item({
							label: label,
							submenu: this,
							submenu_args: [path_start + dmm_part.substring(0, slash_index+1)]
						}));
						done_paths.add(label);
					}
				} else {
					base.appendChild(this.build_menu_item({
						label: dmm_part,
						click_handler: this.open,
						click_handler_args: [dmm]
					}));
				}
			}
		}
		return base;
	}
	open(e, name) {
		this.editor.open_dmm(name);
	}
}

class OptionsMenu extends Menu {
	constructor(editor) {
		super(editor);

		this.dmm_menu = new DmmOptionsMenu(editor);
	}
	build_menu() {
		let base = this.build_menu_base();
		base.appendChild(this.build_menu_item({
			label: "Frame Areas",
			click_handler: this.toggle_frame_areas,
			classes_to_add: this.editor.map_window.frame_areas ? ['on'] : []
		}));
		base.appendChild(this.build_menu_item({
			label: "Map Options",
			submenu: this.dmm_menu,
			disabled: this.editor.dmm == null
		}));
		return base;
	}
	toggle_frame_areas() {
		this.editor.map_window.frame_areas = !this.editor.map_window.frame_areas;
	}
}

class DmmOptionsMenu extends Menu {
	build_menu() {
		if(!this.editor.dmm) return null;
		let base = this.build_menu_base();
		base.appendChild(this.build_menu_item({
			label: "LF",
			click_handler: this.set_crlf,
			click_handler_args: [false],
			classes_to_add: this.editor.dmm.is_crlf ? [] : ['selected']
		}));
		base.appendChild(this.build_menu_item({
			label: "CRLF",
			click_handler: this.set_crlf,
			click_handler_args: [true],
			classes_to_add: this.editor.dmm.is_crlf ? ['selected'] : []
		}));
		base.appendChild(document.createElement("hr"));
		base.appendChild(this.build_menu_item({
			label: "Standard",
			click_handler: this.set_format,
			click_handler_args: ['standard'],
			classes_to_add: this.editor.dmm.format == 'standard' ? ['selected'] : []
		}));
		base.appendChild(this.build_menu_item({
			label: "TGM",
			click_handler: this.set_format,
			click_handler_args: ['tgm'],
			classes_to_add: this.editor.dmm.format == 'tgm' ? ['selected'] : []
		}));
		base.appendChild(this.build_menu_item({
			label: "Maphash",
			click_handler: this.set_format,
			click_handler_args: ['maphash'],
			classes_to_add: this.editor.dmm.format == 'maphash' ? ['selected'] : []
		}));
		base.appendChild(document.createElement("hr"));
		base.appendChild(this.build_menu_item({
			label: `Size: ${this.editor.dmm.maxx}x${this.editor.dmm.maxy}x${this.editor.dmm.maxz}`,
			click_handler: this.resize
		}));
		return base;
	}

	set_crlf(e, crlf = false) {
		this.editor.dmm.is_crlf = crlf;
	}

	set_format(e, format = "standard") {
		this.editor.dmm.format = format;
	}
}

let help_entries = {
	'GitHub': 'https://github.com/monster860/FastDMM2',
	'Report Issue': 'https://github.com/monster860/FastDMM2/issues/new'
};

class HelpMenu extends Menu {
	constructor(editor) {
		super(editor);
	}
	build_menu() {
		let base = this.build_menu_base();
		for(let [title, url] of Object.entries(help_entries)) {
			base.appendChild(this.build_menu_item({
				label: title,
				click_handler: this.open_url,
				click_handler_args: [url]
			}));
		}
		base.appendChild(this.build_menu_item({
			label: "Show Changelog",
			click_handler: this.open_changelog
		}));
		return base;
	}

	open_url(e, url) {
		window.open(url, "_blank");
	}

	open_changelog() {
		new ChangelogPanel(this, {changelog_data: this.editor.changelog_data, modal: true});
	}
}

module.exports = {FileMenu, OptionsMenu, HelpMenu};