// its a .js file so I can pack it.
module.exports = `
#define EXCEPTION(value) new /exception(value)
#define ASSERT(expression) if(!(expression)) { CRASH("[__FILE__]:[__LINE__]:Assertion Failed: [#X]")}

#define DM_VERSION 513
#define DM_BUILD 1526
#define FASTDMM 1

// eye and sight
#define SEEINVIS 2
#define SEEMOBS 2
#define SEEOBJS 2
#define SEETURFS 2

// gliding
#define NO_STEPS 0
#define FORWARD_STEPS 1
#define SLIDE_STEPS 2
#define SYNC_STEPS 3

// appearance_flags
#define LONG_GLIDE 1
#define RESET_COLOR 2
#define RESET_ALPHA 4
#define RESET_TRANSFORM 8
#define NO_CLIENT_COLOR 16
#define KEEP_TOGETHER 32
#define KEEP_APART 64
#define PLANE_MASTER 128
#define TILE_BOUND 256
#define PIXEL_SCALE 512
#define PASS_MOUSE 1024

#define CONTROL_FREAK_ALL 1
#define CONTROL_FREAK_SKIN 2
#define CONTROL_FREAK_MACROS 4

// icons
#define ICON_ADD 0
#define ICON_SUBTRACT 1
#define ICON_MULTIPLY 2
#define ICON_OVERLAY 3
#define ICON_AND 4
#define ICON_OR 5
#define ICON_UNDERLAY 6

// matrix
#define MATRIX_COPY 0
#define MATRIX_MULTIPLY 1
#define MATRIX_ADD 2
#define MATRIX_SUBTRACT 3
#define MATRIX_INVERT 4
#define MATRIX_ROTATE 5
#define MATRIX_SCALE 6
#define MATRIX_TRANSLATE 7
#define MATRIX_INTERPOLATE 8
#define MATRIX_MODIFY 128

// animation easing
#define LINEAR_EASING 0
#define SINE_EASING 1
#define CIRCULAR_EASING 2
#define CUBIC_EASING 3
#define BOUNCE_EASING 4
#define ELASTIC_EASING 5
#define BACK_EASING 6
#define QUAD_EASING 7
#define EASE_IN 64
#define EASE_OUT 128
#define JUMP_EASING 0123456789

// animation flags
#define ANIMATION_END_NOW 1
#define ANIMATION_LINEAR_TRANSFORM 2
#define ANIMATION_PARALLEL 4
#define ANIMATION_RELATIVE 256

// Database
#define DATABASE_OPEN 0
#define DATABASE_CLOSE 1
#define DATABASE_ERROR_CODE 2
#define DATABASE_ERROR 3
#define DATABASE_QUERY_CLEAR 4
#define DATABASE_QUERY_ADD 5
#define DATABASE_QUERY_EXEC 8
#define DATABASE_QUERY_NEXT 9
#define DATABASE_QUERY_ABORT 10
#define DATABASE_QUERY_RESET 11
#define DATABASE_QUERY_ROWS_AFFECTED 12
#define DATABASE_ROW_COLUMN_NAMES 16
#define DATABASE_ROW_COLUMN_VALUE 17
#define DATABASE_ROW_LIST 18

// alpha mask filter
#define MASK_INVERSE 1
#define MASK_SWAP 2

// rgb filter
#define FILTER_COLOR_RGB 1
#define FILTER_COLOR_HSV 2
#define FILTER_COLOR_HSL 4
#define FILTER_COLOR_HCY 8

// layering
#define FILTER_OVERLAY 1
#define FILTER_UNDERLAY 2

// ray filter
#define FLAG_OVERLAY 1
#define FLAG_UNDERLAY 2

// ripple filter
//#define WAVE_BOUND 2

// wave filter
#define WAVE_SIDEWAYS 1
#define WAVE_BOUND 2

// vis flags
#define VIS_INHERIT_ICON 1
#define VIS_INHERIT_ICON_STATE 2
#define VIS_INHERIT_DIR 4
#define VIS_INHERIT_LAYER 8
#define VIS_INHERIT_PLANE 16
#define VIS_INHERIT_ID 32
#define VIS_UNDERLAY 64
#define VIS_HIDE 128

// directions
var/const
	NORTH = 1
	SOUTH = 2
	EAST = 4
	WEST = 8
	NORTHEAST = 5
	NORTHWEST = 9
	SOUTHEAST = 6
	SOUTHWEST = 10
	UP = 16
	DOWN = 32

// eye and sight
var/const
	BLIND = 1
	SEE_MOBS = 4
	SEE_OBJS = 8
	SEE_TURFS = 16
	SEE_SELF = 32
	SEE_INFRA = 64
	SEE_PIXELS = 256
	SEE_THRU = 512
	SEE_BLACKNESS = 1024

var/const
	MOB_PERSPECTIVE = 0
	EYE_PERSPECTIVE = 1
	EDGE_PERSPECTIVE = 2

// layers
var/const
	FLOAT_LAYER = -1
	AREA_LAYER = 1
	TURF_LAYER = 2
	OBJ_LAYER = 3
	MOB_LAYER = 4
	FLY_LAYER = 5
	EFFECTS_LAYER = 5000
	TOPDOWN_LAYER = 10000
	BACKGROUND_LAYER = 20000
	FLOAT_PLANE = -32767

// map formats
var/const
	TOPDOWN_MAP = 0
	ISOMETRIC_MAP = 1
	SIDE_MAP = 2
	TILED_ICON_MAP = 32768


var/const
	TRUE = 1
	FALSE = 0

var/const
	MALE = "male"
	FEMALE = "female"
	NEUTER = "neuter"
	PLURAL = "plural"

// mouse
var/const
	MOUSE_INACTIVE_POINTER = 0
	MOUSE_ACTIVE_POINTER = 1
	MOUSE_DRAG_POINTER = 3
	MOUSE_DROP_POINTER = 4
	MOUSE_ARROW_POINTER = 5
	MOUSE_CROSSHAIRS_POINTER = 6
	MOUSE_HAND_POINTER = 7

var/const
	MOUSE_LEFT_BUTTON = 1
	MOUSE_RIGHT_BUTTON = 2
	MOUSE_MIDDLE_BUTTON = 4
	MOUSE_CTRL_KEY = 8
	MOUSE_SHIFT_KEY = 16
	MOUSE_ALT_KEY = 32

var/const
	MS_WINDOWS = "MS Windows"
	UNIX = "UNIX"

// sound
var/const
	SOUND_MUTE = 1
	SOUND_PAUSED = 2
	SOUND_STREAM = 4
	SOUND_UPDATE = 16

// blend_mode
var/const
	BLEND_DEFAULT = 0
	BLEND_OVERLAY = 1
	BLEND_ADD = 2
	BLEND_SUBTRACT = 3
	BLEND_MULTIPLY = 4

/datum
/datum/var/const/type
/datum/var/const/parent_type
/datum/var/tag
//datum/var/const/list/vars

/atom
/atom/parent_type = /datum
/atom/var/alpha = 255
/atom/var/tmp/appearance
/atom/var/appearance_flags = 0
/atom/var/blend_mode = 0
/atom/var/color = ""
//atom/movable/var/list/atom/contents = list() // map editor only considers movables as having contents
/atom/var/density = 0
/atom/var/desc = ""
/atom/var/dir = 2
/atom/var/gender = "neuter"
/atom/var/icon/icon
/atom/var/icon_state
/atom/var/invisibility = 0
/atom/var/infra_luminosity = 0
//atom/var/tmp/atom/loc
/atom/var/layer = 1
/atom/var/luminosity = 0
/atom/var/maptext
/atom/var/maptext_width = 32
/atom/var/maptext_height = 32
/atom/var/maptext_x = 0
/atom/var/maptext_y = 0
/atom/var/mouse_over_pointer = 0
/atom/var/mouse_drag_pointer = 0
/atom/var/mouse_drop_pointer = 1
/atom/var/mouse_drop_zone = 0
/atom/var/mouse_opacity = 1
/atom/var/name = ""
/atom/var/opacity = 0
//atom/var/tmp/list/overlays
//atom/var/override
/atom/var/pixel_x = 0
/atom/var/pixel_y = 0
/atom/var/pixel_w = 0
/atom/var/pixel_z = 0
/atom/var/plane = 0
/atom/var/suffix = ""
/atom/var/text = ""
/atom/var/matrix/transform
//atom/var/tmp/list/underlays
/atom/var/tmp/list/verbs
//atom/var/tmp/x
//atom/var/tmp/y
//atom/var/tmp/z
/atom/var/list/filters
/atom/var/render_target
/atom/var/render_source
/atom/var/vis_flags

/atom/movable
/atom/movable/var/animate_movement = 1
/atom/movable/var/bound_x = 0
/atom/movable/var/bound_y = 0
/atom/movable/var/bound_width = 32
/atom/movable/var/bound_height = 32
/atom/movable/var/list/atom/contents = list() // map editor only considers movables as having contents
//atom/movable/var/tmp/list/locs  // not editable
/atom/movable/var/screen_loc = ""
/atom/movable/var/glide_size = 0
/atom/movable/var/step_size = 32
/atom/movable/var/step_x = 0
/atom/movable/var/step_y = 0
//atom/movable/var/list/vis_contents
//atom/movable/var/tmp/list/vis_locs

/area/parent_type = /atom
/area/layer = 1
/area/luminosity = 1

/turf/parent_type = /atom
/turf/layer = 2
/turf/var/list/vis_contents
/turf/var/tmp/list/vis_locs

/obj/parent_type = /atom/movable
/obj/layer = 3

/mob/parent_type = /atom/movable
/mob/layer = 4
//mob/var/tmp/ckey  // not editable, use key instead
//mob/var/tmp/client/client  // not editable
//mob/var/list/group  // not editable, but it's not obvious why
/mob/var/key = ""
/mob/var/see_infrared = 0
/mob/var/see_invisible = 0
/mob/var/see_in_dark = 2
/mob/var/sight

/world
/world/var/icon_size = 32 // the only one that matters anyways
`;
