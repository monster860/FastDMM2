'use strict';
const path = require('path');
const MessagePanel = require('../panels/message_panel.js');
const ProgressBarPanel = require('../panels/progress_bar_panel.js');
const DMM = require('../parser/dmm.js');

// Uses the native file system API (https://wicg.github.io/native-file-system/)

module.exports = class NativeFsFileContext {
	constructor(editor, handle, all_files) {
		/** @type {import("../editor.js")} */
		this.editor = editor;
		this.dme_files = [];
		this.dmm_files = [];
		this.handle = handle;
		this.prefix = "";
		this.file_map = new Map();
		console.log(all_files);
		for(let file of all_files) {
			if(file.path.endsWith(".dme")) {
				this.dme_files.push(file.path);
			} else if(file.path.endsWith(".dmm") || file.path.endsWith(".dmp")) {
				this.dmm_files.push(file.path);
			}
			this.file_map.set(file.path.toLowerCase(), file);
		}
		this.dmm_files.sort();
		this.dme_files.sort();
		if(!this.dme_files.length) throw "No .dme file";
	}

	async initialize() {}

	async read_file(file_path) {
		/*let path_split = file_path.split(path.sep);
		let curr_handle = this.handle;
		for(let i = 0; i < path_split.length; i++) {
			let part = path_split[i];
			let next_handle;
			if(i == path_split.length - 1)
				next_handle = await curr_handle.getFile(part);
			else
				next_handle = await curr_handle.getDirectory(part);
			curr_handle = next_handle;
		}
		if(!curr_handle.isFile) throw new Error("Not a file");
		return await curr_handle.getFile();*/
		let pathlow = file_path.toLowerCase();
		let file = this.file_map.get(pathlow);
		if(!file) throw new Error("Non-existent file " + file_path);
		if(file_path != file.path) {
			console.warn(`Case of path doesn't match - in code: '${file_path}', in file system: '${file.path}'`);
		}
		return await file.handle.getFile();
	}

	static async walk_directory(handle, full_path = "") {
		let arr = [];
		for await(const sub_handle of handle.getEntries()) {
			let sub_full_path = path.join(full_path, sub_handle.name);
			if(sub_handle.name == ".git" || sub_handle.name == "node_modules") continue;
			if(sub_full_path == "tools" || sub_full_path == "data/logs") continue;
			if(sub_handle.isDirectory) {
				arr.push(await this.walk_directory(sub_handle, sub_full_path));
			} else {
				arr.push({'path': sub_full_path, 'handle': sub_handle});
			}
		}
		return arr.flat();
	}

	static async from_directory_handle(editor, handle) {
		let walked;
		editor.set_loading();
		try {
			walked = await this.walk_directory(handle);
		} finally {
			editor.clear_loading();
		}
		return new NativeFsFileContext(editor, handle, walked);
	}

	add_file_menu_options(menu, base) {
		base.appendChild(menu.build_menu_item({
			label: "Save",
			click_handler: this.save_map.bind(this, undefined),
			disabled: !this.editor.dmm
		}));
		base.appendChild(menu.build_menu_item({
			label: "Validate All Maps",
			click_handler: this.validate_maps.bind(this, undefined)
		}));
	}

	async save_map(dmm = this.editor.dmm) {
		if(!dmm) return;
		if(!dmm.filename) {
			dmm.filename = "untitled-" + Math.floor(Math.random() * 100000) + ".dmm";
		}
		
		let handle = this.file_map.has(dmm.filename.toLowerCase()) ? this.file_map.get(dmm.filename.toLowerCase()).handle : null;
		this.editor.set_loading();
		try {
			let dmm_as_string = dmm.toString();
			if(!handle) {
				handle = this.handle;
				let parts = dmm.filename.split(/[\/\\]/g);
				parts = parts.filter(part => {return part.trim().length > 0});
				for(let i = 0; i < parts.length; i++) {
					let part = parts[i];
					if(i == parts.length - 1) {
						handle = await handle.getFile(part, {create: true});
					} else {
						handle = await handle.getDirectory(part, {create: true});
					}
				}
				this.file_map.set(dmm.filename.toLowerCase(), handle);
			}
			let writer = await handle.createWriter();
			await writer.write(0, dmm_as_string);
			await writer.close();
			dmm.modified = false;
		} finally {
			this.editor.clear_loading();
		}
	}

	async validate_maps() {
		if(await new MessagePanel(this.editor, {title: "Validate maps?", modal: false, options: ["Yes", "No"], message: "This will open all the map files in your workspace and re-save them, applying any rules such as set_instance_var() or instance_var_whitelist. Are you sure you want to continue?"}).wait_until_close() != "Yes") return;
		if(this.editor.file_context != this) return;
		let progress_bar = new ProgressBarPanel(editor, "Validating...", true);
		let num_errors = 0;
		try {
			for(let i = 0; i < this.dmm_files.length; i++) {
				let filename = this.dmm_files[i];
				progress_bar.set_progress(i / this.dmm_files.length, filename);
				try {
					let dmm_text = await this.editor.read_text_file(filename);
					let dmm = new DMM(this.editor.parser, filename, dmm_text);
					await this.save_map(dmm);
				} catch(e) {
					num_errors++;
					console.error("While validating " + filename + ":");
					console.error(e);
				}
			}
		} finally {
			progress_bar.close();
		}
		if(num_errors > 0) {
			await new MessagePanel(this.editor, {title: "Error", modal: false, options: ["OK"], message: num_errors + " map" + (num_errors > 1 ? "s" : "") + " failed to validate. Please check the console for details.", message_classes: ["error-text"], }).wait_until_close();
		}
	}
}