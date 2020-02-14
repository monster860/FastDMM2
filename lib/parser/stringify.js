const {ByondList, ByondNewlist, ByondTypepath, ByondFile, ByondNew, ByondMatrix} = require('./static_values.js');
const {text_macros} = require('./static_values.js');
module.exports = function stringify_byond(thing, tgm = false) {
	if(thing == null) {
		return "null";
	} else if(typeof thing == "number") {
		thing = Math.fround(thing);
		if(thing == Infinity) return "1.#INF";
		else if(thing == -Infinity) return "-1.#INF";
		else if(thing != thing) return "1.#IND";
		//return ""+thing;
		// Replicate BYOND's shitty float behavior
		let abs_thing = Math.abs(thing);
		if(abs_thing != 0 && (abs_thing < 0.0001 || abs_thing >= 1000000)) {
			let as_scientific = thing.toExponential(5);
			let parts = /^([\d\.]*)e([+-])?(\d+)$/.exec(as_scientific);
			if(!parts) return as_scientific;
			return `${+parts[1]}e${parts[2] || "+"}${parts[3].padStart(3, 0)}`;
		} else {
			return `${+thing.toPrecision(6)}`;
		}
	} else if(typeof thing == "string") {
		let stringified = JSON.stringify(thing);
		return stringified.replace(/[\[\uFDD0-\uFDDF]/g, (character) => {
			if(character == '[') return '\\[';
			return ('\\' + text_macros.get(character) + ' ');
		});
	} else if(thing instanceof ByondNew) {
		let str = `new ${stringify_byond(thing.type)}(`;
		if(thing.args) {
			for(let i = 0; i < thing.args.length; i++) {
				if(i != 0) str += ",";
				if(thing.arg_names && thing.arg_names[i] !== undefined) str += thing.arg_names[i] + " = ";
				str += stringify_byond(thing.args[i]);
			}
		}
		str += ")";
		return str;
	} else if(thing instanceof ByondTypepath) {
		let str = thing.path;
		if(thing.vars && thing.vars.size) {
			str += "{";
			let first = true;
			for(let [k,v] of thing.vars) {
				if(!first) {str += ";";}
				if(!first && !tgm) {str += " ";}
				first = false;
				if(tgm) {str += "\n\t";}
				str += k;
				str += " = ";
				str += stringify_byond(v);
			}
			if(tgm) {str += "\n\t";}
			str += "}";
		}
		return str;
	} else if(thing instanceof ByondFile) {
		return `'${thing.file}'`;
	} else if(thing instanceof ByondNewlist) {
		let str = `newlist(`;
		if(thing.types) {
			for(let i = 0; i < thing.types.length; i++) {
				if(i != 0) str += ",";
				str += stringify_byond(thing.types[i]);
			}
		}
		str += ")";
		return str;
	} else if(thing instanceof ByondList) {
		let str = `list(`;
		if(thing.keys) {
			let is_assoc = false;
			if(thing.values) {
				for(let value of thing.values) {
					if(value !== undefined) is_assoc = true;
				}
			}
			for(let i = 0; i < thing.keys.length; i++) {
				if(i != 0) str += ",";
				if(i != 0 && is_assoc) str += " "; // theres spaces after commas but only after associative lists. Thanks, BYOND.
				if(thing.keys[i] == "undefined") continue;
				str += stringify_byond(thing.keys[i]);
				if(thing.values && thing.values[i] !== undefined) {
					str += " = ";
					str += stringify_byond(thing.values[i]);
				}
			}
		}
		str += ")";
		return str;
	} else if(thing instanceof ByondMatrix) {
		return `matrix(${stringify_byond(thing.a)}, ${stringify_byond(thing.b)}, ${stringify_byond(thing.c)}, ${stringify_byond(thing.d)}, ${stringify_byond(thing.e)}, ${stringify_byond(thing.f)})`;
	}
	throw new Error("Cannot stringify " + thing + " (" + thing.constructor.name + ")");
}