'use strict';
const lexer = require('./lexer.js');
const path = require('path');
const {WordToken, CommentToken, SymbolToken, NumberToken, StringToken, NewlineToken, RawToken, IncludeToken} = require('./tokens.js');
const {UnaryPrefixNode, UnaryPostfixNode, BinaryOpNode, TernaryOpNode, ConstantNode, StringNode, VarAccessNode, PathNode, FileNode, ListAccessNode, ProcCallNode, NewNode} = require('./expression_nodes.js');
const {ByondList, ByondNewlist, ByondTypepath, ByondFile, ByondNew} = require('./static_values.js');
const ByondType = require('./typedef.js');
const stringify_byond = require('./stringify.js');

let binary_precedence = {
	"**": 13,
	"*": 12, "/": 12, "%": 12,
	"+": 11, "-": 11,
	"<": 10, "<=": 10, ">": 10, ">=": 10,
	"<<": 9, ">>": 9,
	"==": 8, "!=": 8, "<>": 8, "~=": 8, "~!": 8,
	"&": 7,
	"^": 6,
	"|": 5,
	"&&": 4,
	"||": 3,
	"?": 2,
	"=": 1, "+=": 1, "-=": 1, "*=": 1, "/=": 1, "%=": 1, "&=": 1, "|=": 1, "^=": 1, "<<=": 1, ">>=": 1
}

let right_associative_ops = [
	"=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", "?"
];

let unary_precedence = 14;

class Parser {
	constructor(reader) {
		this.reader = reader;
		this.file_cache = new Map();

		this.defines = new Map();
		this.stddef_loaded = false;
		this.types = new Map();
	}

	async read_file(filename) {
		if(this.file_cache.has(filename)) {
			return await this.file_cache.get(filename);
		}
		let promise = this.reader(filename);
		this.file_cache.set(filename, promise);
		let result = await promise;
		this.file_cache.set(filename, result);
		return result;
	}

	async parse_file(filename, progress_callback) {
		if(!this.stddef_loaded) {
			this.stddef_loaded = true;
			this.parse_type_block(new TokenPointer(await this.preprocess(lexer("stddef.dm", require("./stddef.js")), "stddef.dm")));
		}
		let tokens = lexer(filename, await this.read_file(filename));
		console.log("Preprocessing...");
		try {
			let tokens_progress_callback = progress_callback && ((percent, file) => {
				progress_callback(percent * 0.95, file ? "Loading " + file : null);
			});
			tokens = await this.preprocess(tokens, filename, false, tokens_progress_callback);
		} catch(e) {
			console.error(tokens);
			throw e;
		}
		if(progress_callback) progress_callback(0.95, "Parsing...");
		await new Promise(resolve => {setTimeout(resolve, 1);});
		console.log("Parsing...");
		try {
			console.log(this.parse_type_block(new TokenPointer(tokens)));
		} catch(e) {
			console.error(tokens);
			throw e;
		}
		if(progress_callback) progress_callback(0.98, "Finalizing...");
		await new Promise(resolve => {setTimeout(resolve, 1);});
		this.finalize_objects();
	}

	very_aggressive_preloading(full_path, text) {
		let split = text.split("\n");
		for(let line of split) {
			if(line.startsWith("#include")) {
				let first_quote_index = line.indexOf('"');
				let last_quote_index = line.indexOf('"', first_quote_index+1);
				let partial_path = line.substring(first_quote_index+1, last_quote_index);
				
				let full_file = path.join(path.dirname(full_path), partial_path);
				if([".dm",".dme"].includes(path.extname(full_file))) {
					this.read_file(full_file).then(this.very_aggressive_preloading.bind(this, full_file), ()=>{}); // eat errors because we just want to add it to the cache.
				}
			}
		}
	}

