'use strict';
const DrawBatch = require('./draw_batch.js');
const Matrix = require('./matrix.js');
const dir_progressions = require('./dir_progressions.js');
const Instance = require('../parser/dmm.js').Instance;

let mipmapping_canvas = document.createElement("canvas");

/** @typedef {import("../mapwindow") MapWindow} */

// stolen straight from the unfinished webgl branch of Bluespess
/** @this {MapWindow} */
function init_rendering() {
	this.is_webgl2 = ('WebGL2RenderingContext' in window);
	this.gl = document.createElement("canvas").getContext(this.is_webgl2 ? "webgl2" : "webgl");
	const gl = this.gl;
	this.gl_canvas = gl.canvas;
	this.gl_enable_framebuffer = true;

	if(this.is_webgl2) {
		this.mipmap_generator = new Worker('mipmap_generator.js');
		this.mipmap_generator.onmessage = (e) => {
			let d = e.data;
			let texture = this.gl_texture_cache.get(d.key);
			if(!texture) return;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, d.out_bufs.length);
			for(let level = 1; level <= d.out_bufs.length; level++) {
				gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, d.width >> level, d.height >> level, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(d.out_bufs[level-1]));
			}
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		}
	}
	
	let initializer = () => {
		// build the default shader
		this.max_icons_per_batch = Math.min(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),256);
		let texture_switch = (function build_texture_switch(s, l) { // fancy ass recursive binary tree thingy for SANIC SPEED... I hope
			if(l == 0)
				return "";
			else if(l == 1)
				return `color *= texture2D(u_texture[${s}], v_uv);`;
			else {
				let split_point = Math.ceil(l/2);
				return `if(v_tex_index < ${split_point+s}.0){${build_texture_switch(s, split_point)}}else{${build_texture_switch(s+split_point, l-split_point)}}`;
			}
		}(0, this.max_icons_per_batch)); // it would be so much easier if I could just index the goddamn array normally but no they had to be fuckers and now I have this super convoluted if/else tree god damn it glsl why you do this to me
		this.shader_default = this.compile_shader_program(`
precision mediump float;
attribute vec3 a_position;
attribute vec4 a_color;
varying vec4 v_color;
attribute vec4 a_pointerid;
varying vec4 v_pointerid;
attribute vec2 a_uv;
varying vec2 v_uv;
attribute float a_tex_index;
varying float v_tex_index;
uniform vec2 u_viewport_size;
void main() {
	v_color = vec4(a_color.xyz * pow(0.5, -a_position.z), a_color.w);
	v_pointerid = a_pointerid;
	v_uv = a_uv;
	v_tex_index = a_tex_index;
	gl_Position = vec4(a_position.xy / u_viewport_size * 2.0 * pow(15.0/16.0, -a_position.z), 0.0, 1.0);
}
`,`
precision mediump float;
uniform sampler2D u_texture[${this.max_icons_per_batch}];
varying vec4 v_color;
varying vec2 v_uv;
varying float v_tex_index;
varying vec4 v_pointerid;
uniform vec2 u_viewport_size;
uniform bool u_is_pointer_pass;
void main() {     // fucking shit why is there no bitwise and
	vec4 color = v_color;
	${texture_switch}
	if(u_is_pointer_pass) {
		if(color.a > 0.0001 && v_pointerid.r < 0.9999) {
			gl_FragColor = v_pointerid;
		} else {
			discard;
		}
	} else {
		gl_FragColor = color;
	}
}
`);

		this.gl_viewport = [32, 32];
		this.gl_current_batch = null;

		this.gl_texture_cache = new Map();
		this.gl_uniform_cache = new Map();

		this.gl_uniform_cache.set(this.shader_default, {
			u_viewport_size: gl.getUniformLocation(this.shader_default, "u_viewport_size"),
			u_is_pointer_pass: gl.getUniformLocation(this.shader_default, "u_is_pointer_pass"),
		});

		this.gl_white_texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.gl_white_texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	};
	initializer();

	this.gl_context_lost = false;

	/*this.gl_canvas.addEventListener("webglcontextlost", () => {
		console.warn("WebGL context lost!");
		this.gl_context_lost = true;
	});
	this.gl_canvas.addEventListener("webglcontextrestored", () => {
		console.warn("WebGL context restored!");
		this.gl_context_lost = false;
		initializer();
	});*/
}

