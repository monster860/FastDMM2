'use strict';
import "../css/main.less"

const Editor = require('./editor.js');
window.addEventListener("DOMContentLoaded", () => {
	window.editor = new Editor();
});

fetch("https://api.github.com", {headers: {"authorization": "token " + localStorage.getItem("gh_token")}}).then((res) => {
	return res.json();
}).then((json) => {
	if(json.message == "Bad credentials") {
		localStorage.removeItem("gh_token");
	}
});

/*const fs = require('fs');
const path = require('path');
const Parser = require('./lib/parser/parser.js');

let parser = new Parser(function(filename) {
	return new Promise((resolve, reject) => {
		fs.readFile(path.join("../Yogstation-TG/", filename), "utf8", (err, data) => {
			if(err) reject(err);
			else resolve(data);
		});
	});
});

parser.parse_file("yogstation.dme").then(v => {
	console.log(v);
	console.log('Press any key to continue.');
	process.stdin.once('data', function () {
		process.exit(0);
	});
}).catch(e => {
	console.error(e);
	console.log('Press any key to continue.');
	process.stdin.once('data', function () {
		process.exit(0);
	});
});
console.log(parser);
*/
