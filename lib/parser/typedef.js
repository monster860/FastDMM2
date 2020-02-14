const {ByondList, ByondNewlist, ByondFile, ByondTypepath, ByondNew, ByondMatrix} = require('./static_values.js');
const {ProcCallNode} = require('./expression_nodes.js');
class ByondType {
	constructor(path) {
		this.path = path;
		this.vars = new Map();
		this.var_metas = new Map();
		this.fastdmm_props = new Map();
		this.fastdmm_macros = [];
		if(path != "/")
			this.vars.set("path", new ByondTypepath(path));
		this.subtypes = [];
		this.parent = null;
	}

	istype(path) {
		if(this.path == path) return true;
		if(this.parent) return this.parent.istype(path);
		return false;
	}
	set_var(key, val = null) {
		this.vars.set(key, val);
	}
	get_var(key) {
		if(this.vars.has(key))
			return this.vars.get(key);
		if(this.parent)
			return this.parent.get_var(key);
	}
	eval_var(context, key) { // evaluates the var's value and stores the result, or if it's already evaulated returns it
		if(!this.vars.has(key)) {
			if(this.parent) return this.parent.eval_var(context, key);
			return;
		}
		let val = this.vars.get(key);
		if(val != null && typeof val == "object" && !(val instanceof ByondFile || val instanceof ByondList || val instanceof ByondNewlist || val instanceof ByondTypepath || val instanceof ByondNew || val instanceof ByondMatrix)) {
			try {
				this.vars.set(key, null); // to avoid circular references I guess.
				val = val.evaluate_constant(this.make_eval_context(context));
				this.vars.set(key, val);
			} catch(e) {
				console.warn(new Error(`Could not evaluate ${this.path} var/${key}: ${e.stack}`));
				this.vars.set(this.identifier, undefined);
				val = undefined;
			}
		}		
		return val;
	}
	make_eval_context(context) {
		return {types: context.types, src: this};
	}
	set_var_meta(key, val) {
		if(this.var_metas.get(key)) throw new Error(`Duplicate definition for ${this.path}/var/${key}`);
		this.var_metas.set(key, val);
	}
	get_var_meta(key) {
		if(this.var_metas.has(key))
			return this.var_metas.get(key);
		if(this.parent)
			return this.parent.get_var_meta(key);
	}
	get_fastdmm_prop(key, eval_context = undefined) {
		let retval = null;
		if(this.fastdmm_props.has(key)) retval = this.fastdmm_props.get(key);
		else if(this.parent) retval = this.parent.get_fastdmm_prop(key);
		if(eval_context && retval) retval = retval.evaluate_constant(eval_context);
		return retval;
	}
	*get_fastdmm_macros(name, parent_first = false) {
		if(parent_first) {
			if(this.parent) {
				yield* this.parent.get_fastdmm_macros(name, parent_first);
			}
			for(let macro of this.fastdmm_macros) {
				if(macro.identifier == name)
					yield macro;
			}
		} else {
			for(let i = this.fastdmm_macros.length-1; i >= 0; i--) {
				let macro = this.fastdmm_macros[i];
				if(macro.identifier == name)
					yield macro;
			}
			if(this.parent) {
				yield* this.parent.get_fastdmm_macros(name, parent_first);
			}
		}
	}
	handle_fastdmm_macro(proc_call) {
		if(!(proc_call instanceof ProcCallNode)) throw new Error("Not a proc call");
		for(let i = 0; i < proc_call.args.length; i++) {
			let arg = proc_call.args[i];
			let arg_name = proc_call.arg_names[i];
			if(arg_name) {
				if(!valid_fastdmm_prop_names.has(arg_name)) throw new Error("Unrecognized FASTDMM_PROP property: " + arg_name + " in type " + this.path);
				this.fastdmm_props.set(arg_name, arg); // no evaluating here
			} else if(arg instanceof ProcCallNode) {
				if(!valid_fastdmm_macro_names.has(arg.identifier)) throw new Error("Unrecognized FASTDMM_PROP macro: " + arg_name + " in type " + this.path);
				this.fastdmm_macros.push(arg); // no evaluating here
			} else {
				throw new Error("FASTDMM_PROP error in type " + this.path + " - unexpected " + (arg ? arg.constructor.name : arg));
			}
		}
	}
	toString() {
		return this.path;
	}
}

class VarMeta {
	constructor() {
		this.type = null;
		this.is_global = false;
		this.is_tmp = false;
	}
}

ByondType.VarMeta = VarMeta;

const valid_fastdmm_prop_names = new Set([
	'pinned_vars',
	'dir_amount',
	'pipe_group',
	'pipe_interference_group',
	'pipe_type',
	'pipe_astar_cost'
]);
const valid_fastdmm_macro_names = new Set([
	'set_instance_vars'
]);

module.exports = ByondType;