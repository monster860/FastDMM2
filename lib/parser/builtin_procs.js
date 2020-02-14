function to_degrees(in_func) {
	return (...args) => {
		return in_func(...args) * 180 / Math.PI;
	};
}

function to_radians(in_func) {
	return (degrees) => {
		return in_func(degrees * Math.PI / 180);
	};
}

module.exports = new Map(Object.entries({
	abs: Math.abs,
	arccos: to_degrees(Math.acos),
	arcsin: to_degrees(Math.asin),
	arctan(x, y) {
		if(y == undefined) {
			return Math.atan(x) * 180 / Math.PI;
		} else {
			return Math.atan2(y, x) * 180 / Math.PI;
		}
	},
	ascii2text(val) {return String.fromCharCode(val);},
	ckey(key) {return key.toLowerCase().replace(/[^a-z0-9@]/gi, "");},
	ckeyEx(key) {return key.replace(/[^a-z0-9@]/gi, "");},
	clamp(n, low, high) {
		if(n == null) n = 0;
		return Math.min(Math.max(n, low), high);
	},
	copytext(T, start, end) {
		return T.substring(start-1, end-1);
	},
	cos: to_radians(Math.cos),
	length(item) {return item.length;},
	text2num: parseFloat,
	round(a, b) {
		if(b == undefined) {
			return Math.floor(a);
		} else {
			return Math.round(a / b) * b;
		}
	},
	sin: to_radians(Math.sin),
	sqrt: Math.sqrt,
	tan: to_radians(Math.tan),
	text2ascii(val) {return val.charCodeAt(0);}
}));