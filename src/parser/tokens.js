class Token {
	constructor(file, value, ws_flag = false) {
		this.file = file.filename || file.file;
		this.line = file.row || file.line;
		this.column = file.col || file.column;
		this.value = value;
		this.whitespace_flag = ws_flag;
	}

	format_pos() {
		return `(${this.file}:${this.line}:${this.column})`;
	}

	toString() {
		return this.constructor.name + " (" + this.value + ")";
	}

	raw() {
		return ""+this.value;
	}

	/** @returns {this} */
	copy(file_source = this) {
		let new_token = Object.assign(new this.constructor(file_source, this.value, this.whitespace_flag), this);
		
		new_token.file = file_source.filename || file_source.file;
		new_token.line = file_source.row || file_source.line;
		new_token.column = file_source.col || file_source.column;
		return new_token;
	}
}

class WordToken extends Token {}
class RawToken extends Token {}
class CommentToken extends Token {}
class SymbolToken extends Token {}
class NumberToken extends Token {}
class StringToken extends Token {
	constructor(file, value, ws_flag = false, multiline = false, uses_text_macros = false, is_file = false) {
		super(file, value, ws_flag);
		this.multiline = multiline;
		this.uses_text_macros = uses_text_macros;
		this.is_file = is_file;
	}
}
class NewlineToken extends Token {}
class IncludeToken extends Token {}

module.exports = {WordToken, CommentToken, SymbolToken, NumberToken, StringToken, NewlineToken, IncludeToken, RawToken};
