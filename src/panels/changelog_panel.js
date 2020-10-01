const Panel = require('./_panel.js');

module.exports = class ChangelogPanel extends Panel {
	constructor(editor, {modal = true, changelog_data} = {}) {
		super(editor, {title: "What's New", width: 500, height: 500, modal, can_close: true});
		let clipped_cl = changelog_data.slice(Math.max(changelog_data.length - 100, 0));
		let last_date = null;
		let last_author = null;
		let els = [];
		/** @type {HTMLUListElement} */
		let last_ul = null;
		for(let i = 0; i < clipped_cl.length; i++) {
			let entry = clipped_cl[i];
			if(entry.date != last_date || !last_date) {
				last_ul = document.createElement("ul");
				els.push(last_ul);
				let h3 = document.createElement("h3");
				h3.textContent = entry.author;
				els.push(h3);
				let h2 = document.createElement("h2");
				h2.textContent = entry.date;
				els.push(h2);
				last_date = entry.date;
				last_author = entry.author;
			} else if(entry.author != last_author) {
				last_ul = document.createElement("ul");
				els.push(last_ul);
				let h3 = document.createElement("h3");
				h3.textContent = entry.author;
				els.push(h3);
				last_author = entry.author;
			}
			let li = document.createElement("li");
			li.textContent = entry.desc;
			if(last_ul.children.length) {
				last_ul.insertBefore(li, last_ul.firstChild);
			} else {
				last_ul.appendChild(li);
			}
		}
		els.reverse();
		for(let el of els) {
			this.content_obj.appendChild(el);
		}
	}
}