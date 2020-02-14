'use strict';
const GithubChooseBranchPanel = require('../panels/gh_branch_choose_panel.js');
const GithubCommitPanel = require('../panels/gh_commit_panel.js');
const ProgressBarPanel = require('../panels/progress_bar_panel.js');
const MessagePanel = require('../panels/message_panel.js');

module.exports = class GithubFileContext {
	constructor(editor, repo_name, branch_name, commit_hash, tree) {
		this.dme_files = [];
		this.dmm_files = [];
		this.tree_map = new Map();
		this.active_reads = new Map();

		this.use_tree(tree);
		if(!this.dme_files.length) throw "No .dme file";
		/** @type {import("../editor.js")} */
		this.editor = editor;
		this.name = repo_name;
		this.branch_name = branch_name;
		this.commit_hash = commit_hash;

		this.cache = null;
		this.cache_queue = [];
		this.cache_queue_timeout = null;

		this.cache_read_queue = [];
		this.cache_read_queue_timeout = null;
		
		window.localStorage.setItem("last_successful_github_repo", repo_name);
	}

	use_tree(tree) {
		this.dme_files.length = 0;
		this.dmm_files.length = 0;
		for(let item of tree.tree) {
			if(item.path.endsWith(".dme")) {
				this.dme_files.push(item.path);
			} else if(item.path.endsWith(".dmm") || item.path.endsWith(".dmp")) {
				this.dmm_files.push(item.path);
			}
		}
		this.dmm_files.sort();
		this.dme_files.sort();
		this.tree = tree;
		this.tree_map.clear();
		for(let item of this.tree.tree) {
			this.tree_map.set(item.path.toLowerCase(), item);
		}
		this.active_reads.clear();
	}

	async initialize() {
		if('indexedDB' in window) {
			try {
				if(navigator.storage && !(await navigator.storage.persisted()))
					await navigator.storage.persist();
				let db = await new Promise((resolve, reject) => {
					let request = window.indexedDB.open("fastdmm2_gh_blob_cache", 1);
					request.onsuccess = (e) => {resolve(e.target.result);}
					request.onerror = (e) => {reject(e);}
					request.onupgradeneeded = (e) => {
						let db = e.target.result;
						db.createObjectStore("blobs");
						let object_store_lastused = db.createObjectStore("last_used", {keyPath: "sha"});
						object_store_lastused.createIndex("last_used", "last_used", {unique: false});
					}
				});
				this.cache = db;
			} catch(e) {
				console.error(e);
			}
		}

	}

	read_file(path) {
		let tree_entry = this.tree_map.get(path.toLowerCase());
		if(!tree_entry) {
			throw new Error("Non-existent file " + path);
		}
		if(tree_entry.path != path) {
			console.warn(`Case of path doesn't match - in code: '${path}', in github: '${tree_entry.path}'`);
		}
		if(this.active_reads.has(tree_entry.path)) return this.active_reads.get(tree_entry.path);
		let promise;
		promise = (async () => {
			// uses force-cache because these are immutable when specifying a specific commit hash.
			let blob;
			let err;
			if(this.cache) {
				/*
				await new Promise(resolve => {
					let transaction = this.cache.transaction(["blobs"], "readonly");
					transaction.onerror = (e=> {err = e; resolve();});
					let object_store = transaction.objectStore("blobs");
					let object_store_request = object_store.get(tree_entry.sha);
					object_store_request.onsuccess = () => {
						let result = object_store_request.result;
						if(result) {
							this.enqueue_clear_cache_queue();
							this.cache_queue.push({"update_lastused": tree_entry.sha, "size": result.size});
							blob = result;
						}
						resolve();
					}
				});
				*/
				blob = await this.cache_read(tree_entry.sha);
			}
			if(!blob) {
				for(let i = 0; i < 5; i++) {
					try {
						let response = await fetch(`https://cdn.jsdelivr.net/gh/${this.name}@${this.commit_hash}/${tree_entry.path}`, {cache: "force-cache"});
						if(response.status != 200) throw new Error(`${response.status} ${response.statusText} - ${await response.text()}`);
						blob = await response.blob();
						err = null;
						break;
					} catch(e) {
						err = e;
						await new Promise(resolve => {setTimeout(resolve, 3000 + Math.random() * 2000);});
					}
				}
				if(this.cache) {
					this.cache_queue.push({"blob": blob, "sha": tree_entry.sha, "promise": promise, "path": tree_entry.path});
					this.enqueue_clear_cache_queue();
				} else {
					if(this.active_reads.get(tree_entry.path) == promise)
						this.active_reads.delete(tree_entry.path);
				}
			} else {
				if(this.active_reads.get(tree_entry.path) == promise)
					this.active_reads.delete(tree_entry.path);
			}
			if(err) throw err;
			return blob;
		})();
		this.active_reads.set(promise.blob);
		return promise;
	}

	cache_read(sha) {
		if(!this.cache_read_queue_timeout) this.cache_read_queue_timeout = setTimeout(this.clear_cache_read_queue.bind(this), 200);
		return new Promise(resolve => {
			this.cache_read_queue.push([sha, resolve]);
		});
	}

	clear_cache_read_queue() {
		let cache_read_queue = this.cache_read_queue;
		this.cache_read_queue = [];
		let transaction = this.cache.transaction(["blobs"], "readonly");
		transaction.onerror = (e=> {
			console.error(e);
			for(let item of cache_read_queue) item[1]();
		});
		let object_store = transaction.objectStore("blobs");
		for(let item of cache_read_queue) {
			let object_store_request = object_store.get(item[0]);
			object_store_request.onsuccess = () => {
				let result = object_store_request.result;
				if(result) {
					this.enqueue_clear_cache_queue();
					this.cache_queue.push({"update_lastused": item[0], "size": result.size});
				}
				item[1](result);
			}
			object_store_request.onerror = (err) => {
				item[1]();
			}
		}
		this.cache_read_queue_timeout = null;
	}

	enqueue_clear_cache_queue() {
		if(this.cache_queue_timeout) return;
		this.cache_queue_timeout = setTimeout(this.clear_cache_queue.bind(this), 1000);
	}

	async clear_cache_queue() {
		let cache_queue = this.cache_queue;
		this.cache_queue = [];
		try {
			let evicted_set;
			let free_space = 2**28;
			if(navigator.storage) {
				let storage_estimate = await navigator.storage.estimate();
				free_space = Math.min(storage_estimate.quota, 2**28) - storage_estimate.usage - 1000000;
				let amount_to_add = 0;
				for(let item of cache_queue) {
					if(item.blob) {
						amount_to_add += item.blob.size;
					}
				}
				if(amount_to_add > free_space) {
					evicted_set = await this.evict_cache(free_space, amount_to_add);
				}
				free_space = Math.min(storage_estimate.quota, 2**28) - storage_estimate.usage - 1000000
			};
			let timestamp = new Date().getTime();
			let transaction = this.cache.transaction(['last_used', 'blobs'], "readwrite");
			let last_used_store = transaction.objectStore('last_used');
			let blobs_store = transaction.objectStore('blobs');
			for(let item of cache_queue) {
				if(item.update_lastused) {
					if(evicted_set && evicted_set.has(item.update_lastused)) continue;
					last_used_store.put({
						sha: item.update_lastused,
						last_used: timestamp,
						size: item.size
					})
				} else if(item.blob) {
					if(evicted_set && evicted_set.has(item.sha)) continue;
					blobs_store.put(item.blob, item.sha);
					last_used_store.put({
						sha: item.sha,
						last_used: timestamp,
						size: item.blob.size
					});
				}
			}
			await new Promise((resolve, reject) => {
				transaction.onerror = reject;
				transaction.oncomplete = resolve;
			});
		} catch(e) {
			console.error(e);
		}
		this.cache_queue_timeout = null;
		for(let item of cache_queue) {
			if(item.path) {
				if(this.active_reads.get(item.path) == item.promise) {
					this.active_reads.delete(item.path);
				}
			}
		}
	}

	async evict_cache(remaining_space, amount_to_add) {
		if(amount_to_add <= remaining_space) return;
		let evicted_set = new Set();
		let transaction = this.cache.transaction(["last_used", "blobs"], "readwrite");
		let last_used_store = transaction.objectStore("last_used");
		let blobs_store = transaction.objectStore("blobs");
		let bytes_evicted = 0;

		last_used_store.index("last_used").openCursor().onsuccess = (event) => {
			let cursor = event.target.result;
			if(cursor) {
				let size = cursor.value.size;
				remaining_space += size;
				bytes_evicted += size;
				evicted_set.add(cursor.value.sha);
				cursor.delete();
				blobs_store.delete(cursor.value.sha);
				if(remaining_space < amount_to_add) {
					cursor.continue();
				}
			}
		};
		await new Promise((resolve, reject) => {
			transaction.oncomplete = resolve;
			transaction.onerror = reject;
		});
		console.log("Evicted " + evicted_set.size + " old objects (" + bytes_evicted + " bytes)");
		
	}

	add_file_menu_options(menu, base) {
		let has_token = localStorage.getItem("gh_token") != null;
		base.appendChild(menu.build_menu_item({
			label: has_token ? "Log Out of Github" : "Log Into Github",
			click_handler: has_token ? this.github_logout.bind(this) : this.github_login.bind(this)
		}));
		base.appendChild(menu.build_menu_item({
			label: "Commit Maps",
			click_handler: this.commit_maps.bind(this),
			disabled: !this.editor.dmm || !has_token
		}));
	}

	github_login() {
		window.open("https://github.com/login/oauth/authorize?client_id=0ffb004f786288b87437&scope=public_repo", "_blank");
	}
	github_logout() {
		localStorage.removeItem("gh_token");
	}

	async commit_maps() {
		this.editor.set_loading();
		let commit_options =  {allow_direct: false, allow_direct_branch: false, allow_fork_branch: false};
		let username;
		try {
			if(!localStorage.getItem("gh_token")) throw new Error("No Token");
			let user_info = await this.auth_result_json(await fetch(`https://api.github.com/user`, {
				headers: {"authorization": "token " + localStorage.getItem("gh_token")}
			}));
			username = user_info.login;
			if(!(this.name.startsWith(username + "/"))) {
				commit_options.allow_fork_branch = true;
			}

			// check if we're allowed to write to the repo
			try {
				let permission = await this.auth_result_json(await fetch(`https://api.github.com/repos/${this.name}/collaborators/${username}/permission`, {
					method: "GET",
					headers: {"authorization": "token " + localStorage.getItem("gh_token")}
				}));
				if(permission.permission == "admin" || permission.permission == "write") {
					if(this.branch_name != this.commit_hash)
						commit_options.allow_direct = true;
					commit_options.allow_direct_branch = true;
				}
			} catch(e) {
				console.warn(e);
			}
			
		} finally {
			this.editor.clear_loading();
		}
		let result = await new GithubCommitPanel(this.editor, commit_options).wait_until_close();
		if(!result) return;
		let progress_bar = new ProgressBarPanel(this.editor, "Committing changes", true);
		try {
			let target_repo;
			let target_branch;
			if(result.commit_type == "direct") {
				target_branch = this.branch_name;
				target_repo = this.name;
			} else {
				target_branch = ("fdmm-patch-" + Math.floor(Math.random() * 100000000) + "-" + username).substring(0,40);
				if(result.commit_type == "direct-branch") {
					target_repo = this.name;
				} else { // fork branch
					progress_bar.set_progress(0, "Creating fork...");
					// first we make a fork
					if(!localStorage.getItem("gh_token")) throw new Error("No Token");
					let fork_info = await this.auth_result_json(await fetch(`https://api.github.com/repos/${this.name}/forks`, {
						method: "POST",
						headers: {
							"authorization": "token " + localStorage.getItem("gh_token"),
							"accept": "application/json"
						}
					}));
					target_repo = fork_info.full_name;
					for(let i = 0; i < 20; i++) {
						let branches = await this.auth_result_json(await fetch(`https://api.github.com/repos/${target_repo}/branches?per_page=100`, {
							method: "GET",
							headers: {
								"authorization": "token " + localStorage.getItem("gh_token"),
								"accept": "application/json"
							}
						}));
						if(branches.length) break;
						await new Promise(resolve => {setTimeout(resolve, 5000)});
					}
					// In order to make sure that the branch we're basing our commit off of actually exists,
					// we must now compare the branches. This will cause github to copy commits and shizz that are relevant over.
					let base_ref = target_repo.substring(0,target_repo.indexOf("/")) + ":" + fork_info.default_branch;
					let head_ref = this.name.substring(0,this.name.indexOf("/")) + ":" + this.commit_hash;
					
					progress_bar.set_progress(0.05, "Comparing branches...");
					await fetch(`https://api.github.com/repos/${target_repo}/compare/${base_ref}...${head_ref}`, {
						method: "GET",
						headers: {
							"authorization": "token " + localStorage.getItem("gh_token"),
							"accept": "application/json"
						}
					});
				}
			}

			// now we create blobs
			let blob_map = new Map();
			for(let i = 0; i < this.editor.dmm_tabs.length; i++) {
				let dmm = this.editor.dmm_tabs[i];
				if(!dmm.filename) {
					dmm.filename = "untitled-" + Math.floor(Math.random() * 100000) + ".dmm";
				}
				progress_bar.set_progress(0.1 + (i / this.editor.dmm_tabs.length * 0.8), "Uploading " + dmm.filename + "...");
				
				let curr_tree_item = this.tree_map.get(dmm.filename.toLowerCase());
				let sha = curr_tree_item ? curr_tree_item.sha : null;
				let dmm_as_string = dmm.toString();
				let new_sha = await this.create_gh_text_blob(target_repo, dmm_as_string);
				if(sha != new_sha) {
					blob_map.set(dmm.filename, new_sha);
				}
			}
			if(!blob_map.size) {
				throw "No changes to commit";
			}
			progress_bar.set_progress(0.9, "Creating tree...");
			let new_tree = await this.create_gh_tree(target_repo, this.tree.sha, blob_map);
			progress_bar.set_progress(0.93, "Creating commit...");
			let new_commit = (await this.auth_result_json(await fetch(`https://api.github.com/repos/${target_repo}/git/commits`, {
				method: "POST",
				headers: {
					"authorization": "token " + localStorage.getItem("gh_token"),
					"content-type": "application/json",
					"accept": "application/json"
				},
				body: JSON.stringify({
					"message": result.message || "oi this fucker forgot to put a message",
					"tree": new_tree,
					"parents": [this.commit_hash]
				})
			}))).sha;
			console.log(new_commit);
			progress_bar.set_progress(0.96, "Updating branch...");
			let to_open = null;
			if(result.commit_type == "direct") {
				try {
					await this.auth_result_json(await fetch(`https://api.github.com/repos/${target_repo}/git/refs/heads/${target_branch}`, {
						method: "PATCH",
						headers: {
							"authorization": "token " + localStorage.getItem("gh_token"),
							"content-type": "application/json",
							"accept": "application/json"
						},
						body: JSON.stringify({
							"sha": new_commit
						})
					}));
				} catch(e) {
					console.warn(e);
					// try merging instead of committing
					let merge_result = await this.auth_result_json(await fetch(`https://api.github.com/repos/${target_repo}/merges`, {
						method: "POST",
						headers: {
							"authorization": "token " + localStorage.getItem("gh_token"),
							"content-type": "application/json",
							"accept": "application/json"
						},
						body: JSON.stringify({
							base: target_branch,
							head: new_commit
						})
					}));
					new_commit = merge_result.sha;
				}
				progress_bar.close();
				if(await new MessagePanel(this.editor, {title: "Commit Successful", message: "Click Open Commit to open the commit in a new tab", modal: true, options: ["Open Commit", "Close"]}).wait_until_close() == "Open Commit") {
					window.open(`https://github.com/${target_repo}/commit/${new_commit}`, '_blank');
				}
			} else {
				let head_ref = target_repo.substring(0,target_repo.indexOf("/")) + ":" + target_branch;
				await this.auth_result_json(await fetch(`https://api.github.com/repos/${target_repo}/git/refs`, {
					method: "POST",
					headers: {
						"authorization": "token " + localStorage.getItem("gh_token"),
						"content-type": "application/json",
						"accept": "application/json"
					},
					body: JSON.stringify({
						"ref": "refs/heads/" + target_branch,
						"sha": new_commit
					})
				}));
				// the only reason I have this message panel thingy is to bypass the popup blocker.
				progress_bar.close();
				await new MessagePanel(this.editor, {title: "Commit Successful", message: "Click Open to open a new tab to create a pull request.", modal: true, options: ["Create Pull Request"]}).wait_until_close();
				window.open(`https://github.com/${this.name}/compare/${this.branch_name}...${head_ref}`, '_blank');
			}
			this.editor.set_loading();
			try {
				let commit_info = await this.auth_result_json(await fetch('https://api.github.com/repos/' + target_repo + '/commits/' + target_branch,  {
				headers: {
					"authorization": "token " + localStorage.getItem("gh_token"),
					"accept": "application/json"
				}}));
				let recursive_tree = await this.auth_result_json(await fetch(commit_info.commit.tree.url + "?recursive=1",  {
				headers: {
					"authorization": "token " + localStorage.getItem("gh_token"),
					"accept": "application/json"
				}}));
				this.branch_name = target_branch;
				this.name = target_repo;
				this.commit_hash = new_commit;
				this.use_tree(recursive_tree);
			} finally {
				this.editor.clear_loading();
			}
		} catch(e) {
			try {progress_bar.close();} catch(e2) {}
			throw e;
		}
	}

	async create_gh_text_blob(repo, text) {
		if(!localStorage.getItem("gh_token")) throw new Error("No Token");
		return (await this.auth_result_json(await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
			method: "POST",
			headers: {
				"authorization": "token " + localStorage.getItem("gh_token"),
				"content-type": "application/json",
				"accept": "application/json"
			},
			body: JSON.stringify({
				"content": text,
				"encoding": "utf-8"
			})
		}))).sha;
	}

	async create_gh_tree(repo, base_tree, blob_map) {
		if(!localStorage.getItem("gh_token")) throw new Error("No Token");
		let new_tree = [];
		for(let [filename, sha] of blob_map) {
			new_tree.push({
				path: filename,
				mode: "100644",
				tyee: "blob",
				sha 
			});
		}
		return (await this.auth_result_json(await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
			method: "POST",
			headers: {
				"authorization": "token " + localStorage.getItem("gh_token"),
				"content-type": "application/json",
				"accept": "application/json"
			},
			body: JSON.stringify({
				"base_tree": base_tree,
				"tree": new_tree
			})
		}))).sha;
	}

	async auth_result_json(result) {
		let json = await result.json();
		if(json.message == "Bad credentials") {
			localStorage.removeItem("gh_token");
			throw new Error("Bad credentials");
		} else if(result.status >= 400) {
			throw new Error(json.message);
		}
		return json;
	}

	static async make_from_repo_name(editor, repo_name, branch_name) {
		try {
			editor.set_loading();
			if(!(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}\/[a-z\d](?:[a-z\d-\.]){0,100}$/i.test(repo_name))) {
				throw "Bad repository name";
			}
			let repo_info_res = await fetch('https://api.github.com/repos/' + repo_name);
			let repo_info = await repo_info_res.json();
			if(repo_info_res.status != 200) throw "Repository: " + repo_info.message;
			repo_name = repo_info.full_name;
			if(!branch_name) {
				let branch_list_res = await fetch("https://api.github.com/repos/" + repo_name + "/branches?per_page=100");
				let branch_list = await branch_list_res.json();
				if(branch_list_res.status != 200) throw branch_list.message;
				while(get_next_page_url(branch_list_res)) {
					branch_list_res = await fetch(get_next_page_url(branch_list_res));
					let branch_list_addon = await branch_list_res.json();
					if(branch_list_res.status != 200) throw branch_list_addon.message;
					branch_list.push(...branch_list_addon);
				}
				editor.clear_loading();
				try {
					branch_name = await new GithubChooseBranchPanel(editor, branch_list, repo_info.default_branch).wait_until_close();
				} finally {
					editor.set_loading();
				}
				if(!branch_name) throw null;
			}
			let commit_info_res = await fetch('https://api.github.com/repos/' + repo_name + '/commits/' + branch_name);
			let commit_info = await commit_info_res.json();
			if(commit_info_res.status != 200) throw "Branch: " + commit_info.message;
			let recursive_tree_res = await fetch(commit_info.commit.tree.url + "?recursive=1");
			let recursive_tree = await recursive_tree_res.json();
			if(commit_info_res.status != 200) throw "Tree: " + recursive_tree.message;
			return new GithubFileContext(editor, repo_name, branch_name, commit_info.sha, recursive_tree);
		} finally {
			editor.clear_loading();
		}
	}
};

function get_next_page_url(response) {
	if(!response) return;
	let text = response.headers.get("link");
	if(!text) return;
	let result = /<([^>]+)>; rel="next"/.exec(text);
	if(!result) return;
	return result[1];
}