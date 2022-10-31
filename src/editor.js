'use strict';
const WelcomePanel = require('./panels/welcome_panel.js');
const GithubFileContext = require('./file_context/github_file_context.js');
const WebkitDirectoryFileContext = require('./file_context/webkitdirectory_file_context.js');
const NativeFsFileContext = require('./file_context/native_fs_file_context.js');
const Parser = require('./parser/parser.js');
const MapWindow = require('./mapwindow.js');
const ObjTreeWindow = require('./objtreewindow.js');
const InstanceWindow = require('./instancewindow.js');
const InstanceFindWindow = require('./instancefindwindow.js');
const DMM = require('./parser/dmm.js');
const {FileMenu, OptionsMenu, HelpMenu} = require('./menu/menubar_menus.js');
const ProgressBarPanel = require('./panels/progress_bar_panel.js');
const PipeManager = require('./astar/pipe_manager.js');
const ChangelogPanel = require('./panels/changelog_panel.js');

const PlacementModeDefault = require('./placement/mode_default.js');
const PlacementModeDrag = require('./placement/mode_drag.js');
const PlacementModePipe = require('./placement/mode_pipe.js');
const PlacementModeSelect = require('./placement/mode_select.js');

const changelog = require('../changelog.json');

class Editor {
	constructor() {
		document.title = "FastDMM2";
		this.loading_counter = 0;

		this.has_meaningful_interact = false;

		/** @type {GithubFileContext|WebkitDirectoryFileContext|NativeFsFileContext} */
		this.file_context = null;
		/** @type {Parser} */
		this.parser = null;
		/** @type {PipeManager} */
		this.pipe_manager = null;

		/** @type {DMM} */
		this.dmm = null;
		/** @type {Array<DMM>} */
		this.dmm_tabs = [];
		this.tabs_elem = document.getElementById("tabwindow");

		this.map_window = new MapWindow(this);
		this.objtree_window = new ObjTreeWindow(this);
		this.instance_window = new InstanceWindow(this);
		this.instance_find_window = new InstanceFindWindow(this);

		this.file_menu = new FileMenu(this);
		this.file_menu.add_to_menubar(document.getElementById("ui-menubar"), "File");
		this.options_menu = new OptionsMenu(this);
		this.options_menu.add_to_menubar(document.getElementById("ui-menubar"), "Options");
		this.help_menu = new HelpMenu(this);
		this.help_menu.add_to_menubar(document.getElementById("ui-menubar"), "Help");
		window.onbeforeunload = this.beforeunload.bind(this);
		window.onunload = this.unload.bind(this);

		window.addEventListener("keydown", this.keydown.bind(this));
		window.addEventListener("keyup", this.keyup.bind(this));

		this.running_object_count = new Map();
		this.handle_instance_added = this.handle_instance_added.bind(this);
		this.handle_instance_removed = this.handle_instance_removed.bind(this);

		this.ready = false;

		/** @type{Array<{author:string,data:string,desc:string}>} */
		this.changelog_data = null;

		this.select_tool = new PlacementModeSelect(this);
		/** @type Array<import("./placement/_mode")> */
		this.placement_modes = [ // please don't change the order of these without good reason.
			new PlacementModeDefault(this),
			new PlacementModeDrag(this),
			new PlacementModePipe(this),
			this.select_tool
		];
		/** @type import("./placement/_mode") */
		this.placement_mode = null;
		this.initialize_placement_modes();

		let querystring = new URLSearchParams(window.location.search);
		this.welcome_panel = null;
		if(querystring.has("repo")) {
			let repo = querystring.get("repo");
			let branch = querystring.get("branch");
			let init_map = querystring.get("map");
			let init_coords = querystring.get("xyz");
			try {
				this.has_meaningful_interact = true;
				this.try_initialize_github(repo, branch, async () => {
					let tab = await this.open_dmm(init_map);
					if(init_coords) {
						let coords_split = init_coords.split(",");
						let cx = (+coords_split[0]|0);
						let cy = (+coords_split[1]|0);
						let cz = (+coords_split[2]|0);
						tab.mapwindow_x = Math.min(Math.max(cx, 1), tab.maxx);
						tab.mapwindow_y = Math.min(Math.max(cy, 1), tab.maxy);
						tab.mapwindow_z = Math.min(Math.max(cz, 1), tab.maxz);
					}
				});
			} catch(e) {
				this.welcome_panel = new WelcomePanel(this, e);
			}
		} else {
			this.welcome_panel = new WelcomePanel(this);
		}

		
		this.changelog_data = changelog;
		let last_cl_length = localStorage.getItem("last_cl_length");
		if(last_cl_length == this.changelog_data.length) return;
		localStorage.setItem("last_cl_length", this.changelog_data.length);
		new ChangelogPanel(this, {changelog_data: this.changelog_data, modal: true});
	}

