'use strict';
const {WordToken, CommentToken, SymbolToken, NumberToken, StringToken, NewlineToken, RawToken} = require('./tokens.js');
const {text_macros} = require('./static_values.js');

const symbols = [
	[
		"!", "#", "%", "&", "(", ")", "*", "+", ",", "-", ".", "/", ":", ";",
		"<", "=", ">", "?", "[", "]", "^", "{", "|", "}", "~"
	],
	[
		"!=", "##", "%=", "&&", "**", "*=", "++", "+=", "--", "-=", "..", "/=", "<<", "<=", "<>", "==", ">=", ">>", "?.", "?:", "^=", "|=", "||", "~!", "~="
	],
	[
		"...", ">>=", "<<="
	]
];

const allowed_name_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

function lexer(file, end_on = null) {
	let tokens = [];
	let bracket_stack = [];
	let whitespace_flag = false;
	while(file.pointer < file.text.length) {
		if(file.text[file.pointer] == end_on && !bracket_stack.length)
			break;
		if(" \t".includes(file.text[file.pointer])) {
			file.advance_one();
			whitespace_flag = true;
			continue;
		}
		if(file.text.substring(file.pointer, file.pointer + 2) == "//") {
			let comment_start_pointer = file.pointer;
			let comment = new CommentToken(file, null, whitespace_flag);
			while(file.text[file.pointer] != "\n" || file.text[file.pointer-1] == "\\") {
				if(!file.advance_one()) break;
			}
			comment.value = file.text.substring(comment_start_pointer, file.pointer);
			tokens.push(comment);
			whitespace_flag = true;
			continue;
		}
		if(file.text.substring(file.pointer, file.pointer + 2) == "/*") {
			let comment_start_pointer = file.pointer;
			let comment = new CommentToken(file, null, whitespace_flag);
			file.advance(2);
			let nested_comment_depth = 0; // hey did you know comments can be nested? neither did I. Thanks, goonstation, for having such shitty code.
			while(file.text.substring(file.pointer, file.pointer + 2) != "*/" || nested_comment_depth > 0) {
				if(file.text.substring(file.pointer, file.pointer + 2) == "/*") nested_comment_depth++;
				if(file.text.substring(file.pointer, file.pointer + 2) == "*/") nested_comment_depth--;
				if(!file.advance_one()) break;
			}
			file.advance(2);
			comment.value = file.text.substring(comment_start_pointer, file.pointer);
			tokens.push(comment);
			whitespace_flag = true;
			continue;
		}
		if(`"'`.includes(file.text[file.pointer]) || (file.text[file.pointer] == `{` && file.text[file.pointer+1] == `"`)) {
			let end_char = file.text[file.pointer] == "{" ? `"}` : file.text[file.pointer];
			let text_list = [];
			let text_value = "";
			let token = new StringToken(file, null, whitespace_flag, end_char.length == 2);
			token.is_file = (end_char == "'");
			let consider_escapes = true;
			if(
				tokens[tokens.length-1] instanceof WordToken
				&& tokens[tokens.length-1].value == "include"
				&& tokens[tokens.length-2] instanceof SymbolToken
				&& tokens[tokens.length-2].value == "#"
			) {
				consider_escapes = false;
			}
			file.advance(end_char.length);
			while(file.text.substring(file.pointer,file.pointer+end_char.length) != end_char && file.text[file.pointer]) {
				if(consider_escapes && file.text[file.pointer] == "\\") {
					file.advance_one();
					let escaped = file.text[file.pointer];
					if(escaped == "<") {
						text_value += "&lt;";
					} else if(escaped == ">") {
						text_value += "&gt;";
					} else if(escaped == "n") {
						text_value += "\n";
					} else if(escaped == "r") {
						text_value += "\r";
					} else {
						let found_text_macro = false;
						for(let [character, name] of text_macros) {
							if(file.text.substring(file.pointer, file.pointer + name.length) == name) {
								found_text_macro = true;
								text_value += character;
								file.advance(name.length);
								break;
							}
						}
						if(found_text_macro && file.text[file.pointer] == ' ') {
							file.advance_one();
						}
						if(found_text_macro) {
							continue;
						} else {
							text_value += escaped;
						}
					}
					file.advance_one();
				} else if(consider_escapes && file.text[file.pointer] == "[") {
					file.advance_one();
					text_list.push(text_value);
					text_value = "";
					text_list.push(lexer(file, "]"));
					file.advance_one();
				} else {
					text_value += file.text[file.pointer];
					file.advance_one();
				}
			}
			file.advance(end_char.length);
			text_list.push(text_value);
			token.value = text_list;
			tokens.push(token);
			whitespace_flag = false;
			continue;
		}
		else if(file.text[file.pointer] == "@") {
			let token = new StringToken(file, null, whitespace_flag);
			file.advance_one();
			let end_char;
			if(file.text.substring(file.pointer, file.pointer+2) == '{"') {
				end_char = '"}';
				file.advance(2);
			} else {
				end_char = file.text[file.pointer];
				file.advance_one();
			}
			let text = "";
			while(file.text.substring(file.pointer, file.pointer+end_char.length) != end_char && file.text[file.pointer]) {
				text += file.text[file.pointer];
				file.advance_one();
			}
			file.advance(end_char.length);
			token.value = [text];
			tokens.push(token);
			whitespace_flag = false;
			continue;
		}
		let char_code = file.text.charCodeAt(file.pointer);
		if(char_code < 128) {
			let symbol_cache_entry = symbol_cache[char_code];
			if(symbol_cache_entry) {
				let found_symbol = false;
				for(let i = symbols.length - 1; i >= 0; i--) {
					let section = file.text.substring(file.pointer, file.pointer + i + 1)
					if((symbol_cache_entry & (1 << i)) && (i == 0 || symbols[i].includes(section))) {
						found_symbol = true;
						tokens.push(new SymbolToken(file, section, whitespace_flag));
						whitespace_flag = false;
						file.advance(i+1);
						if(i == 0 && end_on) {
							if(section == "(") bracket_stack.push(")");
							else if(section == "[") bracket_stack.push("]");
							else if(section == "{") bracket_stack.push("}");
							else if(section == bracket_stack[bracket_stack.length - 1]) bracket_stack.length--;
						}
						break;
					}
				}
				if(found_symbol)
					continue;
			}
		}
		if(file.text.substring(file.pointer, file.pointer + 6) == "1.#INF") {
			tokens.push(new NumberToken(file, Infinity, whitespace_flag));
			whitespace_flag = false;
			file.advance(6);
			continue;
		}
		if(file.text[file.pointer] == "\\" && file.text[file.pointer+1] == "\n") {
			file.advance(2);
			continue;
		}
		if(file.text[file.pointer] == "\n") {
			file.advance_one();
			let newline_token = new NewlineToken(file, null, whitespace_flag);
			let indentation = "";
			while(" \t".includes(file.text[file.pointer])) {
				// after a bit of testing, I have determined that a single tab and a singlke space are the same thing.
				indentation += "\t";
				file.advance_one();
			}
			newline_token.value = indentation
			tokens.push(newline_token);
			whitespace_flag = true;
			continue;
		}
		if("0123456789".includes(file.text[file.pointer])) {
			let number_start = file.pointer;
			let number_token = new NumberToken(file, null, whitespace_flag);
			if(file.text[file.pointer] == "0" && file.text[file.pointer+1] == "x") {
				file.advance(2);
				while("0123456789abcdefABCDEF".includes(file.text[file.pointer])) file.advance_one();
			} else {
				while(file.text[file.pointer]) {
					if("0123456789\.".includes(file.text[file.pointer])) {
						file.advance_one();
						continue;
					}
					if("eE".includes(file.text[file.pointer])) {
						file.advance_one();
						if("+-".includes(file.text[file.pointer])) {
							file.advance_one();
						}
						continue;
					}
					break;
				}
			}
			number_token.value = +file.text.substring(number_start, file.pointer);
			tokens.push(number_token);
			whitespace_flag = false;
			continue;
		}
		if(char_code < 128 && allowed_name_cache[char_code]) {
			let word_start = file.pointer;
			let word = new WordToken(file, null, whitespace_flag);
			while(char_code < 128 && allowed_name_cache[char_code]) {
				file.advance_one();
				char_code = file.text.charCodeAt(file.pointer);
			}
			word.value = file.text.substring(word_start, file.pointer);
			tokens.push(word);
			if(
				(word.value == "error" || word.value == "warn") &&
				tokens[tokens.length - 2] instanceof SymbolToken &&
				tokens[tokens.length - 2].value == "#"
			) {
				while(" \t".includes(file.text[file.pointer])) {
					file.advance_one();
				}
				let raw = new RawToken(file, "", false);
				while(file.text[file.pointer] && file.text[file.pointer] != "\n") {
					raw.value += file.text[file.pointer];
					file.advance_one();
				}
				tokens.push(raw);
			}
			whitespace_flag = false;
			continue;
		}
		console.warn("Unrecognized character " + JSON.stringify(file.text[file.pointer]) + " at (" + file.filename + ":" + file.row + ":" + file.col + ")");
		file.advance_one();
	}
	return tokens;
}

