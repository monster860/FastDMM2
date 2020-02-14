'use strict';

/** @typedef {import("./parser/typedef")} ByondType */
class ObjTreeWindow {
	/**
	 * 
	 * @param {import("./editor")} editor 
	 */
	constructor(editor) {
		this.editor = editor;
		this.container = document.getElementById("objtree-window");
		this.search_bar = document.getElementById("objtree-search");
		this.tree_elem = document.createElement("div");
		this.list_elem = document.createElement("div");
		this.container.appendChild(this.tree_elem);

		this.container.addEventListener("click", this.click_handler.bind(this));
		this.search_bar.addEventListener("input", this.search_input.bind(this));
		this.search_bar.addEventListener("keydown", this.search_keydown.bind(this));
		this.is_searching = false;

		this.node_elements = new Map();
		this.node_elements_search = new Map();
		this.hidden_set = new Set();
		this.hidden_set_change_index = 0;
		/** @type {string} */
		this.selected_path = null;
	}

	/**
	 * 
	 * @param {boolean} searching 
	 */
	set_searching(searching) {
		if(searching == this.is_searching) return;
		if(searching) {
			if(this.tree_elem.parentElement == this.container)
				this.container.removeChild(this.tree_elem);
			this.container.appendChild(this.list_elem);
			this.container.scrollTop = 0;
		} else {
			if(this.list_elem.parentElement == this.container)
				this.container.removeChild(this.list_elem);
			this.container.appendChild(this.tree_elem);
		}
		this.is_searching = searching;
	}

	/**
	 * 
	 * @param {MouseEvent} e 
	 */
	click_handler(e) {
		let tree_item = e.target.closest(".tree-item");
		let elem = e.target.closest(".tree-item-expander");
		if(elem) {
			if(tree_item.classList.contains("expanded")) {
				tree_item.classList.remove("expanded");
				tree_item.querySelector(".tree-item-content").innerHTML = "";
			} else {
				this.fill_children(tree_item.dataset.typepath);
				tree_item.classList.add("expanded");
			}
			e.preventDefault();
			return;
		}
		elem = e.target.closest(".tree-item-eye");
		if(elem) {
			this.set_hidden_recursive(tree_item.dataset.typepath, !tree_item.classList.contains("viewport-hide"));
			this.hidden_set_change_index++;
			e.preventDefault();
			return;
		}
		elem = e.target.closest(".tree-item-header");
		if(elem) {
			if(this.selected_path != tree_item.dataset.typepath) {
				this.set_selected(tree_item.dataset.typepath, false, false);
			}
			e.preventDefault();
			return;
		}
	}

	search_input() {
		let search_text = this.search_bar.value;
		let do_search = search_text.length > 0;
		this.set_searching(do_search);
		if(do_search) {
			let amount_done = 0;
			for(let elem of [...this.list_elem.children]) {
				if(!elem.dataset.typepath.includes(search_text)) {
					this.list_elem.removeChild(elem);
				}
			}
			// optimized DOM code just for firefox because DOM on firefox is slow as shizz for some reason.
			let insertion_fragment = new DocumentFragment();
			let insert_before_item = this.list_elem.firstChild;
			for(let [type, type_obj] of this.sorted_types) {
				if(!type.includes(search_text)) continue;
				amount_done++;
				if(amount_done > 200) break;
				let elem = this.create_or_get_list_node(type, type_obj);
				if(elem) {
					if(elem == insert_before_item) {
						this.list_elem.insertBefore(insertion_fragment, elem);
						insertion_fragment = new DocumentFragment();
						insert_before_item = insert_before_item.nextSibling;
					} else {
						insertion_fragment.appendChild(elem);
					}
				}
			}
			if(insert_before_item) {
				this.list_elem.insertBefore(insertion_fragment, insert_before_item);
			} else {
				this.list_elem.appendChild(insertion_fragment);
			}
		} else {
			if(this.selected_path) {
				this.set_selected(this.selected_path, true); // scroll into view and expand the node in question
			}
		}
	}
	/**
	 * 
	 * @param {MouseEvent} e 
	 */
	search_keydown(e) {
		if(!this.search_bar.value) return;
		if(e.code == "Enter" || e.code == "Escape") {
			if(e.code == "Enter" && this.list_elem.children.length && !this.list_elem.querySelector(".selected")) {
				this.set_selected(this.list_elem.firstChild.dataset.typepath);
			}
			this.search_bar.value = "";
			this.search_input();
			e.target.blur();
			e.preventDefault();
		} else if(e.code == "ArrowDown" && this.list_elem.children.length) {
			let selected_elem = this.list_elem.querySelector(".selected");
			let to_select = (selected_elem && selected_elem.nextSibling) || this.list_elem.firstChild;
			this.set_selected(to_select.dataset.typepath);
			e.preventDefault();
		} else if(e.code == "ArrowUp" && this.list_elem.children.length) {
			let selected_elem = this.list_elem.querySelector(".selected");
			let to_select = selected_elem && selected_elem.previousSibling;
			if(to_select) {
				this.set_selected(to_select.dataset.typepath);
			}
			e.preventDefault();
		} 
	}