	set_loading() {
		this.loading_counter++;
		if(this.loading_counter > 0) {
			document.body.classList.add("loading");
			document.getElementById("loading").focus();
		}
		
	}
	clear_loading() {
		this.loading_counter--;
		if(this.loading_counter <= 0) document.body.classList.remove("loading");
	}

	async initialize_to_context(context) {
		let progress_bar;
		try {
			this.set_loading();
			this.file_context = context;
			if(context.initialize) await context.initialize();
			this.parser = new Parser(this.read_text_file.bind(this));

			// now we need to select a .dme
			let filtered_dmes = this.file_context.dme_files.filter((item) => {return !item.includes("/");});
			let dme = null;
			if(filtered_dmes.length == 1) {
				dme = filtered_dmes[0];
			} else {
				let tgstation_filtered = filtered_dmes.filter((item) => {return item != "tgstation.dme";}); // deal with codebases that use a mirror bot
				if(tgstation_filtered.length >= 1) {
					dme = tgstation_filtered[0];
				} else if(filtered_dmes.length >= 1) {
					dme = filtered_dmes[0];
				} else {
					dme = this.file_context.dme_files[0];
				}
			}
			progress_bar = new ProgressBarPanel(this, "Loading " + dme, true);
			this.clear_loading();
			console.log("loading " + dme);
			await this.parser.parse_file(dme, progress_bar.set_progress.bind(progress_bar));
			this.map_window.clear_all();
			this.objtree_window.build_tree();
			this.pipe_manager = new PipeManager(this);
			this.ready = true;
		} catch(e) {
			this.file_context = null;
			//this.parser = null;
			console.error(e);
			new WelcomePanel(this, ""+e);
		}
		if(progress_bar) progress_bar.close();
		this.clear_loading();
	}

	/**
	 * 
	 * @param {string} dmm 
	 */
	async open_dmm(dmm) {
		console.log("Loading " + dmm);
		let text = await this.read_text_file(dmm);
		let tab = new DMM(this.parser, dmm, text);
		this.add_tab(tab);
		return tab;
	}
	/**
	 * 
	 * @param {DMM} dmm 
	 */
	add_tab(dmm) {
		if(!(dmm instanceof DMM)) throw new Error("Expected dmm");
		this.dmm_tabs.push(dmm);
		
		let elem = document.createElement("div");
		elem.classList.add("tab");
		dmm.tab_elem = elem;
		elem.addEventListener("click", (e) => {
			if(e.defaultPrevented) return;
			e.preventDefault();
			this.set_tab(dmm);
		});

		let close_button = document.createElement("div");
		close_button.classList.add("close-button");
		close_button.addEventListener("click", async (e) => {
			e.preventDefault();
			if(dmm.modified && !window.confirm("You have unsaved changes. Close anyways?")) return;
			this.close_tab(dmm);
		});
		elem.appendChild(close_button);

		let label = document.createElement("span");
		label.textContent = dmm.filename ? dmm.filename.substring(dmm.filename.lastIndexOf("/") + 1) : "untitled";
		elem.appendChild(label);
		elem.title = dmm.filename || "untitled";

		this.tabs_elem.appendChild(elem);

		for(let [instance_string, amount] of dmm.running_object_count) {
			this.handle_instance_added(instance_string, amount);
		}
		dmm.on("instance_added", this.handle_instance_added);
		dmm.on("instance_removed", this.handle_instance_removed);

		this.set_tab(dmm);
	}
	/** @param {DMM} dmm */
	set_tab(dmm) {
		if(dmm == this.dmm) return;
		if(this.dmm) {
			this.dmm.tab_elem.classList.remove("selected");
		}
		this.dmm = dmm;
		if(this.dmm) {
			this.dmm.tab_elem.classList.add("selected");
		}
	}
	/** @param {DMM} dmm */
	close_tab(dmm) {
		let index = this.dmm_tabs.indexOf(dmm);
		if(index == -1) return;
		if(this.dmm == dmm) {
			let new_dmm = this.dmm_tabs[index+1] || this.dmm_tabs[index-1];
			this.set_tab(new_dmm);
		}
		this.dmm_tabs.splice(index, 1);
		this.tabs_elem.removeChild(dmm.tab_elem);
		dmm.removeListener("instance_added", this.handle_instance_added);
		dmm.removeListener("instance_removed", this.handle_instance_removed);
		for(let [instance_string, amount] of dmm.running_object_count) {
			this.handle_instance_removed(instance_string, amount);
		}
	}

