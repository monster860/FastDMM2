class RenderInstance {
	/**
	 * 
	 * @param {import("./rendering/appearance"} appearance 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} z 
	 * @param {import("./parser/dmm").Tile} tile 
	 * @param {import("./parser/dmm").Instance} instance 
	 * @param {boolean} detect_clicks 
	 */
	constructor(appearance, x, y, z, tile = null, instance = null, detect_clicks = false) {
		this.appearance = appearance;
		this.x = x;
		this.y = y;
		this.z = z;
		this.tile = tile;
		this.instance = instance;
		this.detect_clicks = detect_clicks;
	}
}
module.exports = RenderInstance;