	/**
	 * 
	 * @param {string} item 
	 * @param {boolean} fill 
	 * @param {ByondType} [type_obj]
	 * @param {HTMLDivElement} [parent_elem]
	 */
	create_or_get_node(item, fill = false, type_obj, parent_elem) {
		let attempt = this.node_elements.get(item);
		if(attempt && attempt.parentElement) {
			if(fill) this.fill_children(item, type_obj, attempt.querySelector('.tree-item-content'));
			return attempt;
		}
		if(!type_obj) type_obj = this.editor.parser.types.get(item);
		if(!type_obj) {
			console.warn("No type object for " + item + " in object tree");
			return;
		}
		if(!parent_elem) {
			if(["/area", "/mob", "/obj", "/turf"].includes(item)) {
				parent_elem = this.tree_elem;
			} else if(type_obj.parent) {
				parent_elem = this.create_or_get_node(type_obj.parent.path, true, type_obj.parent);
				if(parent_elem) {
					parent_elem = parent_elem.querySelector(".tree-item-content");
				}
				attempt = this.node_elements.get(item);
				if(attempt && attempt.parentElement) {
					if(fill) this.fill_children(item, type_obj, attempt.querySelector('.tree-item-content'));
					return attempt;
				}
			}
		}
		if(!parent_elem) {
			console.warn("No parent element for " + item + " in object tree");
			return;
		}
		if(attempt) {
			parent_elem.appendChild(attempt);
			return attempt;
		}
		let elem = document.createElement("div");
		elem.classList.add("tree-item");
		elem.dataset.typepath = item;
		this.node_elements.set(item, elem);
		
		this.make_item_header(elem, item, type_obj, true);

		let content = document.createElement("div");
		content.classList.add("tree-item-content");
		elem.appendChild(content);

		parent_elem.appendChild(elem);

		if(fill) this.fill_children(item, type_obj, content);

		return elem;
	}

	/**
	 * 
	 * @param {string} item 
	 * @param {ByondType} [type_obj]
	 */
	create_or_get_list_node(item, type_obj) {
		let attempt = this.node_elements_search.get(item);
		if(attempt) return attempt;
		if(!type_obj) type_obj = this.editor.parser.types.get(item);

		let elem = document.createElement("div");
		elem.classList.add("tree-item");
		elem.dataset.typepath = item;
		
		this.make_item_header(elem, item, type_obj, false, true);

		this.node_elements_search.set(item, elem);
		return elem;
	}

