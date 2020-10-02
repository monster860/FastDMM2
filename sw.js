async function hash_text(text) {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hash = await crypto.subtle.digest('SHA-1', data);
	return Array.prototype.map.call(new Uint8Array(hash), x => ('00' + x.toString(16)).slice(-2)).join('');
}

async function install_initial_cache() {
	let cache_promise = caches.open('current');
	let appfiles_res = await fetch('appfiles.json');
	let res_clone = appfiles_res.clone();
	let appfiles = new Map(await (appfiles_res).json());
	let cache = await cache_promise;
	await Promise.all([cache.addAll([...appfiles.keys()]), cache.put('appfiles.json', res_clone), caches.delete('staging')]);
}

/** @type {Promise<void>} */
let update_cache_promise = null;

/**
 * @param {Map<string,string>} old_appfiles 
 * @param {Map<string,string>} appfiles 
 * @param {Response} appfiles_res 
 */
async function update_cache(old_appfiles, appfiles, appfiles_res) {
	let staging = await caches.open('staging');
	try {
		let cache_add_promises = [staging.put('appfiles.json', appfiles_res.clone())];
		for(let [file, hash] of appfiles) {
			if(hash != old_appfiles.get(file))
				cache_add_promises.push(fetch(file, {cache: 'no-cache'}).then((r) => {return staging.put(file, r);}));
		}
		await Promise.all(cache_add_promises);
		console.log("App updated.");
		for(let client of await (clients.matchAll({type: 'window'}))) {
			client.postMessage("new-update"); // notify windows
		}
	} catch(e) {
		console.error("Failed to update app.");
		console.error(e);
		await caches.delete('staging');
	}
}

async function from_cache(e) {
	/** @type {Request} */
	let req = e.request;
	let url = new URL(req.url);
	let cache = await caches.open('current');
	let appfiles_text = await (await cache.match("appfiles.json")).text()
	let appfiles = new Map(JSON.parse(appfiles_text));
	if(url.pathname == "/" || url.pathname == "/index.html") {
		let has_staging = await caches.has('staging');
		if(!update_cache_promise) {
			if(!has_staging) {
				update_cache_promise = (async () => {
					try {
						let new_appfiles_res = await fetch("appfiles.json", {cache: 'no-cache'});
						let new_appfiles_clone = new_appfiles_res.clone();
						let new_appfiles_text = (await new_appfiles_res.text());
						if(new_appfiles_text != appfiles_text) {
							console.log("Updating app...");
							await update_cache(appfiles, new Map(JSON.parse(new_appfiles_text)), new_appfiles_clone);
						}
					} finally {
						update_cache_promise = null;
					}
				})();
			} else {
				let staging = await caches.open('staging');
				let copy_promises = [];
				for(let this_res of (await staging.matchAll())) {
					copy_promises.push(cache.put(this_res.url, this_res));
				}
				await Promise.all(copy_promises);
				await caches.delete('staging');
			}
		}
		let page_res = await cache.match('index.html');
		let text = await (page_res).text();
		return new Response(text.replace('out.js', 'out.js?' + Math.random()), page_res); // did you know memory cache bad :blobthumbsdown:
	} else {
		return (await cache.match(req, {ignoreSearch: true})) || await fetch(req);
	}
}

self.addEventListener("install", (e) => {
	console.log("Service worker installing");
	e.waitUntil(install_initial_cache());
});

self.addEventListener("fetch", (e) => {
	let from_cache_promise = from_cache(e);
	e.respondWith(from_cache_promise);
	e.waitUntil(from_cache_promise.then(() => {
		return update_cache_promise;
	}));
});

self.addEventListener("message", (e) => {
	e.waitUntil(async () => {
		if(e.data == "i-exist") {
			if((await caches.has("staging")) && update_cache_promise) {
				e.source.postMessage("new-update");
			}
		}
	});
});