	/** 
	 * @param {string} path
	 * @returns {Promise<string>}
	 */
	read_text_file(path) {
		return new Promise((resolve, reject) => {
			this.file_context.read_file(path).then((blob) => {
				let reader = new FileReader();
				reader.addEventListener("loadend", () => {resolve(reader.result);});
				reader.readAsText(blob);
			}, reject);
		});
	}

	async try_initialize_github(repo_name, branch_name, full_callback) {
		let context = await GithubFileContext.make_from_repo_name(this, repo_name, branch_name);
		let promise = this.initialize_to_context(context);
		if(full_callback) promise.then(full_callback);
		return;
	}

	async try_initialize_webkitdirectory(files) {
		this.initialize_to_context(new WebkitDirectoryFileContext(this, files));
		return;
	}

	async try_initialize_native_fs(handle) {
		this.initialize_to_context(await NativeFsFileContext.from_directory_handle(this, handle));
	}

	initialize_placement_modes() {
		let toolwindow = document.getElementById('toolwindow');
		for(let i = 0; i < this.placement_modes.length; i++) {
			let mode = this.placement_modes[i];
			let elem = document.createElement("span");
			elem.classList.add("fas", mode.constructor.fa_icon, "tool");
			elem.title = mode.constructor.description;
			if(i < 9)  elem.title += " (Ctrl-" + (i+1) + ")";
			if(mode.constructor.usage != null) {
				elem.title += "\nUsage: \n" + mode.constructor.usage;
			}
			elem.addEventListener("click", (e) => {
				this.set_placement_mode(mode, e);
			});
			mode.button_elem = elem;
			toolwindow.appendChild(elem);
		}
		this.set_placement_mode(this.placement_modes[0]);
		toolwindow.appendChild(document.createElement("br"));
		let z_up_elem = document.createElement("span");
		z_up_elem.classList.add("fas", "fa-caret-up", "tool");
		z_up_elem.title = "Go Up (Page-Up)"
		z_up_elem.addEventListener("click", () => {
			if(this.dmm && this.dmm.mapwindow_z < this.dmm.maxz)
				this.dmm.mapwindow_z++;
		});
		let z_down_elem = document.createElement("span");
		z_down_elem.classList.add("fas", "fa-caret-down", "tool");
		z_down_elem.title = "Go Down (Page-Down)"
		z_down_elem.addEventListener("click", () => {
			if(this.dmm && this.dmm.mapwindow_z > 1)
				this.dmm.mapwindow_z--;
		});
		toolwindow.appendChild(z_up_elem);
		toolwindow.appendChild(z_down_elem);
	}

	/** 
	 * @param {import("./placement/_mode")} mode
	 * @param {MouseEvent} e
	 */
	set_placement_mode(mode, e) {
		if(mode == this.placement_mode) return;
		if(this.placement_mode){
			this.placement_mode.button_elem.classList.remove("selected");
			this.placement_mode.unselect_tool(e);
		}
		this.placement_mode = mode;
		if(this.placement_mode) {
			this.placement_mode.button_elem.classList.add("selected");
			this.placement_mode.select_tool(e);
		}
	}

	beforeunload(e) {
		for(let dmm of this.dmm_tabs) {
			if(dmm.modified) {
				e.returnValue = "You have unsaved changes";
			}
		}
	}

	unload(e) {
		// Why the fuck don't browsers do this by default? *sigh*.
		this.map_window.gl.getExtension('WEBGL_lose_context').loseContext();
	}

