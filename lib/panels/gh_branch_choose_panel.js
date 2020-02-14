const Panel = require('./_panel.js');
const dropdown = require('../dropdown.js');

module.exports = class GithubBranchChoosePanel extends Panel {
	constructor(editor, branches, default_branch) {
		super(editor, {title: "Choose a branch or commit", width: 365, height: 110, can_close: false, modal: true});

		this.branches = branches;

		this.content_obj.innerHTML = `
		<div class='small-vertical-margins'>
			<div class='button dropdown branch-dropdown' style='width:335px'><span class='branch-text' contenteditable></span></div>
		</div>
		<div class='small-vertical-margins center'>
			<div class='button ok-button'>OK</div>
			<div class='button cancel-button'>Cancel</div>
		</div>
		`;
		this.branches = branches;
		this.branch_dropdown = this.$(".branch-dropdown");
		this.branch_text = this.$(".branch-text");

		let menu = document.createElement("div");
		menu.classList.add("dropdown-content");
		for(let branch_obj of branches) {
			let entry = document.createElement("div");
			entry.classList.add("button", "dropdown-item");
			entry.textContent = branch_obj.name;
			entry.addEventListener("click", (e) => {
				e.preventDefault();
				this.branch_text.textContent = branch_obj.name;
				this.branch_dropdown.removeChild(this.menu_div);
				this.refresh_selected();
			});
			if(menu.children.length && branch_obj.name == default_branch) {
				menu.insertBefore(entry, menu.firstElementChild);
			} else {
				menu.appendChild(entry);
			}
		}
		this.branch_text.textContent = default_branch;

		this.menu_div = menu;

		this.branch_dropdown.addEventListener("click", (e) => {
			if(e.defaultPrevented)
				return;
			let sel_elem = this.refresh_selected();
			dropdown(this.branch_dropdown, this.menu_div);
			if(sel_elem)
				sel_elem.scrollIntoView({behavior: "instant"});
		});
		this.branch_dropdown.addEventListener("dblclick", () => {
			this.branch_text.focus();
		});
		this.branch_text.addEventListener("input", (e) => {
			this.branch_text.textContent = this.branch_text.textContent.replace(/[\r\n]/i, "");
			this.refresh_selected();
		});

		this.$(".ok-button").addEventListener("click", () => {
			if(!this.is_branch_valid())
				return;
			this.close_response = this.branch_text.textContent;
			this.close();
		});
		this.$(".cancel-button").addEventListener("click", () => {
			this.close_response = null;
			this.close();
		});
	}

	is_branch_valid() {
		let branch_selected = this.branch_text.textContent;
		for(let branch of this.branches) {
			if(branch.name == branch_selected) {
				return true;
			}
		}
		return /^[0-9a-f]{40}$/i.test(branch_selected);
	}

	refresh_selected() {
		let branch_selected = this.branch_text.textContent;
		let retval;
		for(let item of this.menu_div.children) {
			if(item.textContent.toLowerCase() == branch_selected.toLowerCase()) {
				if(item.textContent != branch_selected) this.branch_text.textContent = item.textContent;
				item.classList.add("selected");
				retval = item;
			} else {
				item.classList.remove("selected");
			}
		}
		if(this.is_branch_valid())
			this.$(".ok-button").classList.remove("disabled");
		else
			this.$(".ok-button").classList.add("disabled");
		return retval;
	}
}