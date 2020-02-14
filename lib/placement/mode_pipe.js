'use strict';
const PlacementModeDefault = require('./mode_default.js');
const PlacementHandler = require('./_handler.js');
const {Instance} = require('../parser/dmm.js');
const RenderInstance = require('../render_instance.js')
const PipeAStar = require('../astar/pipe_astar.js');

class HandlerPipe extends PlacementHandler {
	mousedown(tile) {
		if(tile.dmm != this.dmm) return;
		this.tiles = [tile];
		this.preview_instances = null;
		this.pipe_group = this.editor.pipe_manager.get_pipe_group(new Instance(this.editor.parser, this.type));
		this.mousemove(tile);
	}
	mousemove(tile) {
		if(tile.dmm != this.dmm) return;
		let last_tile = this.tiles[this.tiles.length-1];
		let allow_diagonal = this.editor.pipe_manager.is_pipe_group_diagonal(this.pipe_group);
		while(last_tile != tile) {
			let dir = last_tile.get_dir(tile, !allow_diagonal);
			if(!dir) break;
			last_tile = last_tile.get_step(dir);
			if(!last_tile) break;
			this.preview_instances = null;
			if(last_tile == this.tiles[this.tiles.length - 2]) { // we're going back
				this.tiles.pop();
			} else {
				this.tiles.push(last_tile);
			}
		}
	}
	mouseup() {
		for(let i = 0; i < this.tiles.length; i++) {
			let tile = this.tiles[i];
			let from_dir = tile.get_dir(this.tiles[i-1]);
			let to_dir = tile.get_dir(this.tiles[i+1]);
			let instance = this.editor.pipe_manager.place_group_instance(this.pipe_group, tile, from_dir, to_dir);
			if(instance) {
				tile.place(instance);
			}
		}
		this.dmm.push_undo();
	}
	visualize(instances) {
		if(!this.preview_instances) {
			this.preview_instances = [];
			for(let i = 0; i < this.tiles.length; i++) {
				let tile = this.tiles[i];
				let from_dir = tile.get_dir(this.tiles[i-1]);
				let to_dir = tile.get_dir(this.tiles[i+1]);
				if(!from_dir && to_dir) {
					from_dir = this.editor.pipe_manager.get_group_dirs(this.pipe_group, tile)[0];
				} else if(from_dir && !to_dir) {
					to_dir = this.editor.pipe_manager.get_group_dirs(this.pipe_group, tile)[0];
				}
				let preview_instance = this.editor.pipe_manager.make_group_instance(this.pipe_group, from_dir, to_dir);
				if(preview_instance) this.preview_instances.push([tile, preview_instance]);
			}
		}
		for(let [tile, instance] of this.preview_instances) {
			instances.push(new RenderInstance(instance.get_appearance(), tile.x, tile.y, tile.z));
		}
	}
}

class HandlerPipeAStar extends PlacementHandler {
	mousedown(tile) {
		if(tile.dmm != this.dmm) return;
		this.start_tile = tile;
		this.tiles = [];
		this.preview_instances = null;
		this.pipe_group = this.editor.pipe_manager.get_pipe_group(new Instance(this.editor.parser, this.type));
		this.pipe_interference_group = this.editor.pipe_manager.get_pipe_interference_groups(new Instance(this.editor.parser, this.type));
	}
	mousemove(tile, did_tile_change) {
		if(tile.dmm != this.dmm) return;
		if(!did_tile_change) return;
		if(tile == this.start_tile) {
			this.tiles = [];
			return;
		}
		let astar = new PipeAStar(this.dmm, this.editor.pipe_manager, this.pipe_group, this.pipe_interference_group, this.start_tile);
		astar.cost_limit = 10000;
		this.tiles = astar.run(tile) || [];
		this.preview_instances = null;
	}
	mouseup() {
		for(let i = 0; i < this.tiles.length; i++) {
			let tile = this.tiles[i];
			let from_dir = tile.get_dir(this.tiles[i-1]);
			let to_dir = tile.get_dir(this.tiles[i+1]);
			let instance = this.editor.pipe_manager.place_group_instance(this.pipe_group, tile, from_dir, to_dir);
			if(instance) {
				tile.place(instance);
			}
		}
		this.dmm.push_undo();
	}
	visualize(instances) {
		if(!this.preview_instances) {
			this.preview_instances = [];
			for(let i = 0; i < this.tiles.length; i++) {
				let tile = this.tiles[i];
				let from_dir = tile.get_dir(this.tiles[i-1]);
				let to_dir = tile.get_dir(this.tiles[i+1]);
				if(!from_dir && to_dir) {
					from_dir = this.editor.pipe_manager.get_group_dirs(this.pipe_group, tile)[0];
				} else if(from_dir && !to_dir) {
					to_dir = this.editor.pipe_manager.get_group_dirs(this.pipe_group, tile)[0];
				}
				let preview_instance = this.editor.pipe_manager.make_group_instance(this.pipe_group, from_dir, to_dir);
				if(preview_instance) this.preview_instances.push([tile, preview_instance]);
			}
		}
		for(let [tile, instance] of this.preview_instances) {
			instances.push(new RenderInstance(instance.get_appearance(), tile.x, tile.y, tile.z));
		}
	}
}

class PlacementModePipe extends PlacementModeDefault {
	get_handler(e, tile, type) {
		if(!this.is_pixel && type && !e.ctrlKey) {
			if(this.editor.pipe_manager.get_pipe_group(new Instance(this.editor.parser, type))) {
				if(e.shiftKey) {
					return new HandlerPipe(this.editor, tile, type);
				} else {
					return new HandlerPipeAStar(this.editor, tile, type);
				}
			}
		}
		return super.get_handler(e, tile, type);
	}
}

PlacementModePipe.HandlerPipe = HandlerPipe;

PlacementModePipe.fa_icon = "fa-wave-square";
PlacementModePipe.description = "Pipe Placement";
PlacementModePipe.usage = `Click/Drag - Place Pipes With AStar
Shift Click/Drag - Place Pipes Without AStar
Ctrl Shift Click - Make Active Object/View Varialbes
Ctrl Shift Middle Click - Delete Object`;
PlacementModePipe.uses_instance_panel = true;

module.exports = PlacementModePipe;