/**
 * 
 * @param {string} key 
 * @this {MapWindow}
 * @returns {WebGLTexture}
 */
function get_texture(key) {
	if(key == "white") return this.gl_white_texture;
	if(typeof key != "string") return;
	let keylow = key.toLowerCase();
	const gl = this.gl;
	if(this.gl_texture_cache.has(keylow)) {
		return this.gl_texture_cache.get(keylow);
	}
	if(this.icons.has(keylow)) {
		let icon = this.icons.get(keylow);
		if(!icon)
			return this.gl_white_texture;
		let img = icon.image;
		if(!img || !img.complete)
			return this.gl_white_texture;
		let texture = gl.createTexture();
		try {
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			// Today I will be generating my own mipmaps
			// with blackjack and hookers (a fancy expanding algorithm thingy)
			let width = icon.width;
			let height = icon.height;
			if(this.is_webgl2 && (width & 1) == 0 && (height & 1) == 0 && width && height) {
				// basically only generate mipmaps as far as can be done without adjacent icons interfering and causing weird artifacts.
				if(mipmapping_canvas.width < img.width)
					mipmapping_canvas.width = img.width;
				if(mipmapping_canvas.height < img.height)
					mipmapping_canvas.height = img.height;
				let mipmapping_ctx = mipmapping_canvas.getContext('2d');
				mipmapping_ctx.globalCompositeOperation = "copy";
				mipmapping_ctx.drawImage(img, 0, 0);
				let data = mipmapping_ctx.getImageData(0, 0, img.width, img.height);
				this.mipmap_generator.postMessage({ // send it to a web worker
					width: img.width,
					height: img.height,
					icon_width: icon.width,
					icon_height: icon.height,
					key: keylow,
					in_buf: data.data.buffer,

				}, [data.data.buffer]);
			}

			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		} finally {
			this.gl_texture_cache.set(keylow, texture); // if I have an error in here I don't want to spam webgl textures.
		}
		return texture;
	} else {
		this.enqueue_icon_load(key);
	}
	return this.gl_white_texture;
}

/**
 * 
 * @param {string} code 
 * @param {number} type 
 * @this {MapWindow}
 */
function compile_shader(code, type) {
	const gl = this.gl;
	let shader = gl.createShader(type);
	gl.shaderSource(shader, code);
	gl.compileShader(shader);
	if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error((type == gl.VERTEX_SHADER ? "VERTEX SHADER " : "FRAGMENT SHADER ") + gl.getShaderInfoLog(shader));
	}
	return shader;
}

/**
 * 
 * @param {string} vertex_code 
 * @param {string} fragment_code 
 * @this {MapWindow}
 */
function compile_shader_program(vertex_code, fragment_code) {
	const gl = this.gl;
	let program = gl.createProgram();
	gl.attachShader(program, this.compile_shader(vertex_code, gl.VERTEX_SHADER));
	gl.attachShader(program, this.compile_shader(fragment_code, gl.FRAGMENT_SHADER));
	gl.linkProgram(program);
	if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog (program));
	}
	return program;
}

/**
 * 
 * @param {Matrix} transform 
 * @param {number} z 
 * @param {import("./appearance")} obj 
 * @param {Array<number>} bounds_info 
 * @param {number} pointerid 
 */