	async preprocess(tokens, filename, process_defined = false, progress_callback) {
		// preload the files
		let progress_file_total = 0;
		let progress_file = 0

		for(let i = 0; i < tokens.length; i++) {
			if(!(tokens[i] instanceof NewlineToken) && i > 0)
				continue;
			if(tokens[i] instanceof NewlineToken)
				i++;
			if(!(tokens[i] instanceof SymbolToken && tokens[i].value == "#"))
				continue;
			i++;
			if(!(tokens[i] instanceof WordToken && tokens[i].value == "include"))
				continue;
			i++;
			if(!(tokens[i] instanceof StringToken))
				continue;
			let full_file = path.join(path.dirname(filename), tokens[i].value[0].replace(/\\/g, "/"));
			if(path.extname(full_file) == ".dm") {
				this.read_file(full_file).then(this.very_aggressive_preloading.bind(this, full_file), ()=>{}); // eat errors because we just want to add it to the cache.
				progress_file_total++;
			}
		}
		let new_tokens = [];
		let if_stack = [];
		for(let i = 0; i < tokens.length; i++) {
			let is_unincluded = false;
			for(let item of if_stack) if(item <= 0) is_unincluded = true;
			if(!is_unincluded && tokens[i] instanceof StringToken) {
				let new_str_token = new StringToken(tokens[i], [...tokens[i].value], tokens[i].whitespace_flag, tokens[i].multiline, tokens[i].uses_text_macros, tokens[i].is_file);
				for(let j = 0; j < new_str_token.value.length; j++) {
					if(new_str_token.value[j] instanceof Array) {
						new_str_token.value[j] = await this.preprocess(new_str_token.value[j], filename);
					}
				}
				new_tokens.push(new_str_token);
				continue;
			} if(!is_unincluded && tokens[i] instanceof WordToken) {
				let token = tokens[i];
				let word = token.value;
				let define = this.defines.get(word);
				if(define && (!define.arguments || (tokens[i+1] instanceof SymbolToken && tokens[i+1].value == "("))) {
					let argument_values = [];
					if(define.arguments) {
						i++;
						if(!(tokens[i] instanceof SymbolToken && tokens[i].value == "("))
							throw new Error("Expected ( at " + tokens[i].format_pos() + ", got " + tokens[i] + " instead");
						i++;
						let curr_arg = [];
						let parentheses_depth = 0;
						while(tokens[i] && !(tokens[i] instanceof SymbolToken && tokens[i].value == ")" && parentheses_depth == 0)) {
							if(tokens[i] instanceof SymbolToken) {
								if(tokens[i].value == "(") parentheses_depth++;
								else if(tokens[i].value == ")") parentheses_depth--;
								else if(parentheses_depth == 0 && tokens[i].value == "," && (!define.variadic || define.arguments.length > argument_values.length+1	)) {
									argument_values.push(curr_arg);
									curr_arg = [];
									i++;
									continue;
								}
							}
							if(!(tokens[i] instanceof CommentToken)) curr_arg.push(tokens[i]);
							i++;
						}
						argument_values.push(curr_arg);
					}
					while(define.arguments && argument_values.length < define.arguments.length) argument_values.push([]);
					let out_tokens = [];

					for(let i = 0; i < define.value.length; i++) {
						let t = define.value[i];
						if(define.arguments && t instanceof WordToken) {
							let arg_index = define.arguments.indexOf(t.value);
							if(arg_index != -1 && arg_index < argument_values.length) {
								for(let t2 of argument_values[arg_index]) {
									out_tokens.push(t2);
								}
								continue;
							}
						} else if(define.arguments && t instanceof SymbolToken && t.value == "#" && (i+1) < define.value.length) {
							let arg_index = define.arguments.indexOf(define.value[i+1].value);
							if(arg_index != -1 && arg_index < argument_values.length) {
								let str = "";
								for(let t2 of argument_values[arg_index]) {
									str += t2.raw();
								}
								i++;
								out_tokens.push(new StringToken(argument_values[arg_index][0], str));
								continue;
							}
						}
						out_tokens.push(t.copy(token));
					}
					out_tokens = await this.preprocess(out_tokens, filename);
					out_tokens = this.token_paste(out_tokens);
					for(let t of out_tokens) {
						new_tokens.push(t);
					}
					continue;
				} else if(process_defined && word == "defined") {
					i++;
					if(!(tokens[i] instanceof SymbolToken && tokens[i].value == "("))
						throw new Error("Expected ( at " + tokens[i].format_pos() + ", got " + tokens[i] + " instead");
					i++;
					let define_to_check;
					if(!(tokens[i] instanceof WordToken))
						throw new Error("Expected WordToken at " + tokens[i].format_pos() + ", got " + tokens[i] + " instead");
					define_to_check = tokens[i].value;
					new_tokens.push(new NumberToken(tokens[i], +!!this.defines.get(define_to_check)));
					i++;
					if(!(tokens[i] instanceof SymbolToken && tokens[i].value == ")"))
						throw new Error("Expected ) at " + tokens[i].format_pos() + ", got " + tokens[i] + " instead");
					continue;
				}
			}
			if(/*(i == 0 || tokens[i-1] instanceof NewlineToken) &&*/ // hey did you know you can have a define in the middle of a line in BYOND? neither did I.
				tokens[i] instanceof SymbolToken &&
				tokens[i].value == "#") {
				let pound_token = tokens[i];
				i++;
				if(!(tokens[i] instanceof WordToken))
					throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
				let preprocessor_type = tokens[i].value;
				i++;
				if(preprocessor_type == "endif") {
					if_stack.length--;
				} else if(preprocessor_type == "else") {
					if(if_stack[if_stack.length-1] > 0)
						if_stack[if_stack.length-1] = -1;
					else if(if_stack[if_stack.length-1] == 0)
						if_stack[if_stack.length-1] = 1;
				} else if(is_unincluded && ["ifndef", "ifdef", "if"].includes(preprocessor_type)) {
					if_stack.push(-1);
				} else if(preprocessor_type == "ifndef") {
					if(!(tokens[i] instanceof WordToken))
						throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
					if_stack.push(this.defines.has(tokens[i].value) ? 0 : 1);
					i++;
				} else if(preprocessor_type == "ifdef") {
					if(!(tokens[i] instanceof WordToken))
						throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
					if_stack.push(this.defines.has(tokens[i].value) ? 1 : 0);
					i++;
				} else if(preprocessor_type == "if") {
					let expression_tokens = [];
					while(tokens[i] && !(tokens[i] instanceof NewlineToken)) {
						expression_tokens.push(tokens[i]);
						i++;
					}
					expression_tokens = await this.preprocess(expression_tokens, filename, true);
					try {
						if_stack.push(+!!Parser.parse_expression(new TokenPointer(expression_tokens)).evaluate_constant());
					} catch(e) {
						console.error(`At ${(tokens[i] || tokens[i-1]).format_pos()}:`);
						throw e;
					}
				} else if(preprocessor_type == "elif") {
					let expression_tokens = [];
					while(tokens[i] && !(tokens[i] instanceof NewlineToken)) {
						expression_tokens.push(tokens[i]);
						i++;
					}
					if(if_stack[if_stack.length-1] == 0) {
						expression_tokens = await this.preprocess(expression_tokens, filename, true);
						try {
							if_stack[if_stack.length-1] = Parser.parse_expression(new TokenPointer(expression_tokens)).evaluate_constant() ? 1 : 0;
						} catch(e) {
							console.error(`At ${(tokens[i] || tokens[i-1]).format_pos()}:`);
							throw e;
						}
					} else {
						if_stack[if_stack.length-1] = -1;
					}
				} if(!is_unincluded && preprocessor_type == "include") {
					if(!(tokens[i] instanceof StringToken)) {
						throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
					}
					let include_filename = path.join(path.dirname(filename), tokens[i].value[0].replace(/\\/g, "/"));
					if([".dm",".dme"].includes(path.extname(include_filename))) {
						//console.log("Including " + include_filename);
						if(progress_file_total && progress_callback) {
							progress_callback(progress_file++ / progress_file_total, include_filename);
							if(progress_file % 200 == 0) {
								await new Promise(resolve => {setTimeout(resolve, 1);});
							}
						}
						let token = new IncludeToken(pound_token, await this.preprocess(lexer(include_filename, await this.read_file(include_filename)), include_filename));
						token.include_filename = include_filename
						new_tokens.push(token);
					}
					i++;
				} else if(!is_unincluded && preprocessor_type == "undef") {
					if(!(tokens[i] instanceof WordToken))
						throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
					this.defines.delete(tokens[i].value);
					i++;
				} else if(!is_unincluded && preprocessor_type == "define") {
					if(!(tokens[i] instanceof WordToken))
						throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
					let define = new Define(tokens[i].value);
					i++;
					if(tokens[i] instanceof SymbolToken && tokens[i].value == "(" && !tokens[i].whitespace_flag) {
						define.arguments = [];
						while(tokens[i] && (!(tokens[i] instanceof SymbolToken) || tokens[i].value != ")")) {
							i++;
							if(tokens[i] instanceof SymbolToken && tokens[i].value == "...") {
								define.arguments.push("__VA_ARGS__");
							} else {
								if(!(tokens[i] instanceof WordToken)) {
									throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
								}
								define.arguments.push(tokens[i].value);
								i++;
							}
							if(!(tokens[i] instanceof SymbolToken) || (tokens[i].value != ")" && tokens[i].value != "," && tokens[i].value != "...")) {
								throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
							}
							if(tokens[i].value == "...") {
								i++;
								define.variadic = true;
								break;
							}
						}
						if(!(tokens[i] instanceof SymbolToken) || tokens[i].value != ")")
							throw new Error(`Unexpected ${tokens[i]} at ${tokens[i].format_pos()}`);
						i++;
					}
					while(tokens[i] && !(tokens[i] instanceof NewlineToken)) {
						if(!(tokens[i] instanceof CommentToken))
							define.value.push(tokens[i]);
						i++;
					}
					this.defines.set(define.name, define);
				} else if(!is_unincluded && preprocessor_type == "error") {
					let raw = tokens[i];
					throw new Error(raw.format_pos() + " " + raw.value);
					i++;
				} else if(!is_unincluded && preprocessor_type == "warn") {
					let raw = tokens[i];
					console.warn(raw.format_pos() + " " + raw.value);
					i++;
				}
				is_unincluded = false;
				for(let item of if_stack) if(item <= 0) is_unincluded = true;
			}
			if(!is_unincluded)
				new_tokens.push(tokens[i]);
		}
		return new_tokens;
	}

