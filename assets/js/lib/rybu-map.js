/*
 * rybu-map — travel-route maps embedded in posts via Ghost HTML cards.
 *
 * Multi-layer form (any combination of the three attributes):
 *   <div class="rybu-map"
 *        data-flights="CDG:49.01,2.55|HND:35.55,139.78"
 *        data-route="35.69,139.69|35.17,136.88"
 *        data-pois="Fuji:35.36,138.73|Kyoto:34.99,135.77"></div>
 *
 * Single-layer shorthand (backwards-compatible):
 *   <div class="rybu-map" data-type="flights"
 *        data-points="CDG:49.01,2.55|HND:35.55,139.78"></div>
 *
 * Each attribute is a pipe-separated list of points, each "LABEL:lat,lng"
 * (label optional). "flights" draws great-circle arcs between successive
 * points; "route" draws a straight polyline; "pois" draws markers only.
 * All layers render markers at their own points.
 *
 * data-zoom : optional initial camera span, 0.5 (street) .. 50 (world).
 *             Defaults to auto-fit over all layers' points combined.
 * data-width : "regular" (default, text column), "wide", or "full" viewport.
 *              Uses Ghost's .gh-canvas grid columns via :has() — purely CSS.
 *
 * Fallback for complex cases: put a JSON payload in a child
 * <script type="application/json"> of the div with keys
 *   { zoom, layers: [{type, points: [{label, lat, lng}, ...]}, ...] }.
 *
 * Provider: if a Maps token is set (meta[name="rybu:mapkit-token"], injected from
 * @custom.mapkit_token), Apple Maps is used through MapKit JS 6, loaded modularly
 * from mapkit.core.js with only the "full-map" library. Otherwise the map degrades
 * gracefully to Leaflet + CARTO/OSM tiles, no API key required.
 */