	/**
	 * 
	 * @param {HTMLDivElement} elem 
	 * @param {string} item 
	 * @param {ByondType} [type_obj]
	 * @param {boolean} [include_expander]
	 * @param {boolean} [use_full_name]
	 */
	make_item_header(elem, item, type_obj, include_expander, use_full_name = false) {
		let header = document.createElement("div");
		header.classList.add("tree-item-header");
		if(this.selected_path == item)
			elem.classList.add("selected");
		elem.appendChild(header);

		if(include_expander) {		
			let expander = document.createElement("div");
			expander.classList.add("tree-item-expander");
			if(type_obj.subtypes.length == 0) expander.classList.add("leaf");
			header.appendChild(expander);
		}

		let eye = document.createElement("div");
		eye.classList.add("tree-item-eye");
		if(this.hidden_set.has(item))
			elem.classList.add("viewport-hide");
		header.appendChild(eye);

		let icon = document.createElement('img');
		icon.classList.add("tree-item-icon");
		header.appendChild(icon);
		this.editor.map_window.build_preview_icon(type_obj).then((icon_info) => {
			if(!icon_info) return;
			icon.src = icon_info.url;
		});
		
		let label = document.createElement("div");
		label.classList.add("tree-item-label");
		let text_to_put = item;
		if(!use_full_name && type_obj.parent && text_to_put.startsWith(type_obj.parent.path)) {
			text_to_put = text_to_put.substring(type_obj.parent.path.length + 1); // +1 to remove a slash because relative paths don't have slashes and if I include one then I'm adding confusion.
		}
		text_to_put = text_to_put.replace(/\//g, "/\u200B"); // insert zero-width spaces after the slashes so that word-wrapping can be done on them.
		label.textContent = text_to_put;
		header.appendChild(label);
	}

	/**
	 * 
	 * @param {string} type 
	 * @param {ByondType} [type_obj] 
	 * @param {HTMLDivElement} [elem] 
	 */
	fill_children(type, type_obj, elem) {
		if(!type_obj) type_obj = this.editor.parser.types.get(type);
		for(let subtype of type_obj.subtypes) {
			this.create_or_get_node(subtype.path, false, subtype, elem);
		}
	}

	build_tree() {
		this.selected_path = null;
		this.sorted_types = [...this.editor.parser.types].sort((a,b) => {return a[0] > b[0] ? 1 : -1}).filter(item=>{
			return item[1].istype("/area") || item[1].istype("/mob") || item[1].istype("/obj") || item[1].istype("/turf");
		});
		this.node_elements.clear();
		this.node_elements_search.clear();
		this.hidden_set.clear();
		this.tree_elem.innerHTML = "";
		for(let item of ["/area", "/mob", "/obj", "/turf"]) {
			this.create_or_get_node(item, false);
		}
	}

	set_selected(path, tree_centerscroll = false, search_centerscroll = true) {
		if(path == this.selected_path) return;
		for(let elem of [...this.node_elements.values()]) {
			elem.classList.remove('selected');
		}
		for(let elem of [...this.node_elements_search.values()]) {
			elem.classList.remove('selected');
		}
		let node = this.searching ? this.node_elements.get(path) : this.create_or_get_node(path, false);
		if(node) {
			let showing_node = node;
			while(showing_node && showing_node.classList.contains("tree-item")) {
				if(showing_node != node) {
					this.fill_children(showing_node.dataset.typepath, null, showing_node.querySelector(".tree-item-content"));
					showing_node.classList.add("expanded");
				}
				if(showing_node.parentElement) {
					showing_node = showing_node.parentElement.closest(".tree-item");
				} else {
					let type_obj = this.editor.parser.types.get(showing_node.dataset.typepath);
					showing_node = this.node_elements.get(type_obj.parent.path);
				}
			}
			node.classList.add("selected");
			setTimeout(() => {
				if(path == this.selected_path)
					node.scrollIntoView({block: tree_centerscroll ? 'center' : 'nearest', inline: 'nearest',  behavior: 'smooth'});
			}, 1);
		}
		this.selected_path = path;
		this.editor.instance_window.rebuild();
		this.editor.instance_window.set_selected(path);
		let search_node = this.node_elements_search.get(path);
		if(search_node) {
			search_node.classList.add("selected");
			search_node.scrollIntoView({block: search_centerscroll ? 'center' : 'nearest', inline: 'nearest'});
		}
	}

	set_hidden_recursive(type, hidden = false, type_obj) {
		if(!type_obj) type_obj = this.editor.parser.types.get(type);
		if(!type_obj) return;
		let elem = this.node_elements.get(type);
		if(elem) {
			if(hidden) {
				elem.classList.add("viewport-hide");
			} else {
				elem.classList.remove("viewport-hide");
			}
		}
		let search_elem = this.node_elements_search.get(type);
		if(search_elem) {
			if(hidden) {
				search_elem.classList.add("viewport-hide");
			} else {
				search_elem.classList.remove("viewport-hide");
			}
		}
		if(hidden) {
			this.hidden_set.add(type);
		} else {
			this.hidden_set.delete(type);
		}
		for(let subtype of type_obj.subtypes) {
			this.set_hidden_recursive(subtype.path, hidden, subtype);
		}
	}
}

module.exports = ObjTreeWindow;