	token_paste(tokens) {
		let new_tokens = [];
		for(let i = 0; i < tokens.length; i++) {
			if(tokens[i] instanceof SymbolToken) {
				if(tokens[i].value == "##") {
					i++;
					if(tokens[i-2] instanceof WordToken && !tokens[i-1].whitespace_flag && (tokens[i] instanceof WordToken || tokens[i] instanceof NumberToken)) {
						let ni = new_tokens.length - 1;
						new_tokens[ni] = new WordToken(tokens[i-2], ""+tokens[i-2].value, tokens[i-2].whitespace_flag);
						new_tokens[ni].value += tokens[i].value;
						continue;
					}
				}
			}
			new_tokens.push(tokens[i]);
		}
		return new_tokens;
	}

	stringify_tokens(tokens) {
		let str = "";
		for(let i = 0; i < tokens.length; i++) {
			let token = tokens[i];
			if(token instanceof WordToken || token instanceof SymbolToken) {
				if(token.whitespace_flag && !(tokens[i-1] instanceof NewlineToken))
					str += " ";
				str += token.value;
			} else if(token instanceof CommentToken || token instanceof NumberToken) {
				str += token.value;
			} else if(token instanceof NewlineToken) {
				str += "\n";
				str += token.value;
			} else if(token instanceof StringToken) {
				for(let part of token.value) {
					if(typeof part == "string") {
						str += JSON.stringify(part);
					} else {
						str += this.stringify_tokens(part);
					}
				}
			}
		}
		return str;
	}

