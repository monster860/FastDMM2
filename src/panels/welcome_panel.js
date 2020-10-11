const Panel = require('./_panel.js');

module.exports = class WelcomePanel extends Panel {
	constructor(editor, error = null) {
		super(editor, {title: "Open Environment", width: 520, height: 300, can_close: false, modal: true});

		if(editor.welcome_panel && editor.welcome_panel != this) {
			editor.welcome_panel.close();
        }
        editor.welcome_panel = this;

		this.header_obj.classList.add("center");
		this.content_obj.classList.add("center");
		this.content_obj.innerHTML = `
        <div class='error-text small-vertical-margins' style='color:red'></div>
		<div class='vertical-margins'>
            <div class='small-vertical-margins'><input class='button github-repo-field' type='text' value='' placeholder='Github Repository (Ex. tgstation/tgstation)' style='width:250px'></div>
			<div class='small-vertical-margins'><div class='button github-go-button'>Open Github Repository</div></div>
        </div>
        <div class='vertical-margins local-workspace'></div>
        <div class='vertical-margins'>
            <a href='https://github.com/monster860/FastDMM2' target="_blank">GitHub</a> | <a href='https://github.com/monster860/FastDMM2/issues/new' target="_blank">Report Issue</a>
        </div>
        `;
        
        if(error) this.$('.error-text').textContent = error;

		this.$(".github-go-button").addEventListener("click", () => {
            editor.has_meaningful_interact = true;
			this.try_initialize(editor.try_initialize_github(this.$('.github-repo-field').value));
        });
        this.$(".github-repo-field").addEventListener("keydown", (e) => {
            editor.has_meaningful_interact = true;
            if(e.code == "Enter") {
                e.preventDefault();
                this.try_initialize(editor.try_initialize_github(this.$('.github-repo-field').value));
            }
        });

        this.$(".github-repo-field").value = window.localStorage.getItem("last_successful_github_repo") || "yogstation13/yogstation";

        let local_workspace_elem = this.$('.local-workspace');
        if(window.showDirectoryPicker) {
            let button_elem = document.createElement("button");
            button_elem.classList.add("button");
            button_elem.textContent = "Open Local Workspace";
            let is_open_busy = false;
            button_elem.addEventListener("click", async () => {
                if(is_open_busy) return;
                try {
                    editor.has_meaningful_interact = true;
                    is_open_busy = true;
                    let dir_handle = await window.showDirectoryPicker();
                    this.try_initialize(editor.try_initialize_native_fs(dir_handle), () => {is_open_busy = false;});
                } catch(e) {
                    is_open_busy = false;
                    throw e;
                }
            });
            local_workspace_elem.appendChild(button_elem);
        } else {
            let input_elem = document.createElement("input");
            input_elem.type = "file";
            if(input_elem.webkitdirectory !== undefined) {
                input_elem.webkitdirectory = true;
                input_elem.addEventListener("change", () => {
                    editor.has_meaningful_interact = true;
                    this.try_initialize(editor.try_initialize_webkitdirectory(input_elem.files), ()=>{input_elem.value = "";});
                });
                local_workspace_elem.appendChild(input_elem);
            }
        }

		this.on("close", () => {
			editor.welcome_panel = null;
		});
    }
    try_initialize(promise, fail_callback) {
        promise.then(() => {
            this.close();
        }, (err) => {
            if(err) {
                console.error(err);
                this.$(".error-text").textContent = err;
            } else {
                this.$(".error-text").textContent = "";
            }
            if(fail_callback) fail_callback();
        });
    }
}