	keydown(e) {
		this.placement_mode.update_is_pixel(e);
		if(e.defaultPrevented) return;
		if(e.target.closest("input") || e.target.isContentEditable) return;
		if(this.dmm && e.ctrlKey && e.code == "KeyZ") { // undo
			e.preventDefault();
			this.dmm.undo();
		} else if(this.dmm && e.ctrlKey && e.code == "KeyY") { // redo
			e.preventDefault();
			this.dmm.redo();
		} else if(this.ready && e.ctrlKey && e.code == "KeyF") { // search object tree
			e.preventDefault();
			this.objtree_window.search_bar.focus();
		} else if(this.dmm && e.code == "PageUp") {
			if(this.dmm.mapwindow_z < this.dmm.maxz)
				this.dmm.mapwindow_z++;
		} else if(this.dmm && e.code == "PageDown") {
			if(this.dmm.mapwindow_z > 1)
				this.dmm.mapwindow_z--;
		} else if(e.ctrlKey && e.code.startsWith("Digit")) {
			let num = +e.code.substring(5) - 1;
			if(e.shiftKey) {
				let dmm = this.dmm_tabs[num];
				if(dmm)
					this.set_tab(dmm);
			} else {
				let mode = this.placement_modes[num];
				if(mode) this.set_placement_mode(mode);
			}
			e.preventDefault();
		} else if(this.ready && e.altKey && e.code == "Digit1") {
			this.objtree_window.toggle_typepath_vis("/area");
		} else if(this.ready && e.altKey && e.code == "Digit2") {
			this.objtree_window.toggle_typepath_vis("/mob");
		} else if(this.ready && e.altKey && e.code == "Digit3") {
			this.objtree_window.toggle_typepath_vis("/obj");
		} else if(this.ready && e.altKey && e.code == "Digit4") {
			this.objtree_window.toggle_typepath_vis("/turf");
		} else if(this.dmm && e.target == this.map_window.canvas && e.code == "ArrowLeft") {
			if(this.dmm.mapwindow_x > 1) this.dmm.mapwindow_x--;
		} else if(this.dmm && e.target == this.map_window.canvas && e.code == "ArrowDown") {
			if(this.dmm.mapwindow_y > 1) this.dmm.mapwindow_y--;
		} else if(this.dmm && e.target == this.map_window.canvas && e.code == "ArrowRight") {
			if(this.dmm.mapwindow_x < this.dmm.maxx) this.dmm.mapwindow_x++;
		} else if(this.dmm && e.target == this.map_window.canvas && e.code == "ArrowUp") {
			if(this.dmm.mapwindow_y < this.dmm.maxy) this.dmm.mapwindow_y++;
		}
		for(let mode of this.placement_modes) {
			if(mode.handle_global_hotkey(e)) {
				e.preventDefault();
				return;
			}
		}
		if(this.placement_mode && this.placement_mode.handle_hotkey(e)) {
			e.preventDefault();
			return;
		}
	}
	keyup(e) {
		this.placement_mode.update_is_pixel(e);
	}

	/**
	 * 
	 * @param {import("./parser/dmm").Instance} instance 
	 */
	make_active_object(instance) {
		if(!(instance.istype("/turf") || instance.istype("/area") || instance.istype("/obj") || instance.istype("/mob"))) return;
		this.instance_window.set_selected(instance.toString(), true);
	}

	/** @param {string} instance_string */
	handle_instance_added(instance_string, amount = 1) {
		let count = this.running_object_count.get(instance_string) || 0;
		if(count <= 0 && count + amount > 0) {
			this.instance_window.add_instance(instance_string);
		} else if(count > 0 && count + amount <= 0) {
			this.instance_window.remove_instance(instance_string);
		}
		count += amount;
		if(count <= 0)
			this.running_object_count.delete(instance_string);
		else
			this.running_object_count.set(instance_string, count);
	}

	/** @param {string} instance_string */
	handle_instance_removed(instance_string, amount = 1) {
		let count = this.running_object_count.get(instance_string) || 0;
		if(count <= 0 && count - amount > 0) {
			this.instance_window.add_instance(instance_string);
		} else if(count > 0 && count - amount <= 0) {
			this.instance_window.remove_instance(instance_string);
		}
		count -= amount;
		if(count <= 0)
			this.running_object_count.delete(instance_string);
		else
			this.running_object_count.set(instance_string, count);
	}

	notification(text) {
		let win = document.getElementById("notificationwindow");
		let elem = document.createElement("div");
		elem.classList.add("notif-card");
		elem.textContent = text;
		if(!win.children.length) {
			win.appendChild(elem);
		} else {
			win.insertBefore(elem, win.firstElementChild);
		}
		setTimeout(() => {
			elem.style.opacity = "0";
		}, 4000);
		setTimeout(() => {
			win.removeChild(elem);
		}, 6500)
	}
}
Editor.Parser = Parser;

module.exports = Editor;