	parse_type_block(pointer, indentation = "", current_path = []) {
		let uses_brackets = false;
		let lookahead = pointer.get_next();

		if(lookahead instanceof SymbolToken && lookahead.value == "{") {
			uses_brackets = true;
			pointer.advance();
			lookahead = pointer.get_next();
		}

		while(lookahead && (uses_brackets || pointer.indentation.includes(indentation))) {
			if(uses_brackets && lookahead instanceof SymbolToken && lookahead.value == "}") {
				pointer.advance();
				break;
			} else if(lookahead instanceof NewlineToken) {
				while(lookahead instanceof NewlineToken) {
					pointer.advance();
					lookahead = pointer.get_next();
				}
				continue;
			} else if((lookahead instanceof SymbolToken && lookahead.value == "/") || lookahead instanceof WordToken) {
				let sub_path = (lookahead instanceof SymbolToken && lookahead.value == "/") ? [] : [...current_path]; // remember that starting a line with a / means you start over at the beginning.
				let is_fastdmm_macro = false;
				while((lookahead instanceof SymbolToken && lookahead.value == "/") || (lookahead instanceof WordToken && !["as","in"].includes(lookahead.value))) {
					if(lookahead instanceof WordToken) {
						if(lookahead.value == "FASTDMM_PROP") {
							is_fastdmm_macro = true;
							break;
						}
						sub_path.push(lookahead.value);
					}
					pointer.advance();
					lookahead = pointer.get_next();
				}

				if(is_fastdmm_macro) {
					let type = this.handle_type_tree_info(sub_path);
					let proccall_pointer = lookahead;
					let fastdmm_macro = Parser.parse_expression(pointer);
					lookahead = pointer.get_next();
					if(!(fastdmm_macro instanceof ProcCallNode)) {
						throw new Error("FASTDMM_PROP must be a proc call at " + proccall_pointer.format_pos());
					}
					type.handle_fastdmm_macro(fastdmm_macro);
					while(lookahead instanceof NewlineToken || (lookahead instanceof SymbolToken && lookahead.value == ";")) {
						pointer.advance();
						lookahead = pointer.get_next();
					}
					continue;
				}
				if(sub_path[sub_path.length-1] == "operator") {
					while(lookahead instanceof SymbolToken && lookahead.value != "(" && !lookahead.whitespace_flag) {
						sub_path[sub_path.length-1] += lookahead.value;
						pointer.advance();
						lookahead = pointer.get_next();
					}
				}
				let assignment_value = null;
				let proc_params = null;
				let proc_param_types = null;
				let proc_param_defaults = null;
				while(lookahead instanceof SymbolToken && lookahead.value == "[") {
					pointer.advance();
					lookahead = pointer.get_next();
					if(lookahead instanceof SymbolToken && lookahead.value == "]") {
						pointer.advance();
						lookahead = pointer.get_next();
					} else {
						let list_len_expr = Parser.parse_expression(pointer);
						assignment_value = new ProcCallNode({"value": "list"}, [list_len_expr]);
						lookahead = pointer.get_next();
						if(!(lookahead instanceof SymbolToken && lookahead.value == "]")) {
							throw new Error(`Expected "]", got ${lookahead} instead at ${lookahead.format_pos()}`);
						}
						pointer.advance();
						lookahead = pointer.get_next();
					}
				}
				if(lookahead instanceof SymbolToken && lookahead.value == "=") {
					pointer.advance();
					assignment_value = Parser.parse_expression(pointer);
					lookahead = pointer.get_next();
				} else if(lookahead instanceof SymbolToken && lookahead.value == "(") {
					proc_params = [];
					proc_param_types = [];
					proc_param_defaults = [];
					pointer.advance();
					lookahead = pointer.get_next();
					while(lookahead && !(lookahead instanceof SymbolToken && lookahead.value == ")")) {
						pointer.skip_newlines();
						lookahead = pointer.get_next();
						if(proc_params.length != 0) {
							if(!(lookahead instanceof SymbolToken && lookahead.value == ",")) {
								throw new Error(`Expected ",", got ${lookahead} instead at ${lookahead.format_pos()}`);
							}
							pointer.advance();
							lookahead = pointer.get_next();
						}
						pointer.skip_newlines();
						lookahead = pointer.get_next();
						let param_name;
						let param_type = [];
						let param_default;
						if(lookahead instanceof SymbolToken && lookahead.value == "...") {
							pointer.advance();
							lookahead = pointer.get_next();
							param_name = "...";
						} else {
							while((lookahead instanceof WordToken && !["as","in"].includes(lookahead.value)) || (lookahead instanceof SymbolToken && (lookahead.value == "/" || lookahead.value == "."))) {
								if(lookahead instanceof WordToken && lookahead.value != "var") {
									if(param_name) param_type.push(param_name);
									param_name = lookahead.value;
								}
								pointer.advance();
								lookahead = pointer.get_next();
							}
							while(lookahead instanceof SymbolToken && lookahead.value == "[") {
								pointer.advance();
								lookahead = pointer.get_next();
								if(lookahead instanceof SymbolToken && lookahead.value == "]") {
									pointer.advance();
									lookahead = pointer.get_next();
								} else {
									throw new Error(`Expected "]", got ${lookahead} instead at ${lookahead.format_pos()}`);
								}
							}
							if(lookahead instanceof SymbolToken && lookahead.value == "=") {
								pointer.advance();
								param_default = Parser.parse_expression(pointer);
								lookahead = pointer.get_next();
							}
							if(lookahead instanceof WordToken && ["as", "in"].includes(lookahead.value)) {
								let paren_depth = 0;
								while(lookahead && !(lookahead instanceof SymbolToken && (lookahead.value == "," || lookahead.value == ")") && paren_depth <= 0)) {
									if(lookahead instanceof SymbolToken) {
										if(lookahead.value == "(")paren_depth++;
										else if(lookahead.value == ")")paren_depth--;
									}
									pointer.advance();
									lookahead = pointer.get_next();
								}
							}
						}
						proc_params.push(param_name);
						proc_param_types.push(param_type);
						proc_param_defaults.push(param_default);
						pointer.skip_newlines();
						lookahead = pointer.get_next();
					}
					pointer.advance();
					lookahead = pointer.get_next();
				}
				if(lookahead instanceof WordToken && ["as", "in"].includes(lookahead.value)) {
					while(lookahead && !(lookahead instanceof SymbolToken && (lookahead.value == "{" || lookahead.value == ";")) && !(lookahead instanceof NewlineToken)) {
						pointer.advance();
						lookahead = pointer.get_next();
					}
				}
				if(lookahead && proc_params == null && !(lookahead instanceof SymbolToken && (lookahead.value == "{" || lookahead.value == ";" || lookahead.value == "}")) && !(lookahead instanceof NewlineToken)) {
					throw new Error(`Unexpected ${lookahead} at ${lookahead.format_pos()}`);
				}
				while(lookahead instanceof NewlineToken || (lookahead instanceof SymbolToken && lookahead.value == ";")) {
					pointer.advance();
					lookahead = pointer.get_next();
				}
				if(proc_params == null && !assignment_value && lookahead && !(lookahead instanceof SymbolToken && lookahead.value == ";") && ((pointer.indentation.includes(indentation) && pointer.indentation.length > indentation.length) || (lookahead instanceof SymbolToken && lookahead.value == "{"))) {
					this.parse_type_block(pointer, pointer.indentation, sub_path);
					lookahead = pointer.get_next();
				} else {
					//console.log("/" + sub_path.join("/") + (assignment_value ? " = " + assignment_value : ""));
					if(proc_params != null) {
						this.handle_type_tree_info(sub_path, null, true);
						//console.log(proc_params);
						//console.log(proc_param_types);
						//console.log(proc_param_defaults);
						// skip over proc bodies because we're making a map editor here, not a byond compiler. (or are we?)
						if(lookahead instanceof SymbolToken && lookahead.value == ";") {
							// oof
							pointer.advance();
							lookahead = pointer.get_next();
						} else if(lookahead instanceof SymbolToken && lookahead.value == "{") {
							pointer.advance();
							lookahead = pointer.get_next();
							let brace_depth = 1;
							while(brace_depth > 0 && lookahead) {
								if(lookahead instanceof SymbolToken) {
									if(lookahead.value == "{") brace_depth++;
									else if(lookahead.value == "}") brace_depth--;
								}
								pointer.advance();
								lookahead = pointer.get_next();
							}
						} else if(!(pointer.get_current() instanceof NewlineToken)) {
							while(lookahead && !(lookahead instanceof SymbolToken && lookahead.value == ";") && !(lookahead instanceof NewlineToken)) {
								pointer.advance();
								lookahead = pointer.get_next();
							}
						} else if(pointer.indentation.length > indentation.length) {
							let skip_block_indent = pointer.indentation;
							let bracket_depth = 0;
							while(lookahead && (pointer.indentation.startsWith(skip_block_indent) || bracket_depth > 0 || !(pointer.get_current() instanceof NewlineToken) || (lookahead instanceof NewlineToken))) {
								if(lookahead instanceof SymbolToken) {
									if(lookahead.value == "{" || lookahead.value == "(") bracket_depth++;
									else if(lookahead.value == "}" || lookahead.value == ")") bracket_depth--;
								}
								pointer.advance();
								lookahead = pointer.get_next();
							}
						}
					} else {
						this.handle_type_tree_info(sub_path, assignment_value);
					}
				}
			} else if(lookahead instanceof IncludeToken) {
				this.parse_type_block(new TokenPointer(lookahead.value));
				pointer.advance();
				lookahead = pointer.get_next();
			} else if(lookahead instanceof SymbolToken && lookahead.value == ";") { // imagine inserting extra semicolons
				pointer.advance();
				lookahead = pointer.get_next();
			} else {
				throw new Error(`Unexpected ${lookahead} at ${lookahead ? lookahead.format_pos() : pointer.get_current().format_pos()}`);
			}

		}
	}

