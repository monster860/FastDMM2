'use strict';
/**
 * 
 * @param {HTMLDivElement} elem1 
 * @param {HTMLDivElement} elem2 
 * @param {*} [param2]
 */
function dropdown(elem1, elem2, {point = null, autoremove = true} = {}) {
	let rect;
	if(point) {
		rect = {x: point[0], y: point[1], width: 0, height: 0, left: point[0], right: point[0], top: point[1], bottom: point[1]};
	} else {
		rect = elem1.getBoundingClientRect();
	}
	let [viewport_width, viewport_height] = [document.documentElement.clientWidth, document.documentElement.clientHeight];
	elem2.style.position = "fixed";
	elem2.style.visibility = "hidden";
	elem1.appendChild(elem2);

	let dropdown_rect = elem2.getBoundingClientRect();
	let flip_horizontal = false;
	let flip_vertical = false;
	let sideways = (elem1.classList.contains("dropdown-item"));
	if(((sideways ? rect.right : rect.left) + dropdown_rect.width + 16) >= viewport_width - 10)
		flip_horizontal = true;
	if(((sideways ? rect.top : rect.bottom) + dropdown_rect.height) >= viewport_height - 10 && (sideways ? rect.top : rect.bottom) >= (viewport_width / 2))
		flip_vertical = true;

	let dropdown_x = (sideways && !flip_horizontal) ? rect.right : rect.left;
	let dropdown_y = (!sideways && !flip_vertical) ? rect.bottom : rect.top;
	if(flip_horizontal) {
		elem2.style.right = (viewport_width - dropdown_x) + "px";
		elem2.style.maxWidth = (dropdown_x - 10) + "px";
	} else {
		elem2.style.left = dropdown_x + "px";
		elem2.style.maxWidth = (viewport_width - dropdown_x - 10) + "px";
	}
	if(flip_vertical) {
		elem2.style.bottom = (viewport_height - dropdown_y) + "px";
		elem2.style.maxHeight = (dropdown_y - 10) + "px";
	} else {
		elem2.style.top = dropdown_y + "px";
		elem2.style.maxHeight = (viewport_height - dropdown_y - 10) + "px";
	}

	if(!sideways && rect.width) {
		elem2.style.minWidth = (rect.width) + "px";
	}

	if(autoremove) {
		elem2.tabIndex = -1;
		if(!elem2.dataset.hasDropdownFocusoutListener) {
			elem2.dataset.hasDropdownFocusoutListener = true;
			elem2.addEventListener("focusout", () => {
				setTimeout(() => {
					if(elem2 != document.activeElement && !elem2.contains(document.activeElement) && elem1.contains(elem2)) {
						elem1.removeChild(elem2);
					}
				}, 0);
			});
		}
	}

	elem2.style.visibility = "";
	if(autoremove)
		elem2.focus();
};

module.exports = dropdown;