function draw_appearance(transform, z, obj, bounds_info = undefined, pointerid = -1) {
	//let effective_dir = ((obj.dir == 0) && parent_dir != null) ? parent_dir : obj.dir;
	let effective_dir = obj.dir;

	transform = transform.translate(obj.pixel_x, obj.pixel_y);
	if(obj.transform != Matrix.identity) {
		transform = transform.multiply(obj.transform);
	}

	let icon = obj.icon;
	if(!icon) return;
	let icon_meta;
	let icon_state = obj.icon_state;
	if(icon == "white") {
		icon_meta = white_meta;
	} else {
		if(!this.icons.has(icon && icon.toLowerCase())) this.enqueue_icon_load(icon);
		icon_meta = this.icons.get(icon && icon.toLowerCase());
		if(!icon_meta) {
			icon_meta = this.icons.get("_fastdmm_interface.dmi");
			icon ='_fastdmm_interface.dmi';
			icon_state = "";
		}
	}
	if(icon_meta) {
		let icon_state_meta = icon_meta.icon_states.get(icon_state) || icon_meta.icon_states.get(" ") || icon_meta.icon_states.get("");
		if(!icon_state_meta) {
			icon_meta = this.icons.get("_fastdmm_interface.dmi");
			if(icon_meta) {
				icon = '_fastdmm_interface.dmi';
				icon_state = "";
				icon_state_meta = icon_meta.icon_states.get("") || icon_meta.icon_states.get(" ");
			}
		}
		if(icon_state_meta) {
			let dir_meta = null;
			let progression = dir_progressions[icon_state_meta.dir_count] || dir_progressions[1];
			dir_meta = icon_state_meta.dirs.get(progression[effective_dir]) || icon_state_meta.dirs.get(2);
			if(dir_meta) {
				let frame_meta = dir_meta.frames[0];

				if(!this.gl_current_batch || this.gl_current_batch.constructor != DrawBatch || !this.gl_current_batch.can_fit(6, icon)) {
					if(this.gl_current_batch)
						this.gl_current_batch.draw();
					if(!this.gl_current_batch || this.gl_current_batch.constructor != DrawBatch)
						this.gl_current_batch = new DrawBatch(this);
				}


				let batch = this.gl_current_batch;
				let image = icon_meta.image;
				let inv_img_width = 1/image.width;
				let inv_img_height = 1/image.height;
				let texture_index = batch.icon_list.indexOf(icon);
				if(texture_index == -1) {
					texture_index = batch.icon_list.length;
					batch.icon_list.push(icon);
				}
				let icon_state_width = icon_state_meta.width;
				let icon_state_height = icon_state_meta.height;
				let color = obj.color;
				let alpha = obj.alpha;
				let vertices_buf = batch.buffers.vertices.buf;
				let uv_buf = batch.buffers.uv.buf;
				let colors_buf = batch.buffers.colors.buf;
				let pointer_ids_buf = batch.buffers.pointer_ids.buf;
				let texture_indices_buf = batch.buffers.texture_indices.buf;
				for(let ia = 0; ia < 2; ia++) for(let ib = 0; ib < 3; ib++) { // iterates in ther order 0,1,2,1,2,3
					let i = ia + ib;
					let sx = (i & 1);
					let sy = (i & 2) >> 1;
					let vertex_num = batch.num_vertices;
					let vertex_num_2 = vertex_num << 1;
					let vertex_num_3 = vertex_num_2 + vertex_num;
					let vertex_num_4 = vertex_num << 2;
					texture_indices_buf[vertex_num] = texture_index;
					//let transformed_coords = transform.multiply([sx*icon_state_width,sy*icon_state_height]);
					let in_x = sx*icon_state_width;
					let in_y = sy*icon_state_height;
					let transformed_x = transform.multiply_x(in_x, in_y);
					let transformed_y = transform.multiply_y(in_x, in_y);
					vertices_buf[vertex_num_3] = transformed_x;
					vertices_buf[vertex_num_3+1] = transformed_y;
					vertices_buf[vertex_num_3+2] = z;
					if(bounds_info) {
						bounds_info[0] = Math.min(bounds_info[0], transformed_x);
						bounds_info[1] = Math.min(bounds_info[1], transformed_y);
						bounds_info[2] = Math.max(bounds_info[2], transformed_x);
						bounds_info[3] = Math.max(bounds_info[3], transformed_y);
					}
					uv_buf[vertex_num_2] = (frame_meta.x + (sx*icon_state_width)) * inv_img_width;
					uv_buf[vertex_num_2 + 1] = (frame_meta.y + ((1-sy)*icon_state_height)) * inv_img_height;
					
					colors_buf[vertex_num_4] = color[0];
					colors_buf[vertex_num_4+1] = color[1];
					colors_buf[vertex_num_4+2] = color[2];
					colors_buf[vertex_num_4+3] = alpha;
					
					pointer_ids_buf[vertex_num_4] = (pointerid >>> 24) & 0xFF;
					pointer_ids_buf[vertex_num_4+1] = (pointerid >>> 16) & 0xFF;
					pointer_ids_buf[vertex_num_4+2] = (pointerid >>> 8) & 0xFF;
					pointer_ids_buf[vertex_num_4+3] = (pointerid) & 0xFF;
					batch.num_vertices++;
				}
			}
		}
	}
}

