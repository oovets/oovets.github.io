/* Shared map background for the project docs — same scene as the landing page:
 * a green dark-v11 globe that geolocates the visitor and flies down to their city,
 * then slowly orbits. Self-bootstrapping: creates its own #oo-map / #oo-scrim divs,
 * so no per-page HTML is needed. Load AFTER mapbox-gl.js. Styling (blur, transparency)
 * lives in theme.css. The token is a public pk. token (URL-restrict it in Mapbox).
 */
(function () {
  var TOKEN = "pk.eyJ1Ijoibm5pbnZlc3QiLCJhIjoiY2tuOHo4Ym1nMG45ODJ2dGFrajY1enNrbCJ9.wR4FvFHebK0fuENVPMvBZQ";
  if (!window.mapboxgl || TOKEN.indexOf("pk.") !== 0) return;

  function ensure(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    return el;
  }
  var mapEl = ensure("oo-map");
  ensure("oo-scrim");

  // remember the visitor's location so the globe intro + geoip lookup only run
  // on their very first visit; returning visitors land straight at their city.
  var KEY = "oo_geo_v1";
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  var returning = !!(cached && cached.flown && isFinite(cached.lon) && isFinite(cached.lat));

  mapboxgl.accessToken = TOKEN;
  var map = new mapboxgl.Map({
    container: mapEl,
    style: "mapbox://styles/mapbox/dark-v11",
    center: returning ? [cached.lon, cached.lat] : [18.0710, 59.3293],
    zoom: returning ? 15.5 : 2.4,
    pitch: returning ? 60 : 0,
    bearing: returning ? -20 : 0,
    projection: "globe",
    interactive: false,
  });

  map.on("style.load", function () {
    var set = function (id, prop, val) { try { map.setPaintProperty(id, prop, val); } catch (e) {} };
    // recolour every base layer into shades of green
    map.getStyle().layers.forEach(function (l) {
      var id = l.id;
      if (l.type === "symbol") { map.setLayoutProperty(id, "visibility", "none"); return; }
      if (l.type === "background") set(id, "background-color", "#05110a");
      else if (l.type === "fill") {
        var c = "#0b2113";
        if (/water/.test(id)) c = "#06251c";
        else if (/(park|grass|wood|vegetation|landcover|pitch|golf|cemetery|sand)/.test(id)) c = "#123a1f";
        else if (/building/.test(id)) c = "#0e2a18";
        set(id, "fill-color", c);
      } else if (l.type === "line") {
        var lc = "#1d5e33";
        if (/water/.test(id)) lc = "#0a3026";
        else if (/(motorway|trunk|primary)/.test(id)) lc = "#2f9a4e";
        set(id, "line-color", lc);
      } else if (l.type === "fill-extrusion") {
        set(id, "fill-extrusion-color", "#143f22");
      }
    });
    map.setFog({
      "color": "#06150c", "high-color": "#0c3320", "horizon-blend": 0.2,
      "space-color": "#03070a", "star-intensity": 0.15,
    });
    map.addLayer({
      id: "buildings-3d", source: "composite", "source-layer": "building",
      filter: ["==", "extrude", "true"], type: "fill-extrusion", minzoom: 14,
      paint: {
        "fill-extrusion-color": "#123a1f",
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": ["get", "min_height"],
        "fill-extrusion-opacity": 0.92,
      },
    });
  });

  var reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  var orbiting = false;
  function orbit() {
    if (!orbiting) return;
    map.setBearing((map.getBearing() + 0.02) % 360);
    requestAnimationFrame(orbit);
  }
  function arriveAt(lon, lat) {
    if (reduce) { map.jumpTo({ center: [lon, lat], zoom: 15.5, pitch: 60 }); return; }
    map.flyTo({ center: [lon, lat], zoom: 15.5, pitch: 62, bearing: -20,
      duration: 9000, curve: 1.6, essential: true });
    map.once("moveend", function () { orbiting = true; orbit(); });
  }
  async function locate() {
    var providers = [
      ["https://ipwho.is/", function (d) { return d && d.success !== false ? { c: [d.longitude, d.latitude], city: d.city } : null; }],
      ["https://get.geojs.io/v1/ip/geo.json", function (d) { return d ? { c: [parseFloat(d.longitude), parseFloat(d.latitude)], city: d.city } : null; }],
    ];
    for (var i = 0; i < providers.length; i++) {
      try {
        var r = providers[i][1](await (await fetch(providers[i][0], { cache: "no-store" })).json());
        if (r && isFinite(r.c[0]) && isFinite(r.c[1])) return r;
      } catch (e) { /* try next */ }
    }
    return { c: [18.0710, 59.3293], city: "Stockholm" };
  }

  var geo = ensure("geo");   // status line; styled fixed bottom-right in theme.css

  if (returning) {
    // already flown once before — no globe intro, no geoip call; sit at the city
    geo.textContent = "▸ " + (cached.city || "your city");
    if (!reduce) map.once("idle", function () { orbiting = true; orbit(); });
  } else {
    map.once("idle", async function () {
      geo.textContent = "▸ locating…";
      var res = await locate();
      var name = res.city || "your city";
      geo.textContent = reduce ? "▸ " + name : "▸ flying to " + name + "…";
      if (!reduce) map.once("moveend", function () { geo.textContent = "▸ " + name; });
      arriveAt(res.c[0], res.c[1]);
      try {
        localStorage.setItem(KEY, JSON.stringify({ lon: res.c[0], lat: res.c[1], city: res.city, flown: true }));
      } catch (e) {}
    });
  }
})();
