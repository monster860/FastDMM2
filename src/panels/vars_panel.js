const Panel = require('./_panel.js');
const stringify_byond = require('../parser/stringify.js');
const check_loader_compatibility = require('../parser/loader_compatibility.js');
const DMM = require('../parser/dmm.js');
const MessagePanel = require('./message_panel.js');
const {ByondTypepath} = require('../parser/static_values.js');
const {Instance} = require('../parser/dmm.js');

/** @typedef {import("../parser/dmm").Tile} Tile */
/** @typedef {import("../parser/dmm").Instance} Instance */
module.exports = class EditVarsPanel extends Panel {
	/**
	 * 
	 * @param {import("../editor")} editor 
	 * @param {Tile} tile 
	 * @param {Instance} instance 
	 */
	constructor(editor, tile, instance) {
		super(editor, {title: instance.get_var("name"), width: 400, height: 600});

		this.tile = tile;
		this.original_instance = instance;
		this.instance = instance;

		this.instance_vars = new Map([...instance.vars]);

		this.footer_obj.classList.add("edit-vars-footer");
		this.content_obj.classList.add("edit-vars-content");
		this.content_obj.innerHTML = `<input type='text' class='vv-search-box' placeholder="Search"></input><table class='var-table'></table>`;
		this.search_text = null;
		this.populate();

		this.content_obj.addEventListener("dblclick", this.handle_dblclick.bind(this));

		let ok_button = document.createElement("div");
		ok_button.classList.add("button");
		ok_button.textContent = "OK";
		let cancel_button = document.createElement("div");
		cancel_button.classList.add("button");
		cancel_button.textContent = "Cancel";
		this.footer_obj.appendChild(ok_button);
		this.footer_obj.appendChild(cancel_button);
		cancel_button.addEventListener("click", ()=>{this.close();});
		ok_button.addEventListener("click", () => {
			let inst_index = this.tile.contents.indexOf(this.original_instance);
			if(inst_index != -1) {
				let new_instance = new DMM.Instance(this.instance.context, this.instance.type, this.instance_vars);
				this.tile.replace_object(inst_index, new_instance);
			} else {
				new MessagePanel(this.editor, {title: "Error", message: "The instance you are editing no longer exists", modal: false, message_classes: ["error-text"]});
			}
			this.close();
		});
		this.$('.vv-search-box').addEventListener("input", (e) => {
			this.search_text = e.target.value;
			this.populate();
		});
	}

	populate() {
		let var_table = this.$('.var-table');
		var_table.innerHTML = "";
		if(this.search_text) {
			let has_error_header = false;
			for(let key of [...this.instance_vars.keys()].sort()) {
				if(!key.includes(this.search_text)) continue;
				if(this.instance.type_obj && this.instance.type_obj.get_var_meta(key)) continue;
				if(!has_error_header) {
					this.add_header_row('Undefined Vars', ['error-text']);
					has_error_header = true;
				}
				this.add_var_row(key);
			}
			for(let type_obj = this.instance.type_obj; type_obj != null; type_obj = type_obj.parent) {
				if(!type_obj.var_metas.size) continue;
				let did_put_header_row = false;
				for(let key of [...type_obj.var_metas.keys()].sort()) {
					if(!key.includes(this.search_text)) continue;
					if(!did_put_header_row) {
						did_put_header_row = true;
						this.add_header_row(type_obj.path);
					}
					this.add_var_row(key);
				}
			}
			return;
		}
		let pinned_vars = this.instance.get_fastdmm_prop("pinned_vars", this.instance.make_eval_context());
		if(pinned_vars && pinned_vars.keys.length) {
			this.add_header_row("Pinned");
			for(let varname of pinned_vars.keys) {
				this.add_var_row(varname);
			}
		}
		let has_error_header = false;
		for(let key of [...this.instance_vars.keys()].sort()) {
			if(this.instance.type_obj && this.instance.type_obj.get_var_meta(key)) continue;
			if(!has_error_header) {
				this.add_header_row('Undefined Vars', ['error-text']);
				has_error_header = true;
			}
			this.add_var_row(key);
		}
		for(let type_obj = this.instance.type_obj; type_obj != null; type_obj = type_obj.parent) {
			if(!type_obj.var_metas.size) continue;
			this.add_header_row(type_obj.path);
			for(let key of [...type_obj.var_metas.keys()].sort()) {
				this.add_var_row(key);
			}
		}
	}

	add_header_row(text, classes) {
		let var_table = this.$('.var-table');
		let header_tr = document.createElement("tr");
		let header_th = document.createElement("th");
		if(classes) {
			header_th.classList.add(...classes);
		}
		header_th.colSpan = 2;
		header_th.textContent = text;
		header_th.title = text;
		header_tr.appendChild(header_th);
		var_table.appendChild(header_tr);
	}
	add_var_row(varname) {
		let var_table = this.$('.var-table');
		let item_tr = document.createElement("tr");
		let item_td_name = document.createElement("td");
		item_td_name.textContent = varname;
		item_td_name.title = varname;
		let item_td_value = document.createElement("td");
		item_td_value.dataset.varname = varname;
		let text_value = stringify_byond(this.instance.get_var(varname));
		if(this.instance_vars.has(varname)) item_td_value.classList.add("var-value-modified");
		item_td_value.textContent = text_value;
		item_td_value.title = text_value;
		item_tr.appendChild(item_td_name);
		item_tr.appendChild(item_td_value);
		var_table.appendChild(item_tr);
	}

	update_var(varname) {
		if(varname == "type") {
			this.populate();
			return;
		}
		for(let elem of this.$$('[data-varname='+varname+']')) {
			if(this.instance_vars.has(varname)) {
				elem.classList.add("var-value-modified");
			} else {
				elem.classList.remove("var-value-modified");
			}
			elem.textContent = stringify_byond(this.instance_vars.has(varname) ? this.instance_vars.get(varname) : this.instance.type_obj.get_var(varname));
			elem.title = elem.textContent;
		}
	}

	handle_dblclick(e) {
		let td = e.target.closest("td");
		if(td && td.dataset.varname) {
			let varname = td.dataset.varname;
			td.contentEditable = true;
			td.focus();
			let selection = window.getSelection();
			let select_range = document.createRange();
			select_range.selectNodeContents(td);
			selection.removeAllRanges();
			selection.addRange(select_range);
			let finish = () => {
				td.removeEventListener("keydown", keydown_listener);
				td.removeEventListener("focusout", focusout_listener);
				td.removeEventListener("input", input_listener);
				td.contentEditable = false;
				this.update_var(varname);
			};
			let keydown_listener = async (e) => {
				if(e.code == "Enter") {
					e.preventDefault();
					let text = td.textContent;
					if(text.trim() == "") {
						this.instance_vars.delete(varname);
						finish();
					} else {
						finish();
						try {
							let new_value = await this.editor.parser.eval_text(text);
							if(!check_loader_compatibility(new_value)) {
								if(await new MessagePanel(this.editor, {title: "Warning", message: `The value you have entered (${stringify_byond(new_value)}) may not be parsed correctly by some map parsers. Are you sure you wish to enter this value?`, modal: true, message_classes: ["warning-text"], options: ["Yes", "No"]}).wait_until_close() != "Yes") {
									return;
								}
							}
							if(varname == "type") {
								if(!(new_value instanceof ByondTypepath) || !this.editor.parser.types.has(new_value.path)) {
									throw new Error("Not a valid type");
								}
								this.search_text = null;
								this.$('.vv-search-box').value = "";
								this.instance = new Instance(this.instance.context, new_value.path, this.instance.vars);
							} else {
								this.instance_vars.set(varname, new_value);
							}
							finish();
						} catch(e) {
							console.error(e);
							new MessagePanel(this.editor, {title: "Error", message: e, modal: false, message_classes: ["error-text"]});
						}
					}
				} else if(e.code == "Escape") {
					e.preventDefault();
					finish();
				}
			};
			let focusout_listener = () => {
				finish();
			};
			let input_listener = (e) => {
				let ntc = td.textContent.replace(/\r?\n/g, "");
				if(td.textContent != ntc || td.childNodes.length != 1 || !(td.childNodes[0] instanceof Text))
					td.textContent = ntc;
			};
			td.addEventListener("keydown", keydown_listener);
			td.addEventListener("focusout", focusout_listener);
			td.addEventListener("input", input_listener);
		}
	}
}