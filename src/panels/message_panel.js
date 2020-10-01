const Panel = require('./_panel.js');

module.exports = class MessagePanel extends Panel {
	constructor(editor, {title = "ree", message = "Heck", modal = true, options = ["OK"], message_classes = []} = {}) {
		super(editor, {title, width: 600, height: 130, modal, can_close: false});

		this.content_obj.classList.add("center");
		this.content_obj.innerHTML = `<div class='text'></div>`;
		for(let option of options) {
			let button = document.createElement("div");
			button.classList.add("button");
			button.textContent = option;
			button.addEventListener("click", () => {
				this.close_response = option;
				this.close();
			});
			this.footer_obj.appendChild(button);
		}
		let text_elem = this.$('.text');
		text_elem.textContent = message;
		text_elem.classList.add(...message_classes);
	}
	
	set_progress(percent, text = undefined) {
		if(text != undefined) {
			this.$('.progress-text').textContent = text;
		}
		this.$('.progress-fill').style.width = (percent*100) + "%";
	}
}