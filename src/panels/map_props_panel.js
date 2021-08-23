const Panel = require('./_panel.js');

module.exports = class MapPropsPanel extends Panel {
	/**
	 * 
	 * @param {import("../editor")} editor 
	 * @param {import("../parser/dmm")} dmm 
	 * @param {string} title 
	 * @param {boolean} modal 
	 */
	constructor(editor, dmm, title = "Map Options") {
		super(editor, {title, width: 400, height: 300, can_close: true});

		/** @type {{dmm:import("../parser/dmm"),maxx:number,maxy:number,maxz:number,filename:string}} */
		this.close_response = null;

		this.content_obj.innerHTML = `
			<div class='vertical-margins'>
				<input type='text' class='button filename-input' pattern='^(?=\.*[^?%*:|"<>\.])[^?%*:|"<>]+$' style='width:100%'>
			</div>
			<div class='vertical-margins'>
				<table>
					<tr><td>Width</td><td><input type='number' class='button maxx-input'></td></tr>
					<tr><td>Height</td><td><input type='number' class='button maxy-input'></td></tr>
					<tr><td>Z-levels</td><td><input type='number' class='button maxz-input'></td></tr>
				</table>
			</div>
		`;

		/** @type {HTMLInputElement} */
		let filename_input = this.$('.filename-input');
		let path_prefix = "";
		if(this.editor.dmm) {
			let search = /^([^/\\]+[/\\])+/.exec(this.editor.dmm.filename);
			if(search) path_prefix = search[0];
		}
		filename_input.value = dmm ? dmm.filename : (path_prefix + "untitled-" + Math.floor(Math.random()*100000)+".dmm");

		/** @type {HTMLInputElement} */
		let maxx_input = this.$('.maxx-input');
		maxx_input.min = 1;
		maxx_input.max = 1024;
		maxx_input.value = dmm ? dmm.maxx : 10;

		/** @type {HTMLInputElement} */
		let maxy_input = this.$('.maxy-input');
		maxy_input.min = 1;
		maxy_input.max = 1024;
		maxy_input.value = dmm ? dmm.maxy : 10;

		/** @type {HTMLInputElement} */
		let maxz_input = this.$('.maxz-input');
		maxz_input.min = 1;
		maxz_input.max = 64;
		maxz_input.value = dmm ? dmm.maxz : 1;
		
		let ok_button = document.createElement("div");
		ok_button.classList.add("button");
		ok_button.textContent = "OK";
		ok_button.addEventListener("click", () => {
			if(+maxx_input.value < 1) maxx_input.value = 1;
			if(+maxy_input.value < 1) maxy_input.value = 1;
			if(+maxz_input.value < 1) maxz_input.value = 1;
			this.close_response = {
				dmm,
				filename: filename_input.value.replace(/\\/g, "/"),
				maxx: +maxx_input.value,
				maxy: +maxy_input.value,
				maxz: +maxz_input.value,
			};
			this.close();
		});
		this.footer_obj.appendChild(ok_button);

		let cancel_button = document.createElement("div");
		cancel_button.classList.add("button");
		cancel_button.textContent = "Cancel";
		cancel_button.addEventListener("click", () => {
			this.close_response = null;
			this.close();
		});
		this.footer_obj.appendChild(cancel_button);
	}
}