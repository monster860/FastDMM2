<!--
	Anything that is commented out is unimplemented, but planned.
-->

## Table of Contents

- [FASTDMM_PROP](#FASTDMM_PROP)
	- [dir_amount](#dir_amount)
	- [instance_var_whitelist](#instance_var_whitelist)
	<!-- [instances](#instances)-->
	- [pinned_vars](#pinned_vars)
	- [pipe_group](#pipe_group)
	- [pipe_interference_group](#pipe_interference_group)
	- [pipe_type](#pipe_type)
	- [set_instance_vars()](#set_instance_vars)

## FASTDMM_PROP

Using the FASTDMM_PROP macro, FastDMM2-sepecific properties and macros can be specified in the code. They are different from regular proc variables in the sense that their values are not evaluated until used - for example, [`set_instance_vars`](#set_instance_vars), which allows you to set the variables of an object instance when the instance is placed or modified, allows you to use variables from the object to dynamically set the value.

To use FASTDMM_PROP, somewhere in the codebase there needs to be a #define statement to remove FASTDMM_PROP so that a regular BYOND compiler does not error on it:

```byond
#ifndef FASTDMM
#define FASTDMM_PROP(props...)
#endif
```

To use properties and macros, use the following syntax:

```byond
/obj
	FASTDMM_PROP(\
		pinned_vars = list("dir"), /* This is a property*/\
		set_instance_vars( /*This is a macro*/\
			dir = (dir == SOUTH ? INSTANCE_VAR_DEFAULT : dir)\
		)\
	)
```

Note the \ at the end of each line - the BYOND compiler error if they are not included.

The difference between a property and a macro has to do with object inheritance - when a property is inherited, anything previously specified in a parent property is wiped and the new one replaces the old one. When a macro is inherited, instead whatever is set could possibly be merged. In addition, some macros can be used multiple times on one type.

The following built-in BYOND procs can be used:
- `abs`
- `arccos`
- `arcsin`
- `arctan`
- `ascii2text`
- `ckey`
- `ckeyEx`
- `clamp`
- `copytext`
- `cos`
- `length`
- `list`
- `matrix`
- `newlist`
- `text2num`
- `rgb`
- `round`
- `sin`
- `sqrt`
- `tan`
- `text2ascii`

Here is a list of properties and macros:

### dir_amount

Sets the number of dirs the object can have. Can be either `0`, `1`, `4`, or `8`. The default is `0` which looks at the `icon` and `icon_state` and uses the metadata in the .dmi file to figure out the number of dirs available.

### instance_var_whitelist

Prevents modifications to any vars except the specified ones. Any existing modifications to these vars are reverted.

Example:
```byond
/obj/structure/cable
	FASTDMM_PROP(\
		instance_var_whitelist = list("icon_state")\
	)
```

<!--### instances

Instead of getting a list of instances from loaded map files, generate instances. Provide a list of the `instance()` macro.

Properties on `instance()` macro are:
- `var_name` (required) - The var name to vary.
- `values` (require) - The values the var_name can take on. May include `INSTANCE_VAR_DEFAULT`.
- `label` - Puts the value of the variable.
- `put_label_before` - causes the label to be put before the icon instead of after if true.
- `orientation` - Either "horizontal" or "vertical" - defaults to vertical.
- `label_prefix` - A string to prefix before the label.

```byond
/obj/effect/turf_decal/plaque
	FASTDMM_PROP(\
		instances = list(\
			var_name = "icon_state",\
			values = list("L1", "L3", "L5", "L7", "L2", "L4", "L6", "L8", "L9", "L11", "L13", "L7", "L10", "L12", "L14", "L18"),\
			orientation = "horizontal",\
			wrap = 4,\
			label = TRUE\
		)\
	)
```

-->### pinned_vars

Causes the listed variables to be displayed at the top of the variable list when using View Variables. Use for commonly-modified variables that get edited often.

Example:
```byond
/obj/machinery/door/airlock
	FASTDMM_PROP(\
		pinned_vars = list("req_access_txt", "req_one_access_txt", "name")\
	)
```

### pipe_group

Defines what kinds of pipes should connect to each other.

```byond
/obj/machinery/atmospherics/pipe/simple
	FASTDMM_PROP(\
    	pipe_group = "atmos-[piping_layer]-[pipe_color]",\
		pipe_interference_group = "atmos-[piping_layer]",\
		pipe_type = PIPE_TYPE_SIMPLE\
    )
```

### pipe_interference_group

Defines what kinds of pipes interfere with each other. Can be a list. Note that this does not share names at all with [`pipe_group`](#pipe_group). If two pipes have matching `pipe_interference_group` but not matching `pipe_group` they will be considered interfering, and the astar algorithm will not allow that path.

```byond
/obj/machinery/atmospherics/pipe/simple
	FASTDMM_PROP(\
		pipe_interference_group = "atmos-[piping_layer]"\
	)
/obj/machinery/atmospherics/pipe/layer_manifold
	FASTDMM_PROP(\
		pipe_interference_group = list("atmos-1", "atmos-2", "atmos-3")\
	)
```
### pipe_type

Defines how the pipe connects to other pipes. The following symbols are supported:

- `PIPE_TYPE_SIMPLE` - If `dir` is cardinal, the pipe connects in that direction, and in the opposite direction. Otherwise, it points to the two dirs that make up `dir` - for example if `dir` is `NORTHWEST` it will connect to `NORTH` and `WEST`
- `PIPE_TYPE_STRAIGHT` - The pipe connects to `dir`, and in the opposite direction.
- `PIPE_TYPE_MANIFOLD` - The pipe connects to all dirs except `dir`
- `PIPE_TYPE_MANIFOLD4W` - The pipe connects to all dirs.
- `PIPE_TYPE_NODE` - The pipe connects only to `dir`
- `PIPE_TYPE_CABLE` - Uses the `icon_state`, in the format `dir1-dir2` to determine which dirs the pipe connects to, and does manifolds by putting multiple on the same tile.
- `PIPE_TYPE_AUTO` - The pipe connects to all dirs, and consists only of this type.

### pipe_astar_cost

Defines the cost to pass pipes through this tile. Defaults to `1` for turfs and `0` for everything else. Used to encourage taking other paths.

```byond
/turf/closed/wall
	FASTDMM_PROP(\
		pipe_astar_cost = 10\
	)
```

### set_instance_vars()

When a new instance of this is created in the map editor, or when the variables are modified through View Variables (or other tools that affect variables), or on map-load, the variables will be updated according to what is specified in the macro.

The following symbols can be used in this context:
- `INSTANCE_VAR_DEFAULT` - Causes the property to be removed from the instance, causing the default value to be used.
- `INSTANCE_VAR_KEEP` - Keeps the original property if overridden in the instance, with no modification. Similar to using the var, except it leaves the var as default if it's not specified in the instance.

Example:

```byond
/obj/machinery/power/apc
	FASTDMM_PROP(\
		set_instance_vars(\
			pixel_x = dir == EAST ? 24 : (dir == WEST ? -24 : INSTANCE_VAR_DEFAULT),\
			pixel_y = dir == NORTH ? 24 : (dir == SOUTH ? -24 : INSTANCE_VAR_DEFAULT)\
        )\
    )
```
