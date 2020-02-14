'use strict';
const read_icon = require('./rendering/icon_reader.js');
const Matrix = require('./rendering/matrix.js');
const renderer = require('./rendering/renderer.js');
const Appearance = require('./rendering/appearance.js');
const RenderInstance = require('./render_instance.js');
const MapContextMenu = require('./menu/map_context_menu.js');
const dropdown = require('./dropdown.js');

class MapWindow {
	/**
	 * 
	 * @param {import("./editor")} editor 
	 */
	constructor(editor) {
		this.editor = editor;
		this.canvas = document.getElementById("mapwindow");
		this.timestamp = performance.now();

		/** @type {WebGL2RenderingContext} */
		this.gl = null;

		this.canvas.addEventListener("mousedown", this.canvas_mousedown.bind(this));
		this.canvas.addEventListener("mouseout", this.canvas_mouseout.bind(this));
		this.canvas.addEventListener("mousemove", this.canvas_mousemove.bind(this));
		document.addEventListener("mouseup", this.document_mouseup.bind(this));
		this.canvas.addEventListener("wheel", this.canvas_wheel.bind(this));
		this.canvas.addEventListener("contextmenu", this.canvas_contextmenu.bind(this));

		this.mouse_x = null;
		this.mouse_y = null;
		this.mouse_x_float = null;
		this.mouse_y_float = null;
		this.mouse_last_event = null;

		/** @type {import('./parser/dmm").Tile */
		this.mouse_pixel_tile = null;
		/** @type {import('./parser/dmm").Instance */
		this.mouse_pixel_instance = null;

		/** @type {import("./placement/_handler")} */
		this.active_placement_handler = null;

		this.draw_dirty = true;
		this.last_draw_hash = null;

		this.icons = new Map();
		this.icon_promises = new Map();
		this.icon_preview_cache = new Map();
		this.icon_clear_cycle = 0;

		this.context_menu = new MapContextMenu(editor);

		this.init_rendering();

		window.requestAnimationFrame(this.animation_frame_callback.bind(this));
	}

	clear_all() {
		this.clear_gl();
		this.icons.clear();
		this.icon_promises.clear();
		this.icon_clear_cycle++;
		this.enqueue_icon_load("_fastdmm_interface.dmi");
	}

	clear_gl() {
		const gl = this.gl;
		for(let [key, val] of this.gl_texture_cache) {
			gl.deleteTexture(val);
		}
		this.gl_texture_cache.clear();
	}

	animation_frame_callback(timestamp) {
		try {
			this.frame(timestamp);
		} catch(e) {
			console.error(e);
		}
		window.requestAnimationFrame(this.animation_frame_callback.bind(this));
	}

