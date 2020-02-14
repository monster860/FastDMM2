'use strict';
const AStar = require('./astar.js');

class PipeAStar extends AStar{
	/**
	 * 
	 * @param {import("../parser/dmm")} dmm 
	 * @param {import("./pipe_manager")} pipe_manager 
	 * @param {string} pipe_group 
	 * @param {Array<string>} pipe_interference_group 
	 * @param {import("../parser/dmm").Tile} target_tile 
	 */
	constructor(dmm, pipe_manager, pipe_group, pipe_interference_group, target_tile) {
		super(dmm);
		this.pipe_group = pipe_group;
		this.pipe_interference_group = pipe_interference_group;
		this.pipe_manager = pipe_manager;
		this.target_tile = target_tile;
		this.cost_limit = 10000;
		this.is_diagonal = this.pipe_manager.is_pipe_group_diagonal(this.pipe_group);
	}

	check_complete(tile) {
		return tile.tile == this.target_tile;
	}

	get_adjacent(tile) {
		let adj = [];
		let curr_dir = tile.previous_node ? tile.previous_node.tile.get_dir(tile.tile) : 0;
		for(let dir of (this.is_diagonal ? [1,2,4,8,5,6,9,10] : [1,2,4,8])) {
			if(this.pipe_manager.check_pipe_interference(this.pipe_group, this.pipe_interference_group, tile.tile, dir, true)) continue;
			let is_pipe_diagonal = (dir & 3) && (dir & 12);
			let cost = 0;
			if(curr_dir && curr_dir != dir) cost++;
			let step_tile = tile.tile.get_step(dir);
			for(let inst of step_tile) {
				cost += this.pipe_manager.get_astar_cost(inst);
			}
			if(is_pipe_diagonal) cost *= 1.5; 
			adj.push([step_tile, cost]);
		}
		return adj;
	}

	calculate_heuristic(tile) {
		if(!this.is_diagonal) return Math.abs(tile.x-this.target_tile.x) + Math.abs(tile.y-this.target_tile.y) + Math.abs(tile.z-this.target_tile.z);
		return Math.sqrt((tile.x - this.target_tile.x) ** 2 + (tile.y - this.target_tile.y) ** 2 + (tile.z - this.target_tile.z) ** 2);
	}
}

module.exports = PipeAStar;