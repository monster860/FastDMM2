'use strict';

function reduce(arr, width, height) {
	let new_arr = new Uint8Array(width * height);
	let h_width = width >> 1;
	let h_height = height >> 1;
	let width4 = width << 2;
	for(let y = 0; y < h_height; y++) {
		for(let x = 0; x < h_width; x++) {
			let base_index = ((y << 1) * width + (x << 1)) << 2;
			let a1 = arr[base_index+3], a2 = arr[base_index+7], a3 = arr[base_index + width4 + 3], a4 = arr[base_index + width4 + 7];
			let total = a1+a2+a3+a4;
			if(total == 0) continue;
			let a = (a1*a1)+(a2*a2)+(a3*a3)+(a4*a4);
			let r = arr[base_index]*a1 + arr[base_index+4]*a2 + arr[base_index + width4]*a3 + arr[base_index + width4 + 4]*a4;
			let g = arr[base_index+1]*a1 + arr[base_index+5]*a2 + arr[base_index + width4 + 1]*a3 + arr[base_index + width4 + 5]*a4;
			let b = arr[base_index+2]*a1 + arr[base_index+6]*a2 + arr[base_index + width4 + 2]*a3 + arr[base_index + width4 + 6]*a4;
			
			let new_base_index = (y * h_width + x) << 2;
			new_arr[new_base_index] = (r / total)|0;
			new_arr[new_base_index+1] = (g / total)|0;
			new_arr[new_base_index+2] = (b / total)|0;
			new_arr[new_base_index+3] = (a / total)|0;
		}
	}
	return new_arr;
}

onmessage = function(e) {
	let d = e.data;
	let icon_width = d.icon_width;
	let icon_height = d.icon_height;
	let width = d.width;
	let height = d.height;
	let curr_arr = new Uint8Array(d.in_buf);
	let out_bufs = [];
	while((icon_width & 1) == 0 && (icon_height & 1) == 0 && icon_width && icon_height && out_bufs.length < 5) {
		curr_arr = reduce(curr_arr, width, height);
		out_bufs.push(curr_arr.buffer);
		width = width >>> 1;
		height = height >>> 1;
		icon_width = icon_width >>> 1;
		icon_height = icon_height >>> 1;
	}
	postMessage({key: d.key, out_bufs, width: d.width, height: d.height}, out_bufs);
}