class LineTraverser {
	constructor(filename, text) {
		this.filename = filename;
		text = text.replace(/\r\n|\r|\n/g, "\n"); // windows line endings bad
		this.text = text;
		this.pointer = 0;
		this.row = 1;
		this.col = 1;
	}
	advance_one() {
		if(this.text[this.pointer] == "\n") {
			this.row++;
			this.col = 1;
		} else {
			this.col++;
		}
		this.pointer++;
		return (this.pointer < this.text.length);
	}
	advance(amount) {
		for(let i = 0; i < amount; i++) {
			this.advance_one();
		}
		return this.pointer < this.text.length;
	}
	get rest() {
		return this.text.substring(this.pointer);
	}
}

let lexing_perf = [];
console.log(lexing_perf);

module.exports = function(filename, text) {
	if(typeof text != "string") {
		console.error(`Got non-string text for ${filename}`);
		console.error(text);
	}
	let file = new LineTraverser(filename, text);
	try {
		let s = performance.now();
		
		let res = lexer(file);
		
		let e = performance.now();
		lexing_perf.push([e - s, filename]);
		
		return res;
	} catch(e) {
		console.error(`In (${file.filename}:${file.row}:${file.col}):`);
		throw e;
	}
};

// these caches shave an entire second off of load time.
const symbol_cache = new Uint8Array(128);
const allowed_name_cache = new Uint8Array(128);
for(let i = 0; i < allowed_name_chars.length; i++) {
	allowed_name_cache[allowed_name_chars.charCodeAt(i)] = 1;
}
for(let i = 0; i < symbols.length; i++) {
	let section = symbols[i];
	for(let symbol of section) {
		symbol_cache[symbol.charCodeAt(0)] |= (1 << i);
	}
}