	static parse_expression(pointer) {
		return Parser.parse_expression_operators(pointer, Parser.parse_primary(pointer), 0);
	}
	static parse_expression_operators(pointer, lhs, min_precedence) {
		// thanks wikipedia
		let lookahead = pointer.get_next();
		while(lookahead instanceof SymbolToken && binary_precedence[lookahead.value] >= min_precedence) {
			let op = lookahead;
			pointer.advance();
			let mhs = null;
			if(op.value == "?") {
				// ternary operator
				mhs = Parser.parse_expression(pointer);
				lookahead = pointer.get_next();
				if(!(lookahead instanceof SymbolToken && lookahead.value == ":")) throw new Error(`Unexpected ${lookahead} at ${lookahead.format_pos()}`);
				pointer.advance();
				lookahead = pointer.get_next();
			}
			let rhs = Parser.parse_primary(pointer);
			lookahead = pointer.get_next();
			while(lookahead instanceof SymbolToken &&
				(binary_precedence[lookahead.value] > binary_precedence[op.value]
				|| (right_associative_ops.includes(lookahead.value) && binary_precedence[lookahead.value] == binary_precedence[op.value]))) {
				rhs = Parser.parse_expression_operators(pointer, rhs, binary_precedence[lookahead.value]);
				lookahead = pointer.get_next();
			}
			if(op.value == "?") {
				lhs = new TernaryOpNode(lhs, mhs, rhs);
			} else {
				lhs = new BinaryOpNode(op, lhs, rhs);
			}
		}
		return lhs;
	}

