'use strict';
const dropdown = require('../dropdown.js');
const MessagePanel = require('../panels/message_panel.js');

module.exports = class Menu {
	constructor(editor) {
		/** @type {import("../editor.js")} */
		this.editor = editor;
	}

	build_menu() {
		return this.build_menu_base();
	}

	build_menu_item({label = "", click_handler = null, click_handler_args = [], submenu = null, submenu_args = [], close_on_click = undefined, disabled = false, classes_to_add = [], fa_icon = null} = {}) {
		if(close_on_click === undefined) close_on_click = !!click_handler;
		let elem = document.createElement("div");
		if(fa_icon) {
			let fa_span = document.createElement("span");
			fa_span.classList.add("fas");
			fa_span.classList.add(fa_icon);
			elem.appendChild(fa_span);
		}
		if(label instanceof Array) {
			elem.append(...label);
		} else {
			elem.append(label);
		}
		elem.classList.add("button", "dropdown-item", ...classes_to_add);
		if(disabled) elem.classList.add("disabled");
		if(submenu && !disabled) {
			elem.classList.add("dropdown");
			elem.addEventListener("mouseover", (e) => {
				if(e.defaultPrevented) return;
				e.preventDefault();
				if(elem.querySelector(".dropdown-content")) return;
				let submenu_elem = submenu.build_menu(...submenu_args);
				if(submenu) {
					dropdown(elem, submenu_elem);
				}
			});
		}
		elem.addEventListener("mousedown", async (e) => {
			if(close_on_click && !disabled) {
				document.activeElement.blur();
			}
			e.preventDefault();
			if(click_handler && !disabled) {
				try {
					await click_handler.call(this, e, ...click_handler_args);
				} catch(e) {
					console.error(e);
					new MessagePanel(this.editor, {title: "Error", message: ""+e, modal: false, message_classes: ["error-text"]});
				}
			}
		});
		return elem;
	}

	build_menu_base() {
		let menu = document.createElement("div");
		menu.classList.add("dropdown-content", "menu-dropdown");
		return menu;
	}

	/**
	 * 
	 * @param {HTMLDivElement} menubar 
	 * @param {string} name 
	 */
	add_to_menubar(menubar, name) {
		let menu_parent = document.createElement("div");
		menu_parent.classList.add("button", "menubar-item");
		menu_parent.textContent = name;
		menu_parent.addEventListener("mousedown", (e) => {
			if(e.defaultPrevented) return;
			let menu_elem = this.build_menu();
			dropdown(menu_parent, menu_elem);
			e.preventDefault();
		});
		menubar.appendChild(menu_parent);
	}
}