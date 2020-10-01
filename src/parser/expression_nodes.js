'use strict';
const {ByondList, ByondNewlist, ByondFile, ByondTypepath, ByondNew, ByondMatrix} = require('./static_values.js');
const stringify_byond = require('./stringify');
const builtin_procs = require('./builtin_procs.js');

class UnaryPrefixNode {
	constructor(operator, operand) {
		this.operator = operator.value;
		this.operand = operand;
	}
	evaluate_constant(context) {
		let operand = this.operand.evaluate_constant(context);
		switch(this.operator) {
		case "~":
			return ~operand & 0xFFFFFF;
		case "!":
			return !operand;
		case "-":
			return -operand;
		default:
			throw new Error(`Non-constant unary operator ${operator}`);
		}
	}
}

class UnaryPostfixNode {
	constructor(operator, operand) {
		this.operator = operator.value;
		this.operand = operand;
	}
}

class BinaryOpNode {
	constructor(operator, left, right) {
		this.operator = operator.value;
		this.left = left;
		this.right = right;
	}
	evaluate_constant(context) {
		let left = this.left.evaluate_constant(context);
		if((this.operator == "||" && left) || (this.operator == "&&" && !left)) return left; // short circuiting
		let right = this.right.evaluate_constant(context);
		// this is very inefficient, but I'm too lazy to expand it out to something that is.
		let res = eval(`left ${this.operator} right`);
		if(res == "|" || res == "&" || res == "^" || res == "<<" || res == ">>") res &= 0xFFFFFF; // cast it to int and cut off some bits.
		return res;
	}
}

class TernaryOpNode {
	constructor(condition, if_true, if_false) {
		this.condition = condition;
		this.if_true = if_true;
		this.if_false = if_false;
	}
	evaluate_constant(context) {
		let condition = this.condition.evaluate_constant(context);
		if(condition) {
			return this.if_true.evaluate_constant(context);
		} else {
			return this.if_false.evaluate_constant(context);
		}
	}
}

class ConstantNode {
	constructor(n) {
		this.value = n.value;
	}
	evaluate_constant() {
		return this.value;
	}
}

class StringNode {
	constructor(n) {
		this.value = n;
	}
	evaluate_constant(context) {
		let str = "";
		for(let part of this.value) { // technically they're not constant expressions in BYOND but meh.
			if(typeof part == "string") {
				str += part;
			} else {
				str += part.evaluate_constant(context);
			}
		}
		return str;
	}
}

class PathNode {
	constructor(n) {
		this.path_tokens = n;
		this.override_properties = null;
	}

	evaluate_constant(context) {
		let path_str = "";
		for(let token of this.path_tokens) {
			if (token.value == "/" || token.value == "." || token.value == ":") {
				continue;
			} else {
				path_str += "/" + token.value;
			}
		}
		let override_vars;
		if(this.override_properties) {
			override_vars = new Map();
			for(let [k,v] of this.override_properties) {
				override_vars.set(k, v.evaluate_constant(context));
			}
		}
		return new ByondTypepath(path_str, override_vars);
	}
}

class FileNode {
	constructor(token) {
		if(token.value.length != 1)
			throw new Error("File at " + token.format_pos() + " is non-constant");
		this.value = token.value[0];
	}
	evaluate_constant() {
		return new ByondFile(this.value);
	}
}

class VarAccessNode {
	constructor(identifier, dot_object, dot_operator) {
		this.identifier = identifier.value;
		this.dot_object = dot_object;
		this.dot_operator = dot_operator ? dot_operator.value : undefined;
	}
	evaluate_constant(context) {
		if(!this.dot_object && context && context.var_overrides && context.var_overrides.has(this.identifier)) {
			let val = context.var_overrides.get(this.identifier);
			if(typeof val == "function") return val(this, context);
			return val;
		} else if(!this.dot_object && this.identifier == "null") {
			return null;
		} else if(!this.dot_object && context.types.get("/").get_var(this.identifier) !== undefined) {
			return context.types.get("/").eval_var(context, this.identifier);
		} else if(!this.dot_object && context.src && context.src.get_var(this.identifier) !== undefined) {
			return context.src.eval_var(context, this.identifier);
		}
		throw new Error("Non-constant variable access - " + (this.dot_operator||"") + this.identifier);
	}
}