/**
 * 
 * @typedef {Object} PreviewIcon
 * @property {string} url
 * @property {number} width
 * @property {number} height
 */
/**
 * 
 * @param {Instance} instance 
 * @returns {Promise<PreviewIcon>}
 * @this {MapWindow}
 */
async function build_preview_icon(instance) {
	let icon_cycle = this.icon_clear_cycle;
	if(!instance instanceof Instance) {
		if(typeof instance == "text") {
			instance = new Instance(this.editor.parser, instance);
		}
	}
	let icon = instance.get_var("icon");
	let icon_state = instance.get_var("icon_state");
	let dir = instance.get_var("dir");
	if(icon) {
		icon = icon.file;
	} else {
		icon = '_fastdmm_interface.dmi';
		icon_state = '';
	}
	let icon_meta = await this.enqueue_icon_load(icon.toLowerCase());
	if(!icon_meta) {
		icon_meta = await this.enqueue_icon_load('_fastdmm_interface.dmi');
		icon_state = '';
	}
	if(!icon_meta) return;
	let icon_state_meta = icon_meta.icon_states.get(icon_state) || icon_meta.icon_states.get(" ") || icon_meta.icon_states.get("");
	if(!icon_state_meta) {
		icon_meta = await this.enqueue_icon_load("_fastdmm_interface.dmi");
		if(icon_meta) {
			icon = '_fastdmm_interface.dmi';
			icon_state = "";
			icon_state_meta = icon_meta.icon_states.get("") || icon_meta.icon_states.get(" ");
		}
	}
	if(!icon_state_meta) return;

	if(icon_cycle != this.icon_clear_cycle) return;

	let dir_meta = null;
	let progression = dir_progressions[icon_state_meta.dir_count] || dir_progressions[1];
	dir_meta = icon_state_meta.dirs.get(progression[dir]) || icon_state_meta.dirs.get(2);
	if(!dir_meta) return;

	await new Promise(resolve => {setTimeout(resolve, 10);})
	
	let frame_meta = dir_meta.frames[0];

	let color = instance.get_var("color");

	let hash = `${icon}:${icon_state}:${color}:${dir}`;
	if(this.icon_preview_cache.has(hash)) return this.icon_preview_cache.get(hash);

	let canvas = document.createElement("canvas");
	canvas.width = icon_state_meta.width;
	canvas.height = icon_state_meta.height;
	let ctx = canvas.getContext('2d');
	ctx.drawImage(icon_meta.image, frame_meta.x, frame_meta.y, icon_state_meta.width, icon_state_meta.height, 0, 0, icon_state_meta.width, icon_state_meta.height);

	if(color) {
		ctx.globalCompositeOperation = 'multiply';
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, icon_state_meta.width, icon_state_meta.height);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(icon_meta.image, frame_meta.x, frame_meta.y, icon_state_meta.width, icon_state_meta.height, 0, 0, icon_state_meta.width, icon_state_meta.height);
	}
	let out = {
		width: canvas.width,
		height: canvas.height,
		url: canvas.toDataURL()
	};
	this.icon_preview_cache.set(hash, out);
	return out;
}

const white_meta = {
	icon_states: new Map([["", {
		width: 32,
		height: 32,
		dirs: new Map([[2, 
		{
			total_delay: 100,
			frames: [{
				x: 0,
				y: 0,
				delay: 100
			}]
		}]])
	}]]),
	image: {
		width: 32,
		height: 32
	}
};

module.exports = {init_rendering, compile_shader, compile_shader_program, get_texture, draw_appearance, build_preview_icon};