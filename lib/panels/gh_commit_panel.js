const Panel = require('./_panel.js');

module.exports = class GithubCommitPanel extends Panel {
	/**
	 * 
	 * @param {import("../editor")} editor 
	 */
	constructor(editor, {allow_direct = true, allow_direct_branch = true, allow_fork_branch = true} = {}) {
		super(editor, {title: "Commit Changes", width: 600, height: 250, can_close: true});

		this.content_obj.innerHTML = `
			<div class='vertical-margins'>
				<input type='text' class='button commit-message' style='width:100%' placeholder='Commit Message (required)'>
			</div>
			<div class='vertical-margins'>
				<form class='commit-type'>
				</form>
			</div>
		`;

		/** @type {HTMLInputElement} */
		this.commit_input = this.$('.commit-message');

		/** @type {HTMLFormElement} */
		this.form = this.$('.commit-type');
		
		if(allow_direct) {
			this.make_radio_option("direct", `Commit your changes directly to ${this.editor.file_context.name}:${this.editor.file_context.branch_name}`, !allow_fork_branch);
		}
		if(allow_direct_branch) {
			this.make_radio_option("direct-branch", `Make a branch on ${this.editor.file_context.name} and open a pull request`, !allow_direct && !allow_fork_branch);
		}
		if(allow_fork_branch) {
			this.make_radio_option("fork-branch", `Make a branch on your fork of ${this.editor.file_context.name} and open a pull request`, true);
		}
		
		let ok_button = document.createElement("div");
		ok_button.classList.add("button");
		ok_button.textContent = "OK";
		ok_button.addEventListener("click", () => {
			if(!this.commit_input.value) {
				this.commit_input.focus();
				return;
			}
			let commit_type = null;
			for(let element of this.form) {
				if(element.name == "commit-type" && element.checked) {
					commit_type = element.value;
					break;
				}
			}
			if(!commit_type) return;
			this.close_response = {
				message: this.commit_input.value,
				commit_type
			};
			this.close();
		});
		this.footer_obj.appendChild(ok_button);

		let cancel_button = document.createElement("div");
		cancel_button.classList.add("button");
		cancel_button.textContent = "Cancel";
		cancel_button.addEventListener("click", () => {
			this.close();
		});
		this.footer_obj.appendChild(cancel_button);
	}

	make_radio_option(id, desc, autocheck = false) {
		let input = document.createElement("input")
		input.type = "radio";
		input.name = "commit-type";
		input.id = id;
		input.value = id;
		let label = document.createElement("label");
		label.htmlFor = id;
		label.textContent = desc;
		let div = document.createElement("div");
		div.appendChild(input);
		div.appendChild(label);
		this.form.appendChild(div);
		input.checked = autocheck;
	}
}