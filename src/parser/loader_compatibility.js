const {ByondList, ByondNewlist, ByondTypepath, ByondFile, ByondNew, ByondMatrix} = require('./static_values.js');
const stringify_byond = require('./stringify.js');
module.exports = function check_loader_compaitibilty(thing) { // Checks compatibility against the limited map loader used on many SS13 servers
	if(thing == null) {
		return true;
	} else if(typeof thing == "number") {
		if(thing == Infinity) return false; // Infinity, -Infinity, and NaN will be parsed as 1, -1, and 1 by the map loader.
		else if(thing == -Infinity) return false;
		else if(thing != thing) return false;
		return true;
	} else if(typeof thing == "string") {
		return stringify_byond(thing) == `"${thing}"`; // string parsing is very primitive and just copies whatevers in the quotes.
	} else if(thing instanceof ByondNew) {
		return false;
	} else if(thing instanceof ByondTypepath) {
		if(thing.vars && thing.vars.size) {
			return false;
		}
		return true;
	} else if(thing instanceof ByondFile) {
		return true;
	} else if(thing instanceof ByondNewlist) {
		return false;
	} else if(thing instanceof ByondList) {
		if(thing.keys) {
			for(let i = 0; i < thing.keys.length; i++) {
				if(thing.values && thing.values[i] !== undefined) {
					if(!check_loader_compaitibilty(thing.values[i])) return false;
				}
				if(!check_loader_compaitibilty(thing.keys[i])) return false;
			}
		}
		return true;
	} else if(thing instanceof ByondMatrix) {
		return false;
	}
	return false;
}