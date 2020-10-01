'use strict';

module.exports = class WebkitDirectoryFileContext {
	constructor(editor, files) {
		this.dme_files = [];
		this.dmm_files = [];
		this.file_map = new Map();
		this.prefix = "";
		for(let item of files) {
			if(!this.prefix) {
				this.prefix = item.webkitRelativePath.substring(0, item.webkitRelativePath.indexOf("/") + 1);
			}
			let path = item.webkitRelativePath.substring(this.prefix.length);
			if(path.endsWith(".dme")) {
				this.dme_files.push(path);
			} else if(path.endsWith(".dmm") || path.endsWith(".dmp")) {
				this.dmm_files.push(path);
			}
			this.file_map.set(path.toLowerCase(), item);
		}
		this.dmm_files.sort();
		this.dme_files.sort();
		if(!this.dme_files.length) throw "No .dme file";
	}

	async initialize() {}

	read_file(path) {
		let pathlow = path.toLowerCase();
		let file = this.file_map.get(pathlow);
		if(!file) throw new Error("Non-existent file " + path);
		if(this.prefix + path != file.webkitRelativePath) {
			console.warn(`Case of path doesn't match - in code: '${path}', in file system: '${file.webkitRelativePath.substring(this.prefix.length)}'`);
		}
		return Promise.resolve(file);
	}
}