	static parse_primary(pointer, ignore_proc_calls = false) {
		let next = pointer.get_next();
		pointer.advance();
		let exp;
		if(next instanceof SymbolToken && ['.', '/', ':'].includes(next.value)) {
			exp = new PathNode([next, pointer.get_next()]);
			pointer.advance();
			next = pointer.get_next();
			while(next instanceof SymbolToken && ['.', '/', ':'].includes(next.value)) {
				exp.path_tokens.push(next);
				pointer.advance();
				next = pointer.get_next();
				if(!(next instanceof WordToken)) {
					break;
				}
				exp.path_tokens.push(next);
				pointer.advance();
				next = pointer.get_next();
			}
			if(next instanceof SymbolToken && next.value == '{') {
				exp.override_properties = new Map()
				pointer.advance();
				next = pointer.get_next();
				while(next && !(next instanceof SymbolToken && next.value == '}')) {
					while(next instanceof NewlineToken) {
						pointer.advance();
						next = pointer.get_next();
					}
					if(exp.override_properties.size) {
						if(!(next instanceof SymbolToken && next.value == ';')) {
							throw new Error('Expected ; at ' + next.format_pos() + ', got ' + next);
						}
						pointer.advance();
						next = pointer.get_next();
						while(next instanceof NewlineToken) {
							pointer.advance();
							next = pointer.get_next();
						}
					}
					if(!(next instanceof SymbolToken && (next.value == ";" || next.value == "}"))) { // allow blank entries
						if(!(next instanceof WordToken)) throw new Error('Expected word at ' + next.format_pos() + ', got ' + next);
						let prop_name = next.value;
						pointer.advance();
						next = pointer.get_next();
						if(!(next instanceof SymbolToken && next.value == "=")) throw new Error('Expected = at ' + next.format_pos() + ', got ' + next);
						pointer.advance();
						let prop_value = Parser.parse_expression(pointer);
						next = pointer.get_next();
						exp.override_properties.set(prop_name, prop_value);
					}
					while(next instanceof NewlineToken) {
						pointer.advance();
						next = pointer.get_next();
					}
				}
				pointer.advance();
				next = pointer.get_next();
			}
		} else if(next instanceof SymbolToken && ['~', '!', '-', '++', '--'].includes(next.value)) {
			exp = new UnaryPrefixNode(next, Parser.parse_primary(pointer));
		} else if(next instanceof NumberToken) {
			exp = new ConstantNode(next)
		} else if(next instanceof SymbolToken && next.value == '(') {
			while(pointer.get_next() instanceof NewlineToken) pointer.advance(true);
			exp = Parser.parse_expression(pointer);
			while((next = pointer.get_next()) instanceof NewlineToken) pointer.advance(true);
			next = pointer.get_next();
			if(!(next instanceof SymbolToken) || next.value != ')') {
				throw new Error('Expected ) at ' + next.format_pos() + ', got ' + next);
			}
			pointer.advance();
		} else if(next instanceof WordToken && next.value == "new") {
			let new_word = next;
			next = pointer.get_next();
			let new_type = null;
			if((next instanceof SymbolToken && (next.value == "/" || next.value == "." || next.value == ":")) || next instanceof WordToken) {
				new_type = Parser.parse_expression(pointer);
				next = pointer.get_next();
			}
			if(next instanceof SymbolToken && next.value == "(") {
				exp = this.parse_proccall(pointer, new_word, new_type);
			} else {
				exp = new NewNode([], [], new_type)
			}
		} else if(next instanceof WordToken) {
			let open_paren = pointer.get_next();
			if(!ignore_proc_calls && open_paren instanceof SymbolToken && open_paren.value == "(") {
				let is_call = next.value == "call";
				exp = this.parse_proccall(pointer, next);
				if(is_call) {
					exp = this.parse_proccall(pointer, "__call__", exp);
				}
			} else {
				exp = new VarAccessNode(next);
			}
		} else if(next instanceof StringToken) {
			if(next.is_file) {
				exp = new FileNode(next);
			} else {
				let new_parts = [];
				for(let part of next.value) {
					if(part instanceof Array) {
						new_parts.push(Parser.parse_expression(new TokenPointer(part)));
					} else {
						new_parts.push(part);
					}
				}
				exp = new StringNode(new_parts);
			}
		} else {
			throw new Error('Unexpected ' + next + ' at ' + next.format_pos());
		}
		next = pointer.get_next();
		while(next instanceof SymbolToken && (!next.whitespace_flag || ['--', '++', '['].includes(next.value))	 && ['--', '++', '[', '.', ':', '?.', '?:'].includes(next.value)) {
			pointer.advance();
			if(next.value == '--' || next.value == '++') {
				exp = new UnaryPostfixNode(next, exp);
			} else if(next.value == '[') {
				let index_exp = Parser.parse_expression(pointer);
				next = pointer.get_next();
				if(!(next instanceof SymbolToken) || next.value != ']') {
					throw new Error('Expected ] at ' + next.format_pos() + ', got ' + next);
				}
				pointer.advance();
				exp = new ListAccessNode(exp, index_exp);
			} else {
				let dot_name = pointer.get_next();
				pointer.advance();
				let open_paren = pointer.get_next();
				if(!ignore_proc_calls && open_paren instanceof SymbolToken && open_paren.value == "(") {
					exp = this.parse_proccall(pointer, dot_name, exp, next);
				} else {
					exp = new VarAccessNode(dot_name, exp, next);
				}
			}
			next = pointer.get_next();
		}
		return exp;
	}