(function () {
    var nodes = document.querySelectorAll('.rybu-map');
    if (!nodes.length) return;

    var tokenMeta = document.querySelector('meta[name="rybu:mapkit-token"]');
    var token = tokenMeta ? tokenMeta.getAttribute('content') : '';
    var useApple = !!token;

    var LAYER_TYPES = ['flights', 'route', 'pois'];

    // ---------- Config parsing ----------

    function parsePointsList(raw) {
        return raw.split('|').map(function (chunk) {
            chunk = chunk.trim();
            if (!chunk) return null;
            var label = '';
            var coords = chunk;
            var colon = chunk.indexOf(':');
            if (colon !== -1) {
                label = chunk.slice(0, colon).trim();
                coords = chunk.slice(colon + 1).trim();
            }
            var parts = coords.split(',');
            if (parts.length !== 2) return null;
            return { label: label, lat: +parts[0], lng: +parts[1] };
        }).filter(validPoint);
    }

    function normalizePoint(p) {
        return { label: p.label || '', lat: +p.lat, lng: +p.lng };
    }

    function parseConfig(el) {
        var zoom = parseZoom(el.dataset.zoom);

        var jsonTag = el.querySelector('script[type="application/json"]');
        if (jsonTag) {
            try {
                var data = JSON.parse(jsonTag.textContent);
                var layers;
                if (Array.isArray(data.layers)) {
                    layers = data.layers.map(function (l) {
                        return {
                            type: LAYER_TYPES.indexOf(l.type) !== -1 ? l.type : 'pois',
                            points: (l.points || []).map(normalizePoint).filter(validPoint)
                        };
                    });
                } else {
                    layers = [{
                        type: LAYER_TYPES.indexOf(data.type) !== -1 ? data.type : 'pois',
                        points: (data.points || []).map(normalizePoint).filter(validPoint)
                    }];
                }
                return {
                    layers: layers.filter(function (l) { return l.points.length; }),
                    zoom: data.zoom != null ? +data.zoom : zoom
                };
            } catch (e) { /* fall through */ }
        }

        var layers = [];
        LAYER_TYPES.forEach(function (t) {
            var raw = el.dataset[t];
            if (raw) {
                var pts = parsePointsList(raw);
                if (pts.length) layers.push({ type: t, points: pts });
            }
        });

        // Legacy shorthand
        if (!layers.length && el.dataset.points) {
            var pts = parsePointsList(el.dataset.points);
            var t = LAYER_TYPES.indexOf(el.dataset.type) !== -1 ? el.dataset.type : 'pois';
            if (pts.length) layers.push({ type: t, points: pts });
        }

        return { layers: layers, zoom: zoom };
    }

    function parseZoom(v) {
        var n = parseFloat(v);
        return isFinite(n) ? n : null;
    }

    function validPoint(p) {
        return p && isFinite(p.lat) && isFinite(p.lng)
            && p.lat >= -90 && p.lat <= 90
            && p.lng >= -180 && p.lng <= 180;
    }

    function allPoints(cfg) {
        var out = [];
        cfg.layers.forEach(function (l) { out = out.concat(l.points); });
        return out;
    }

    // Great-circle interpolation (slerp on unit sphere) between two lat/lng.
    function greatCircle(a, b, steps) {
        var toRad = Math.PI / 180, toDeg = 180 / Math.PI;
        var lat1 = a.lat * toRad, lng1 = a.lng * toRad;
        var lat2 = b.lat * toRad, lng2 = b.lng * toRad;
        var dLat = lat2 - lat1, dLng = lng2 - lng1;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
              + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        var d = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
        if (d === 0) return [a, b];
        var out = [];
        for (var i = 0; i <= steps; i++) {
            var f = i / steps;
            var A = Math.sin((1 - f) * d) / Math.sin(d);
            var B = Math.sin(f * d) / Math.sin(d);
            var x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
            var y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
            var z = A * Math.sin(lat1) + B * Math.sin(lat2);
            var lat = Math.atan2(z, Math.sqrt(x * x + y * y));
            var lng = Math.atan2(y, x);
            out.push({ lat: lat * toDeg, lng: lng * toDeg });
        }
        return out;
    }

    function summarizeLayer(l) {
        var labels = l.points.map(function (p) { return p.label || (p.lat.toFixed(2) + ',' + p.lng.toFixed(2)); });
        if (l.type === 'flights') return 'vol ' + labels.join(' → ');
        if (l.type === 'route') return 'itinéraire ' + labels.join(' → ');
        return 'lieux ' + labels.join(', ');
    }

    function buildA11yLabel(cfg) {
        return 'Carte : ' + cfg.layers.map(summarizeLayer).join(' ; ');
    }

    function buildPlaceholder(el, cfg) {
        if (el.querySelector('.rybu-map-placeholder')) return;
        var ph = document.createElement('ul');
        ph.className = 'rybu-map-placeholder';
        ph.setAttribute('aria-hidden', 'true');
        allPoints(cfg).forEach(function (p) {
            var li = document.createElement('li');
            li.textContent = p.label || (p.lat.toFixed(2) + ', ' + p.lng.toFixed(2));
            ph.appendChild(li);
        });
        el.appendChild(ph);
    }

    // ---------- Apple MapKit provider ----------

    // MapKit JS 6 modular loader: mapkit.core.js is a stub that self-initializes
    // from data-token and pulls in only the libraries listed in data-libraries.
    // "full-map" covers Map plus overlays and annotations, which is all we draw.
    var MAPKIT_SRC = 'https://cdn.apple-mapkit.com/mk/6/mapkit.core.js';
    var MAPKIT_LIBRARIES = 'full-map';
    var MAPKIT_CALLBACK = '__rybuMapKitReady';
    var mapkitReady = null;

    function loadMapKit() {
        if (mapkitReady) return mapkitReady;
        mapkitReady = new Promise(function (resolve, reject) {
            if (window.mapkit && window.mapkit.Map) { resolve(window.mapkit); return; }

            window[MAPKIT_CALLBACK] = function () {
                // In v6 data-callback also fires when a library fails to load,
                // so check that the interfaces we need actually landed.
                if (window.mapkit && window.mapkit.Map) resolve(window.mapkit);
                else reject(new Error('mapkit_libraries_failed'));
            };

            var s = document.createElement('script');
            s.src = MAPKIT_SRC;
            s.crossOrigin = 'anonymous';
            s.async = true;
            s.dataset.callback = MAPKIT_CALLBACK;
            s.dataset.libraries = MAPKIT_LIBRARIES;
            s.dataset.token = token;
            var lang = document.documentElement.lang;
            if (lang) s.dataset.language = lang;
            s.onerror = function () { reject(new Error('mapkit_script_failed')); };
            document.head.appendChild(s);
        });
        return mapkitReady;
    }

    function renderMapKit(el, cfg) {
        var mk = window.mapkit;
        var darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var ink = darkMode ? '#ffffff' : '#111111';
        var contrast = darkMode ? '#111111' : '#ffffff';

        var map = new mk.Map(el, {
            showsCompass: mk.FeatureVisibility.Hidden,
            showsScale: mk.FeatureVisibility.Hidden,
            showsMapTypeControl: false,
            showsZoomControl: false,
            isRotationEnabled: false,
            colorScheme: darkMode ? mk.ColorScheme.Dark : mk.ColorScheme.Light
        });

        var allAnnotations = [];

        cfg.layers.forEach(function (layer) {
            var coords = layer.points.map(function (p) { return new mk.Coordinate(p.lat, p.lng); });

            var annotations = layer.points.map(function (p, i) {
                return new mk.MarkerAnnotation(coords[i], {
                    title: p.label || '',
                    color: ink,
                    glyphColor: contrast,
                    selected: false
                });
            });
            if (annotations.length) map.addAnnotations(annotations);
            allAnnotations = allAnnotations.concat(annotations);

            if (layer.type === 'flights' && layer.points.length >= 2) {
                for (var i = 0; i < layer.points.length - 1; i++) {
                    var arc = greatCircle(layer.points[i], layer.points[i + 1], 64);
                    var arcCoords = arc.map(function (p) { return new mk.Coordinate(p.lat, p.lng); });
                    map.addOverlay(new mk.PolylineOverlay(arcCoords, {
                        style: new mk.Style({
                            strokeColor: ink,
                            lineWidth: 2,
                            lineDash: [6, 4]
                        })
                    }));
                }
            } else if (layer.type === 'route' && layer.points.length >= 2) {
                map.addOverlay(new mk.PolylineOverlay(coords, {
                    style: new mk.Style({
                        strokeColor: ink,
                        lineWidth: 3
                    })
                }));
            }
        });

        var firstPoint = allPoints(cfg)[0];
        if (cfg.zoom != null && firstPoint) {
            map.region = new mk.CoordinateRegion(
                new mk.Coordinate(firstPoint.lat, firstPoint.lng),
                new mk.CoordinateSpan(cfg.zoom, cfg.zoom)
            );
        } else if (allAnnotations.length === 1) {
            map.region = new mk.CoordinateRegion(
                allAnnotations[0].coordinate,
                new mk.CoordinateSpan(0.5, 0.5)
            );
        } else if (allAnnotations.length) {
            map.showItems(allAnnotations, { animate: false, padding: new mk.Padding(40, 40, 40, 40) });
        }

        el.classList.add('rybu-map-ready');
    }

    // ---------- Leaflet + CARTO/OSM fallback ----------

    var LEAFLET_VERSION = '1.9.4';
    var LEAFLET_JS = 'https://unpkg.com/leaflet@' + LEAFLET_VERSION + '/dist/leaflet.js';
    var LEAFLET_CSS = 'https://unpkg.com/leaflet@' + LEAFLET_VERSION + '/dist/leaflet.css';
    var leafletReady = null;

    function loadLeaflet() {
        if (leafletReady) return leafletReady;
        leafletReady = new Promise(function (resolve, reject) {
            if (window.L && window.L.map) { resolve(window.L); return; }
            if (!document.querySelector('link[data-rybu-leaflet]')) {
                var link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = LEAFLET_CSS;
                link.setAttribute('data-rybu-leaflet', '1');
                document.head.appendChild(link);
            }
            var s = document.createElement('script');
            s.src = LEAFLET_JS;
            s.async = true;
            s.onload = function () { resolve(window.L); };
            s.onerror = function () { reject(new Error('leaflet_script_failed')); };
            document.head.appendChild(s);
        });
        return leafletReady;
    }

    function renderLeaflet(el, cfg) {
        var L = window.L;
        var darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var ink = darkMode ? '#ffffff' : '#111111';
        var contrast = darkMode ? '#111111' : '#ffffff';
        var tileUrl = darkMode
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

        var map = L.map(el, {
            zoomControl: true,
            scrollWheelZoom: false,
            attributionControl: true
        });

        L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        var allMarkers = [];

        cfg.layers.forEach(function (layer) {
            layer.points.forEach(function (p) {
                var m = L.circleMarker([p.lat, p.lng], {
                    radius: 7,
                    color: contrast,
                    weight: 2,
                    fillColor: ink,
                    fillOpacity: 1
                });
                if (p.label) m.bindTooltip(p.label, { permanent: false, direction: 'top' });
                m.addTo(map);
                allMarkers.push(m);
            });

            if (layer.type === 'flights' && layer.points.length >= 2) {
                for (var i = 0; i < layer.points.length - 1; i++) {
                    var arc = greatCircle(layer.points[i], layer.points[i + 1], 64);
                    L.polyline(arc.map(function (p) { return [p.lat, p.lng]; }), {
                        color: ink,
                        weight: 2,
                        dashArray: '6,4',
                        opacity: 0.9
                    }).addTo(map);
                }
            } else if (layer.type === 'route' && layer.points.length >= 2) {
                L.polyline(layer.points.map(function (p) { return [p.lat, p.lng]; }), {
                    color: ink,
                    weight: 3,
                    opacity: 0.9
                }).addTo(map);
            }
        });

        var points = allPoints(cfg);
        if (points.length === 1) {
            map.setView([points[0].lat, points[0].lng], 10);
        } else if (cfg.zoom != null && points.length) {
            // CoordinateSpan isn't a direct analogue; approximate via zoom level.
            var zoom = Math.max(2, Math.min(18, Math.round(10 - Math.log2(cfg.zoom))));
            map.setView([points[0].lat, points[0].lng], zoom);
        } else if (allMarkers.length) {
            map.fitBounds(L.featureGroup(allMarkers).getBounds(), { padding: [40, 40] });
        }

        el.classList.add('rybu-map-ready');
    }

    // ---------- Hydration orchestrator ----------

    function hydrate(el) {
        if (el.dataset.rybuHydrated) return;
        el.dataset.rybuHydrated = '1';
        var cfg = parseConfig(el);
        if (!cfg.layers.length) {
            el.classList.add('rybu-map-error');
            el.setAttribute('data-rybu-error', 'no_points');
            return;
        }
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', buildA11yLabel(cfg));
        buildPlaceholder(el, cfg);

        var loader = useApple ? loadMapKit : loadLeaflet;
        var renderer = useApple ? renderMapKit : renderLeaflet;
        var errorKey = useApple ? 'mapkit_load_failed' : 'leaflet_load_failed';

        loader().then(function () {
            try { renderer(el, cfg); }
            catch (err) {
                el.classList.add('rybu-map-error');
                el.setAttribute('data-rybu-error', 'render_failed');
            }
        }, function (err) {
            el.classList.add('rybu-map-error');
            el.setAttribute('data-rybu-error', (err && err.message) || errorKey);
        });
    }

    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    hydrate(e.target);
                    io.unobserve(e.target);
                }
            });
        }, { rootMargin: '200px 0px' });
        nodes.forEach(function (n) { io.observe(n); });
    } else {
        nodes.forEach(hydrate);
    }
})();
