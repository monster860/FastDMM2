class ByondList {
	constructor(keys = [], values = []) {
		this.keys = keys;
		this.values = values;
		Object.freeze(this);
	}
	toString() {
		return "/list";
	}
}

class ByondNew {
	constructor(type, args = [], arg_names = []) {
		this.type = type;
		this.args = args;
		this.arg_names = arg_names;
		Object.freeze(this);
	}
	toString() {
		return this.type;
	}
}

class ByondNewlist {
	constructor(types = []) {
		this.types = types;
		Object.freeze(this);
	}
	toString() {
		return "/list";
	}
}

class ByondTypepath {
	constructor(path, instance_vars) {
		this.path = path;
		this.vars = instance_vars;
		Object.freeze(this);
	}
	toString() {
		return this.path;
	}
}

class ByondFile {
	constructor(file) {
		this.file = file;
		Object.freeze(this);
	}
	toString() {
		return this.file;
	}
}

class ByondMatrix {
	constructor(a, b, c, d, e, f) {
		this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
		Object.freeze(this);
	}
	toString() {
		return "/matrix";
	}
}

const text_macros = new Map([ // use noncharacters to represent text macros (thanks unicode)
	['\uFDD0', 'improper'],
	['\uFDD1', 'proper']
]);

module.exports = {ByondList, ByondNewlist, ByondTypepath, ByondFile, ByondNew, ByondMatrix, text_macros};
