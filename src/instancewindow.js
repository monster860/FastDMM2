'use strict';
const {Instance} = require('./parser/dmm.js');
const byond_stringify = require('./parser/stringify.js');

module.exports = class InstanceWindow {
	/**
	 * 
	 * @param {import("./editor")} editor 
	 */
	constructor(editor) {
		this.editor = editor;
		/** @type {string} */
		this.selected = null;
		this.container = document.getElementById("instancewindow");
		/** @type {Map<string,Instance>} */
		this.map_instances = new Map();
		this.using_variants = false;
		this.container.addEventListener("click", this.handle_click.bind(this));
	}

	handle_click(e) {
		if(!e.target) return;
		let leaf = e.target.closest(".variant-leaf");
		if(leaf && leaf.dataset.instance) {
			this.set_selected(leaf.dataset.instance);
		}
	}

	set_selected(item, centerscroll = false) {
		if(item == this.selected || !item) return;
		let base_path = item;
		if(item.includes('{')) base_path = item.substring(0, item.indexOf("{"));
		if(base_path != this.editor.objtree_window.selected_path) {
			this.editor.objtree_window.set_selected(base_path, centerscroll, centerscroll);
		}
		this.selected = item;
		for(let elem of this.container.querySelectorAll(`.variant-leaf`)) {
			if(elem.dataset.instance == item) {
				elem.classList.add("selected");
				elem.scrollIntoView({block: centerscroll ? 'center' : 'nearest', inline: 'nearest',  behavior: 'smooth'});
			} else {
				elem.classList.remove("selected");
			}
		}
	}

	rebuild() {
		this.container.innerHTML = '';
		this.using_variants = false;
		let used_instances = [];
		for(let item of this.map_instances) {
			if(item[1].type != this.editor.objtree_window.selected_path) continue;
			used_instances.push(item);
		}
		used_instances.sort((a,b) => {return a[0] > b[0] ? 1 : -1;});
		for(let [str, instance] of used_instances) {
			this.container.appendChild(this.build_single_instance(str, instance));
		}
	}

	build_single_instance(str, instance) {
		let container = document.createElement("div");
		container.classList.add("vertical-node-container");
		
		let base_element = document.createElement("div");
		base_element.classList.add("variant-node", "variant-leaf");
		base_element.dataset.instance = str;
		container.appendChild(base_element);

		let img_element = document.createElement("img");
		base_element.appendChild(img_element);
		this.editor.map_window.build_preview_icon(instance).then((info) => {
			img_element.src = info.url;
			img_element.width = info.width;
			img_element.height = info.height;
		});

		if(instance.vars.size) {
			let label = document.createElement("pre");
			let encoded_vars = [];
			for(let [key, val] of [...instance.vars].sort((a,b) => {return a[0] > b[0] ? 1 : -1;})) {
				encoded_vars.push(key + " = " + byond_stringify(val));
			}
			label.textContent = encoded_vars.join("\n");
			container.appendChild(label);
		}

		return container;
	}

	add_instance(str) {
		let new_instance = new Instance(this.editor.parser, str);// instance constructor automatically parses like {var = "whatever";} shizz.
		this.map_instances.set(str, new_instance);
		let objtree_sel = this.editor.objtree_window.selected_path;
		if(!this.using_variants && objtree_sel && (objtree_sel == str || (str.startsWith(objtree_sel + "{")))) {
			let before_elem = null;
			for(let item of this.container.querySelectorAll(`.variant-leaf`)) { // this could be a binary search for sanic-er speed but meh I'm too lazy.
				if(item.dataset.instance > str) {
					before_elem = item.closest('.vertical-node-container');
					break;
				}
			}
			let new_elem = this.build_single_instance(str, new_instance);
			if(before_elem) {
				this.container.insertBefore(new_elem, before_elem);
			} else {
				this.container.appendChild(new_elem, before_elem);
			}
		}
	}
	remove_instance(str) {
		this.map_instances.delete(str);
		let objtree_sel = this.editor.objtree_window.selected_path;
		if(!this.using_variants && objtree_sel && (objtree_sel == str || (str.startsWith(objtree_sel + "{")))) {
			for(let item of this.container.querySelectorAll(`.variant-leaf`)) {
				if(item.dataset.instance == str) {
					let node = item.closest('.vertical-node-container');
					node.parentElement.removeChild(node);
				}
			}
		}
	}
}