	static parse_proccall(pointer, identifier, dot_object, dot_operator) {
		pointer.advance();
		let args = [];
		let arg_names = [];
		while(pointer.get_next(true) instanceof NewlineToken) pointer.advance(true);
		let lookahead = pointer.get_next(false);
		let prev_is_comma = false;
		while(lookahead && !(lookahead instanceof SymbolToken && lookahead.value == ")")) {
			if(lookahead instanceof SymbolToken && lookahead.value == ",") {
				if(prev_is_comma) {
					// *skip*
					args.push(undefined);
					arg_names.push(undefined);
				}
				prev_is_comma = true;
				pointer.advance(false);
				while(pointer.get_next(true) instanceof NewlineToken) pointer.advance(true);
				lookahead = pointer.get_next(false);
			} else if(args.length == 0 || prev_is_comma) {
				prev_is_comma = false;
				let pointer_copy = pointer.clone();
				pointer_copy.advance(false);
				let equal = pointer_copy.get_next();
				if((lookahead instanceof WordToken || lookahead instanceof StringToken) && equal instanceof SymbolToken && equal.value == "=") {
					arg_names.push((lookahead instanceof StringToken) ? lookahead.value[0] : lookahead.value);
					pointer.advance(false);
					pointer.advance(true);
				} else {
					arg_names.push(undefined);
				}
				args.push(Parser.parse_expression(pointer));
				lookahead = pointer.get_next(false);
			} else {
				throw new Error(`Expected , or ) at ${lookahead.format_pos()}`);
			}
		}

		if(!(lookahead instanceof SymbolToken && lookahead.value == ")")) {
			throw new Error(`Expected ) at ${(lookahead || pointer.get_current()).format_pos()}`);
		}
		pointer.advance(false);
		if(identifier.value == "new") {
			return new NewNode(args, arg_names, dot_object)
		}
		return new ProcCallNode(identifier, args, arg_names, dot_object, dot_operator);
	}

