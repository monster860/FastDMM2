'use strict';
const Heap = require('./heap.js');

/** @typedef {import('../parser/dmm').Tile} Tile */
class AStarTile {
	/**
	 * 
	 * @param {Tile} tile 
	 * @param {number} h 
	 */
	constructor(tile, h) {
		this.tile = tile;
		this.g_score = Infinity;
		this.h_score = h;
		this.previous_node = null;
	}

	get f_score() {
		return this.g_score + this.h_score;
	}
}

class AStar {
	/**
	 * 
	 * @param {import("../parser.dmm")} dmm 
	 */
	constructor(dmm) {
		this.dmm = dmm;
		this.cost_limit = Infinity;
	}

	/**
	 * 
	 * @param  {...Tile} initial 
	 */
	run(...initial) {
		if(!initial) return;
		let open_nodes = new Heap((a,b) => {return a.f_score - b.f_score;});
		/** @type{Map<Tile, AStarTile>} */
		let nodes = new Map();
		if(initial && initial.length && (typeof initial[0] == "number"))
			initial = [initial];
		for(let tile of initial) {
			if(nodes.has(tile)) continue;
			let node = new AStarTile(tile, this.calculate_heuristic(tile));
			node.g_score = 0;
			nodes.set(tile, node);
			open_nodes.insert(node);
		}
		let found_node = null;
		while(!open_nodes.is_empty()) {
			let explored_node = open_nodes.pop();
			let adj = this.get_adjacent(explored_node);
			for(let [tile,score] of adj) {
				if(score <= 0) throw new Error("negative g-cost");
				if(score + explored_node.g_score > this.cost_limit) continue;
				let node = nodes.get(tile);
				if(node) {
					if(node.g_score > explored_node.g_score+score) {
						node.g_score = explored_node.g_score+score;
						node.previous_node = explored_node;
						open_nodes.resort(node);
					}
				} else {
					node = new AStarTile(tile, this.calculate_heuristic(tile));
					node.g_score = explored_node.g_score+score;
					node.previous_node = explored_node;
					nodes.set(tile, node);
					open_nodes.insert(node);
					if(this.check_complete(node)) {
						found_node = node;
						break;
					}
				}
			}
			if(found_node) break;
		}
		if(found_node) {
			let path = [];
			path.total_cost = found_node.g_score;
			while(found_node) {
				path.push(found_node.tile);
				found_node = found_node.previous_node;
			}
			path.reverse();
			return path;
		}
	}

	/**
	 * 
	 * @param {Tile} tile 
	 */
	check_complete(tile) {
		return false;
	}

	/**
	 * 
	 * @param {AStarTile} tile
	 * @returns {[Tile,number]}
	 */
	get_adjacent(tile) {
		return [];
	}

	/**
	 * 
	 * @param {Tile} tile 
	 */
	calculate_heuristic(tile) {
		return 0;
	}
}

module.exports = AStar;
