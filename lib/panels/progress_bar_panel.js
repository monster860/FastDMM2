const Panel = require('./_panel.js');

module.exports = class ProgressBarPanel extends Panel {
	constructor(editor, title = "Loading...", modal = true) {
		super(editor, {title, width: 600, height: 100, modal, can_close: false});

		

		this.header_obj.classList.add("center");
		this.content_obj.classList.add("center");
		this.content_obj.innerHTML = `
		<div class='bar'><div class='bar-fill progress-fill'></div></div>
		<div class='progress-text'></div>
        `;
	}
	
	set_progress(percent, text = undefined) {
		if(text != undefined) {
			this.$('.progress-text').textContent = text;
		}
		this.$('.progress-fill').style.width = (percent*100) + "%";
	}
}