class ListAccessNode {
	constructor(obj, index) {
		this.list = obj;
		this.index = index;
	}
}

class ProcCallNode {
	constructor(identifier, args, arg_names, dot_object, dot_operator) {
		this.identifier = identifier.value;
		this.args = args;
		this.arg_names = arg_names;
		this.dot_object = dot_object;
		this.dot_operator = dot_operator && dot_operator.value;
	}

	evaluate_constant(context) {
		if(!this.dot_object && context && context.proc_overrides && context.proc_overrides.has(this.identifier)) {
			return context.proc_overrides.get(this.identifier)(this, context);
		} else if(!this.dot_object && this.identifier == "list") {
			let keys = [];
			let values = [];
			for(let i = 0; i < this.args.length; i++) {
				if(this.args[i] instanceof BinaryOpNode && this.args[i].operator == "=") {
					keys[i] = this.args[i].left.evaluate_constant(context);
					values[i] = this.args[i].right.evaluate_constant(context);
				} else if(this.arg_names && this.arg_names[i]) {
					keys[i] = this.arg_names[i];
					values[i] = this.args[i] ? this.args[i].evaluate_constant(context) : undefined;
				} else {
					keys[i] = this.args[i] ? this.args[i].evaluate_constant(context) : undefined;
					values[i] = undefined;
				}
			}
			return new ByondList(keys, values);
		} else if(!this.dot_object && this.identifier == "newlist") {
			let items = [];
			for(let i = 0; i < this.args.length; i++) {
				items.push(this.args[i].evaluate_constant(context));
			}
			return new ByondNewlist(items);
		} else if(!this.dot_object && this.identifier == "matrix") {
			let matrix_params = [];
			for(let i = 0; i < 6; i++) {
				matrix_params.push(this.args[i].evaluate_constant(context));
			}
			return new ByondMatrix(...matrix_params);
		} else if(!this.dot_object && this.identifier == "rgb") {
			let r = Math.min(Math.max(this.args[0].evaluate_constant(context)|0, 0));
			let g = Math.min(Math.max(this.args[1].evaluate_constant(context)|0, 0));
			let b = Math.min(Math.max(this.args[2].evaluate_constant(context)|0, 0));
			let str = "#" + r.toString(16).padStart(2,0) + g.toString(16).padStart(2,0) + b.toString(16).padStart(2,0);
			if(this.args[3] != null) {
				str += Math.min(Math.max(this.args[3].evaluate_constant(context)|0, 0)).toString(16).padStart(2,0);
			}
			return str;
		} else if(!this.dot_object && builtin_procs.has(this.identifier)) {
			builtin_procs.get(this.identifier);
			let evaluated = [];
			for(let i = 0; i < this.args.length; i++) {
				if(this.args[i]) evaluated[i] = this.args[i].evaluate_constant(context);
			}
			return builtin_procs.get(this.identifier)(...evaluated);
		}
		throw new Error("Non-constant proc-call " + (this.dot_operator||"") + this.identifier + "()");
		return null; // apparently the byond behavior for a non-constant expression is returning null.
	}
}

class NewNode {
	constructor(args, arg_names, type) {
		this.args = args;
		this.arg_names = arg_names;
		this.type = type;
	}

	evaluate_constant(context) {
		//if(!type) throw new Error("Unknown type for constructor call");
		let type = this.type ? this.type.evaluate_constant(context) : this.type;
		let args = [];
		if(this.args) {
			for(let arg of this.args) {
				args.push(arg ? arg.evaluate_constant(context) : arg);
			}
		}
		return new ByondNew(type, args, this.arg_names);
	}
}

function p_cond(text, flag) {
	return flag ? "(" + text + ")" : text;
}

module.exports = {UnaryPrefixNode, UnaryPostfixNode, BinaryOpNode, ConstantNode, StringNode, PathNode, FileNode, VarAccessNode, ListAccessNode, ProcCallNode, NewNode, TernaryOpNode};