	frame(timestamp) {
		this.timestamp = timestamp;

		if(this.gl_context_lost) return;

		let rect = this.canvas.getBoundingClientRect();
		let target_width = rect.width * window.devicePixelRatio;
		let target_height = rect.height * window.devicePixelRatio;

		let draw_hash = [
			this.mapwindow_x,
			this.mapwindow_y,
			this.mapwindow_z,
			this.mapwindow_zoom,
			this.mapwindow_log_zoom,
			this.mouse_x,
			this.mouse_y,
			this.mouse_pixel_tile ? this.mouse_pixel_tile.id : "",
			this.mouse_pixel_instance ? this.mouse_pixel_instance.id : "",
			this.editor.dmm ? this.editor.dmm.last_change_index : "",
			this.editor.objtree_window.hidden_set_change_index,
			this.editor.placement_mode ? (this.editor.placement_mode.is_pixel + "," + this.editor.placement_mode.last_change_index) : "",
			this.active_placement_handler ? this.active_placement_handler.last_change_index : "",
			target_width,
			target_height
		].join("/");
		if(!this.draw_dirty && draw_hash == this.last_draw_hash) return;
		this.draw_dirty = false;
		this.last_draw_hash = draw_hash;

		if(this.canvas.width != target_width) this.canvas.width = target_width;
		if(this.canvas.height != target_height) this.canvas.height = target_height;

		let ctx = this.canvas.getContext('2d');
		let render_instances = [];

		let cancel_mouse_overlay = false;
		if(this.editor.dmm) {
			let dmm = this.editor.dmm;
			let draw_minx = Math.floor(Math.max((this.mapwindow_x - (this.canvas.width / 32 / 2 / this.mapwindow_zoom)) - 2, 1));
			let draw_miny = Math.floor(Math.max((this.mapwindow_y - (this.canvas.height / 32 / 2 / this.mapwindow_zoom)) - 2, 1));
			let draw_maxx = Math.ceil(Math.min((this.mapwindow_x + (this.canvas.width / 32 / 2 / this.mapwindow_zoom)) + 2, dmm.maxx));
			let draw_maxy = Math.ceil(Math.min((this.mapwindow_y + (this.canvas.height / 32 / 2 / this.mapwindow_zoom)) + 2, dmm.maxy));

			for(let z = this.mapwindow_z; z >= 1; z--) {
				for(let x = draw_minx; x <= draw_maxx; x++) {
					for(let y = draw_miny; y <= draw_maxy; y++) {
						let tile = dmm.get_tile(x, y, z);
						for(let i = 0; i < tile.contents.length; i++) {
							let inst = tile.contents[i];
							if(inst == null) {
								tile.splice(tile.contents, 1);
								console.warn(`Removing null object at ${x},${y},${this.mapwindow_z}`);
								i--;
								continue;
							}
							if(inst.cached_hidden_cache_index != this.editor.objtree_window.hidden_set_change_index) {
								inst.cached_hidden_cache_index = this.editor.objtree_window.hidden_set_change_index
								inst.cached_hidden = this.editor.objtree_window.hidden_set.has(inst.type);
							}
							if(!inst.cached_hidden) {
								let appearance = inst.get_appearance();
								if(this.editor.placement_mode && this.editor.placement_mode.is_pixel && this.mouse_pixel_instance == inst && this.mouse_pixel_tile == tile) {
									let oc = appearance.color;
									appearance = new Appearance(appearance);
									appearance.color = [oc[0]-0.5,oc[1]+0.5,oc[2]-0.5];
									cancel_mouse_overlay = true;
								}
								render_instances.push(new RenderInstance(appearance, x, y, z, tile, inst, true));
							}
						}
					}
				}
			}
		}

		if(this.active_placement_handler) {
			this.active_placement_handler.visualize(render_instances);
		}
		this.editor.placement_mode.visualize(render_instances);

		if(this.mouse_x != null && !cancel_mouse_overlay) {
			render_instances.push(new RenderInstance(new Appearance({
				icon: "white",
				alpha: 0.5,
				layer: 1000,
				plane: 100000 // not a valid plane in BYOND so no chance of BYOND shizz displaying on top.
			}), this.mouse_x, this.mouse_y, this.mapwindow_z));
		}

		render_instances = render_instances.filter((instance) => {
			if(!instance || !instance.appearance) {
				return false;
			}
			return true;
		});
		render_instances.sort((a,b) => {
			if(a.z != b.z) {
				return a.z - b.z;
			}
			if(a.appearance.plane != b.appearance.plane) {
				return a.appearance.plane - b.appearance.plane;
			}
			if(a.appearance.layer != b.appearance.layer) {
				return a.appearance.layer - b.appearance.layer;
			}
			if(a.y != b.y) {
				return a.y - b.y;
			}
			return 0;
		});

		const gl = this.gl;
		let max_width = Math.max(gl.canvas.width, this.canvas.width);
		let max_height = Math.max(gl.canvas.height, this.canvas.height);
		if(max_width != gl.canvas.width || max_height != gl.canvas.height) {
			gl.canvas.width = max_width;
			gl.canvas.height = max_height;
			if(this.gl_click_framebuffer) {
				gl.deleteTexture(this.gl_click_texture);
				gl.deleteFramebuffer(this.gl_click_framebuffer);
			}
			this.gl_click_texture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.gl_click_texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.gl_click_framebuffer = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.gl_click_framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gl_click_texture, 0);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}
		
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.gl_click_framebuffer);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(255, 255, 255, 255);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(0,0,0,0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		this.gl_enable_framebuffer = true;
		this.gl_viewport = [this.canvas.width,this.canvas.height];
		// the +0.5 is to prevent aliasing issues.
		let transform = new Matrix(this.mapwindow_zoom, 0, 0, this.mapwindow_zoom, -Math.round(this.mapwindow_x * this.mapwindow_zoom * 32) + ((this.canvas.width % 2 == 1) ? 0.5 : 0), -Math.round(this.mapwindow_y * this.mapwindow_zoom * 32) + ((this.canvas.height % 2 == 1) ? 0.5 : 0));

		for(let i = 0; i < render_instances.length; i++) {
			let instance = render_instances[i];
			this.draw_appearance(transform.translate(instance.x * 32, instance.y * 32), instance.z - this.mapwindow_z, instance.appearance, undefined, instance.detect_clicks ? i : -1);
		}
		this.last_render_instances = render_instances;

		if(this.gl_current_batch)
			this.gl_current_batch.draw();

		this.update_pixel_from_mouse(this.mouse_last_event);

		ctx.globalCompositeOperation = "copy";
		ctx.drawImage(gl.canvas, 0, this.canvas.height - gl.canvas.height);
	}
	enqueue_icon_load(key) {
		if(typeof key != "string") return;
		if(!this.editor.file_context && key != "_fastdmm_interface.dmi") return;
		let keylow = key.toLowerCase();
		if(this.icons.has(keylow)) {
			return this.icons.get(keylow) || this.icon_promises.get(keylow);
		}
		this.icons.set(keylow, null);
		let blob_promise;
		if(key == "_fastdmm_interface.dmi") {
			blob_promise = fetch('interface.dmi').then((res) => {
				return res.blob();
			});
		} else {
			blob_promise = this.editor.file_context.read_file(key);
		}
		let icon_promise = blob_promise.then((blob) => {
			return read_icon(blob);
		}).then(icon => {
			this.icons.set(keylow, icon);
			this.draw_dirty = true;
			//icon.image.addEventListener("load", ()=>{this.draw_dirty = true;});
			return icon;
		}, (e) => {
			console.warn(e);
		});
		this.icon_promises.set(key, icon_promise);
		return icon_promise;
	}

	update_from_mouse(e) {
		this.mouse_x = Math.floor((e.offsetX*devicePixelRatio - (this.canvas.width/2)) / this.mapwindow_zoom/32 + this.mapwindow_x);
		this.mouse_y = Math.floor(-(e.offsetY*devicePixelRatio - (this.canvas.height/2)) / this.mapwindow_zoom/32 + this.mapwindow_y);
		let dmm = this.editor.dmm;
		this.mouse_last_event = e;
		if(!dmm || this.mouse_x < 1 || this.mouse_y < 1 || this.mouse_x > dmm.maxx || this.mouse_y > dmm.maxy) {
			this.mouse_x = null;
			this.mouse_y = null;
		}
		this.update_pixel_from_mouse(e);
	}

	update_pixel_from_mouse(e) {
		const gl = this.gl;
		if(this.gl_enable_framebuffer && e && this.last_render_instances) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.gl_click_framebuffer);
			let mouse_id_array = new Uint8Array(4);
			let read_x = this.mouse_last_event.offsetX|0;
			let read_y = gl.canvas.height - this.mouse_last_event.offsetY|0;
			gl.readPixels(read_x, read_y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, mouse_id_array);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			let mouse_id = (mouse_id_array[0] << 24) + (mouse_id_array[1] << 16) + (mouse_id_array[2] << 8) + (mouse_id_array[3]);
			//console.log(""+mouse_id_array)
			//mouse_id = (mouse_id + 0x100000000) % 0x100000000;
			if(mouse_id >= 0 && mouse_id < this.last_render_instances.length) {
				let render_inst = this.last_render_instances[mouse_id];
				let instance = render_inst.instance;
				let tile = render_inst.tile;
				this.mouse_pixel_tile = tile;
				this.mouse_pixel_instance = instance;
			} else {
				this.mouse_pixel_tile = null;
				this.mouse_pixel_instance = null;
			}
		} else {
			this.mouse_pixel_tile = null;
			this.mouse_pixel_instance = null;
		}
	}

	canvas_mousemove(e) {
		e = {offsetX: e.offsetX, offsetY: e.offsetY}; // god damn it firefox stop eating my coordinates.
		setTimeout(() => {
			let last_mousex = this.mouse_x;
			let last_mousey = this.mouse_y;
			this.update_from_mouse(e);
			if(this.mouse_x && this.mouse_y && this.active_placement_handler) {
				let tile = this.editor.dmm.get_tile(this.mouse_x, this.mouse_y, this.mapwindow_z);
				if(tile) {
					this.active_placement_handler.mousemove(tile, this.mouse_x != last_mousex || this.mouse_y != last_mousey);
				}
			}
		}, 1); // doing timeout so that this happens after doing mouse drag so that the cursor doesnt move around weirdly.
	}

	document_mouseup() {
		if(this.active_placement_handler) {
			this.active_placement_handler.mouseup();
			this.active_placement_handler = null;
			this.draw_dirty = true;
		}
	}

	canvas_mouseout() {
		this.mouse_x = null; this.mouse_y = null;
		this.mouse_last_event = null;
	}

	canvas_mousedown(e) {
		if((!e.ctrlKey && !e.shiftKey && e.button == 1) || (e.button == 0 && e.altKey)) {
			let lastE = e;
			let mouseup = () => {
				document.removeEventListener("mouseup", mouseup);
				document.removeEventListener("mousemove", mousemove);
			}
			let mousemove = (e) => {
				this.mapwindow_x -= (e.screenX - lastE.screenX) / 32 / this.mapwindow_zoom;
				this.mapwindow_y += (e.screenY - lastE.screenY) / 32 / this.mapwindow_zoom;
				let maxx = this.editor.dmm ? this.editor.dmm.maxx : 1;
				let maxy = this.editor.dmm ? this.editor.dmm.maxy : 1;
				if(this.mapwindow_x < 1) this.mapwindow_x = 1;
				if(this.mapwindow_y < 1) this.mapwindow_y = 1;
				if(this.mapwindow_x > maxx) this.mapwindow_x = maxx;
				if(this.mapwindow_y > maxy) this.mapwindow_y = maxy;
				lastE = e;
			}
			document.addEventListener("mouseup", mouseup);
			document.addEventListener("mousemove", mousemove);
			e.preventDefault();
			this.canvas.focus();
			return;
		}
		
		if(document.activeElement && document.activeElement.closest(".dropdown-content")) return; // you don't want to accidentally place a thing when clicking off of a dropdown.

		if(this.editor.dmm && e.button != 2 && !this.active_placement_handler) {
			this.draw_dirty = true;
			let type = this.editor.instance_window.selected;
			
			this.editor.placement_mode.handle_pixel_mousedown(e, this.mouse_pixel_tile, this.mouse_pixel_instance, type);
			
			let tile = this.editor.dmm.get_tile(this.mouse_x, this.mouse_y, this.mapwindow_z);
			if(tile)
				this.active_placement_handler = this.editor.placement_mode.get_handler(e, tile, type);
		}
	}

	canvas_contextmenu(e) {
		if(!e.shiftKey) {
			let tile = this.editor.dmm.get_tile(this.mouse_x, this.mouse_y, this.mapwindow_z);
			let menu_elem = this.context_menu.build_menu(tile);
			dropdown(document.body, menu_elem, {point: [e.clientX, e.clientY]});
			e.preventDefault();
		}
	}

	canvas_wheel(e) {
		let delta_y = e.deltaY;
		if(e.deltaMode == WheelEvent.DOM_DELTA_PIXEL) delta_y /= 100;
		else if(e.deltaMode == WheelEvent.DOM_DELTA_LINE) delta_y /= 3;
		this.mapwindow_log_zoom -= Math.max(-1, Math.min(1, delta_y));
		this.mapwindow_log_zoom = Math.max(-5, Math.min(5, this.mapwindow_log_zoom));
		this.mapwindow_zoom = 2 ** Math.round(this.mapwindow_log_zoom);
		e.preventDefault();
		this.update_from_mouse(e);
	}
	
	/*this.mapwindow_x = 1;
	this.mapwindow_y = 1;
	this.mapwindow_z = 1;
	this.mapwindow_zoom = 1;
	this.mapwindow_log_zoom = 0;*/
	get mapwindow_x() {
		return this.editor.dmm ? this.editor.dmm.mapwindow_x : 1;
	}
	get mapwindow_y() {
		return this.editor.dmm ? this.editor.dmm.mapwindow_y : 1;
	}
	get mapwindow_z() {
		return this.editor.dmm ? this.editor.dmm.mapwindow_z : 1;
	}
	get mapwindow_zoom() {
		return this.editor.dmm ? this.editor.dmm.mapwindow_zoom : 1;
	}
	get mapwindow_log_zoom() {
		return this.editor.dmm ? this.editor.dmm.mapwindow_log_zoom : 0;
	}
	set mapwindow_x(val) {
		if(this.editor.dmm) this.editor.dmm.mapwindow_x = val;
	}
	set mapwindow_y(val) {
		if(this.editor.dmm) this.editor.dmm.mapwindow_y = val;
	}
	set mapwindow_z(val) {
		if(this.editor.dmm) this.editor.dmm.mapwindow_z = val;
	}
	set mapwindow_zoom(val) {
		if(this.editor.dmm) this.editor.dmm.mapwindow_zoom = val;
	}
	set mapwindow_log_zoom(val) {
		if(this.editor.dmm) this.editor.dmm.mapwindow_log_zoom = val;
	}
}
MapWindow.prototype.init_rendering = renderer.init_rendering;
MapWindow.prototype.compile_shader = renderer.compile_shader;
MapWindow.prototype.compile_shader_program = renderer.compile_shader_program;
MapWindow.prototype.get_texture = renderer.get_texture;
MapWindow.prototype.draw_appearance = renderer.draw_appearance;
MapWindow.prototype.build_preview_icon = renderer.build_preview_icon;
Object.assign(MapWindow.prototype, renderer);
module.exports = MapWindow;
