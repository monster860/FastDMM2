'use strict';
const RenderInstance = require('./render_instance.js');
module.exports = {
	/**
	 * 
	 * @param {number} dir 
	 * @param {number} angle 
	 */
	turn_dir(dir, angle) {
		dir = dir & 15;
		angle = ((angle % 360 + 360) % 360);
		return [ // woo lookup table time
			[0, 1, 2 ,3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15],
			[0, 5,10,15, 6, 4, 2,15, 9, 1, 8,15,15,15,15,15],
			[0, 4, 8,12, 2, 6,10,14, 1, 5, 9,13, 3, 7,11,15],
			[0, 6, 9,15,10, 2, 8,15, 5, 4, 1,15,15,15,15,15],
			[0, 2, 1, 3, 8,10, 9,11, 4, 6, 5, 7,12,14,13,15],
			[0,10, 5,15, 9, 8, 1,15, 6, 2, 4,15,15,15,15,15],
			[0, 8, 4,12, 1, 9, 5,13, 2,10, 6,14, 3,11, 7,15],
			[0, 9, 6,15, 5, 1, 4,15,10, 8, 2,15,15,15,15,15]
		][Math.floor(angle / 90) * 2 + ((angle % 90) == 0 ? 0 : 1)][dir];
	},

	/**
	 * 
	 * @param {number} dir 
	 */
	dir_dx(dir) {
		var dx = 0;
		if(dir & 4)
			dx++;
		if(dir & 8)
			dx--;
		return dx;
	},

	/**
	 * 
	 * @param {number} dir 
	 */
	dir_dy(dir) {
		var dy = 0;
		if(dir & 1)
			dy++;
		if(dir & 2)
			dy--;
		return dy;
	},

	/**
	 * 
	 * @param {number} dx 
	 * @param {number} dy 
	 */
	dir_to(dx, dy) {
		let dir = 0;
		if(dy > 0) dir |= 1;
		if(dy < 0) dir |= 2;
		if(dx > 0) dir |= 4;
		if(dx < 0) dir |= 8;
		return dir;
	},
	
	/**
	 * 
	 * @param {number} dir 
	 */
	is_dir_cardinal(dir) {
		return dir == 1 || dir == 2 || dir == 4 || dir == 8;
	},

	/**
	 * 
	 * @param {Array<RenderInstance>} render_instances 
	 * @param {Array<import("./rendering/appearance")>} appearances 
	 * @param {import("./parser/dmm").Tile} a 
	 * @param {import("./parser/dmm").Tile} b 
	 */
	draw_box(render_instances, appearances, a, b) {
		if(a.dmm != b.dmm) throw new Error("DMMs dont match");
		let dmm = a.dmm;
		let l1 = dmm.get_tile(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.z,b.z));
		let l2 = dmm.get_tile(Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.z,b.z));
		if(l1.z != l2.z) {
			for(let z = l1.z; z <= l2.z; z++) {
				this.draw_box(render_instances, appearances, dmm.get_tile(l1.x,l1.y,z), dmm.get_tile(l2.x,l2.y,z));
			}
			return;
		}
		if(l1 == l2) {
			render_instances.push(new RenderInstance(appearances[15], l1.x, l1.y, l1.z));
		} else if(l1.x == l2.x) {
			render_instances.push(new RenderInstance(appearances[14], l1.x, l1.y, l1.z));
			render_instances.push(new RenderInstance(appearances[13], l2.x, l2.y, l1.z));
			for(let y = l1.y + 1; y <= l2.y - 1; y++) {
				render_instances.push(new RenderInstance(appearances[12], l1.x, y, l1.z));
			}
		} else if(l1.y == l2.y) {
			render_instances.push(new RenderInstance(appearances[11], l1.x, l1.y, l1.z));
			render_instances.push(new RenderInstance(appearances[7], l2.x, l2.y, l2.z));
			for(let x = l1.x + 1; x <= l2.x - 1; x++) {
				render_instances.push(new RenderInstance(appearances[3], x, l1.y, l1.z));
			}
		} else {
			render_instances.push(new RenderInstance(appearances[10], l1.x, l1.y, l1.z));
			render_instances.push(new RenderInstance(appearances[5], l2.x, l2.y, l1.z));
			render_instances.push(new RenderInstance(appearances[9], l1.x, l2.y, l1.z));
			render_instances.push(new RenderInstance(appearances[6], l2.x, l1.y, l1.z));
			for(let x = l1.x + 1; x <= l2.x - 1; x++) {
				render_instances.push(new RenderInstance(appearances[2], x, l1.y, l1.z));
				render_instances.push(new RenderInstance(appearances[1], x, l2.y, l1.z));
			}
			for(let y = l1.y + 1; y <= l2.y - 1; y++) {
				render_instances.push(new RenderInstance(appearances[8], l1.x, y, l1.z));
				render_instances.push(new RenderInstance(appearances[4], l2.x, y, l1.z));
			}
		}
	},

	/**
	 * 
	 * @param {Array<any>} arr 
	 */
	shuffle(arr) {
		for(let i = 0; i < arr.length; i++) {
			let j = Math.floor(Math.random() * (arr.length - i)) + i;
			if(i == j) continue;
			let tmp = arr[i];
			arr[i] = arr[j];
			arr[j] = tmp;
		}
		return arr;
	}
}