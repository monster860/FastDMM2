const Matrix = require('./matrix.js');

class Appearance {
	constructor({
		icon = null,
		icon_state = null,
		name = null,
		appearance_flags = null,
		layer = 2,
		plane = -32767,
		dir = 2,
		color = [1,1,1],
		alpha = 1,
		pixel_x = 0,
		pixel_y = 0,
		blend_mode = 0,
		invisibility = 0,
		pixel_w = 0,
		pixel_z = 0,
		transform = Matrix.identity
	} = {}) {
		this.icon = icon;
		this.icon_state = icon_state;
		this.name = name;
		this.appearance_flags = appearance_flags;
		this.layer = layer;
		this.plane = plane;
		this.dir = dir;
		this.color = color;
		this.alpha = alpha;
		this.pixel_x = pixel_x;
		this.pixel_y = pixel_y;
		this.blend_mode = blend_mode;
		this.invisibility = invisibility;
		this.pixel_w = pixel_w;
		this.pixel_z = pixel_z;
		this.transform = transform;
		Object.seal(this);
	}
}

module.exports = Appearance;