	finalize_objects() {
		console.log("Evaluating expressions...");
		for(let type of this.types.values()) {
			for(let varname of type.vars.keys()) {
				type.eval_var(this, varname);
			}
		}
		console.log("Finalizing parent types...");
		for(let type of this.types.values()) {
			this.finalize_parent_type(type);
		}
		for(let type of this.types.values()) {
			type.subtypes.sort();
		}
	}

	finalize_parent_type(type) {
		if(!type.parent) {
			let parent_type = type.get_var("parent_type");
			if(parent_type instanceof ByondTypepath) {
				if(!this.types.has(parent_type.path)) {
					// oof we gotta make it
					this.finalize_parent_type(this.get_or_create_type(parent_type.path));
				}
				type.parent = this.types.get(parent_type.path);
				type.parent.subtypes.push(type);
			} else if(parent_type != null) {
				throw new Error(`Parent type ${stringify_byond(parent_type)} is not null or typepath`);
			}
		}
	}

	handle_type_tree_info(path_arr, assignment_value, is_proc = false) {
		let path_arr_length = path_arr.length;
		let var_name = null;
		if(path_arr.includes("var") || assignment_value) {
			var_name = path_arr[path_arr_length-1];
			path_arr_length--;
		} else if(is_proc) {
			path_arr_length--;
		}
		let relevant_path = [];
		let var_path = [];
		let var_meta = new ByondType.VarMeta();
		let is_new_var = false;
		for(let i = 0; i < path_arr_length; i++) {
			if(path_arr[i])
			if(path_arr[i] == "global" || path_arr[i] == "static") {
				var_meta.is_global = true;
				continue;
			}
			if(path_arr[i] == "tmp") {
				var_meta.is_tmp = true;
				continue;
			}
			if(path_arr[i] == "var") {
				is_new_var = true;
				continue;
			}
			if(is_new_var) {
				var_path.push(path_arr[i]);
				continue;
			}
			if(path_arr[i] == "proc" || path_arr[i] == "verb") break;
			relevant_path.push(path_arr[i]);
		}
		var_meta.type = "/" + var_path.join("/");
		let type = this.get_or_create_type("/" + relevant_path.join("/"));
		if(is_new_var) {
			type.set_var_meta(var_name, var_meta);
		}
		if(var_name) {
			type.set_var(var_name, assignment_value);
		}
		return type;
	}

	get_or_create_type(path) {
		if(this.types.has(path))
			return this.types.get(path);
		
		let type = new ByondType(path);
		let parent_path = /^([\/a-z_0-9]+)(?:\/[a-z_0-9]+)$/i.exec(path);
		if(parent_path) parent_path = parent_path[1]
		else parent_path = "/datum";
		if(path != "/datum" && path != "/" && path != "/world")
			type.set_var("parent_type", new ByondTypepath(parent_path));
		this.types.set(path, type);
		return type;
	}

	async eval_text(text) {
		return Parser.parse_expression(new TokenPointer(await this.preprocess(lexer("anon", text)))).evaluate_constant(this);
	}
	static eval_text(text) {
		return Parser.parse_expression(new TokenPointer(lexer("anon", text))).evaluate_constant();
	}
}

class TokenPointer {
	constructor(tokens, i = 0, indent = "") {
		this.tokens = tokens;
		this.index = i;
		this.indentation = indent;
	}
	get_current() {
		return this.tokens[this.index-1];
	}
	get_next(include_newline = true, include_comments = false) {
		for(let i = this.index; i < this.tokens.length; i++) {
			let token = this.tokens[i];
			if(token instanceof NewlineToken && !include_newline)
				continue;
			if(token instanceof CommentToken && !include_comments)
				continue;
			return token;
		}
	}
	advance(include_newline = true, include_comments = false) {
		let skipped_tokens = [];
		for(let i = this.index; i < this.tokens.length; i++) {
			let token = this.tokens[i];
			if(token instanceof NewlineToken) {
				this.indentation = token.value;
			}
			if((token instanceof NewlineToken && !include_newline) || (token instanceof CommentToken && !include_comments)) {
				skipped_tokens.push(token);
				continue;
			}
			this.index = i + 1;
			return skipped_tokens;
		}
	}

	skip_newlines(include_semicolons = true) {
		let lookahead = this.get_next();
		while(lookahead instanceof NewlineToken || (include_semicolons && lookahead instanceof SymbolToken && lookahead.value == ";")) {
			this.advance();
			lookahead = this.get_next();
		}
	}

	clone() {
		return new TokenPointer(this.tokens, this.index, this.indentation)
	}
}

Parser.TokenPointer = TokenPointer;

class Define {
	constructor(name) {
		this.name = name;
		this.value = [];
		this.arguments = null;
		this.variadic = false;
	}
}

module.exports = Parser;
