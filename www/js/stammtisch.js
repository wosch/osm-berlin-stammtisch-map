// URL layout, lang detection
var initialGeojson = null;
var use_osm_de_map = false;

var thisURL = location.href;
var isHttps = thisURL.match("^https://");
var lang = "de";
if (thisURL.match(/bbbikeleaflet\.en\./)) {
    lang = "en";
    thisURL = thisURL.replace(/bbbikeleaflet\.en\./, "bbbikeleaflet.");
}
var useOldURLLayout = thisURL.match(/(cgi\/bbbikeleaflet|bbbike\/html\/bbbikeleaflet)/);
var bbbikeRoot, cgiURL, bbbikeImagesRoot, bbbikeTempRoot;
if (useOldURLLayout) {
    bbbikeRoot = thisURL.replace(/\/(cgi|html)\/bbbikeleaflet\..*/, "");
    bbbikeImagesRoot = bbbikeRoot + "/images";
    cgiURL = bbbikeRoot + "/cgi/bbbike.cgi";
    bbbikeTempRoot = bbbikeRoot + "/tmp";
} else {
    bbbikeRoot = thisURL.replace(/\/(cgi-bin|BBBike\/html)\/bbbikeleaflet\..*/, "");
    bbbikeImagesRoot = bbbikeRoot + "/BBBike/images";
    cgiURL = bbbikeRoot + "/cgi-bin/bbbike.cgi";
    bbbikeTempRoot = bbbikeRoot + "/BBBike/tmp";
}

var q = new HTTP.Query;
if (q.get("lang") == "de") {
    lang = "de";
} else if (q.get("lang") == "en") {
    lang = "en";
}

var URLchanged = false;

var initLayerAbbrevs = q.get('l');
if (initLayerAbbrevs) {
    initLayerAbbrevs = initLayerAbbrevs.split(",");
} else {
    initLayerAbbrevs = [];
}
var initBaseMapAbbrev = q.get('bm');
var addLayerToControl = q.get('ctrla');
if (addLayerToControl) {
    addLayerToControl = Object.fromEntries(addLayerToControl.split(",").map(function(e) {
        return [e, true]
    }));
} else {
    addLayerToControl = {};
}

// localization
var msg = {
    "en": {
        "Kartendaten": "Map data",
        "Qualit\u00e4t": "Smoothness",
        "Radwege": "Cycleways",
        "Unbeleuchtet": "Unlit",
        "Gr\u00fcne Wege": "Green ways"
    }
};

function M(string) {
    if (msg[lang] && msg[lang][string]) {
        return msg[lang][string];
    } else {
        return string;
    }
}

var startMarker, goalMarker, loadingMarker;

var id2marker;

// globals
var routeLayer;
var searchState = "start";
var startLatLng;
var map;
var routelistPopup;

var defaultLatLng = [52.516224, 13.377463]; // Brandenburger Tor, good for Berlin
var defaultZoom = 13;

var devel_tile_letter = 'a'; // or 'z' or 'y'
var base_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike',
    'devel2': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/mapnik-german',
    'mapnik-osm': 'https://{s}.tile.bbbike.org/osm/mapnik',
    'mapnik-german': 'https://{s}.tile.bbbike.org/osm/mapnik-german'
};
var smoothness_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike-smoothness',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike-smoothness'
};
var handicap_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike-handicap',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike-handicap'
};
var cycleway_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike-cycleway',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike-cycleway'
};
var unlit_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike-unlit',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike-unlit'
};
var green_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike-green',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike-green'
};
var unknown_map_url_mapping = {
    'stable': 'https://{s}.tile.bbbike.org/osm/bbbike-unknown',
    'devel1': 'https://' + devel_tile_letter + '.tile.bbbike.org/osm/bbbike-unknown'
};

var mapset = q.get('mapset') || 'stable';
var base_map_url = base_map_url_mapping[mapset] || base_map_url_mapping['stable'];
var smoothness_map_url = smoothness_map_url_mapping[mapset] || smoothness_map_url_mapping['stable'];
var handicap_map_url = handicap_map_url_mapping[mapset] || handicap_map_url_mapping['stable'];
var cycleway_map_url = cycleway_map_url_mapping[mapset] || cycleway_map_url_mapping['stable'];
var unlit_map_url = unlit_map_url_mapping[mapset] || unlit_map_url_mapping['stable'];
var green_map_url = green_map_url_mapping[mapset] || green_map_url_mapping['stable'];
var unknown_map_url = unknown_map_url_mapping[mapset] || unknown_map_url_mapping['stable'];
var accel;

var currentLayer; // XXX hacky!!!
var stdGeojsonLayerOptions = {

    // --- XXX does not work (with leaflet 0.4.4?)
    // pointToLayer: function (feature, latlng) {
    // 	return L.circleMarker(latlng, { radius: 8 });
    // },
    onEachFeature: function(feature, layer) {
        layer.bindPopup(bbdgeojsonProp2Html(feature.properties));
        id2marker[feature.properties.id] = layer;
    }
};

function doLeaflet() {
    var nowYear = new Date().getFullYear();

    var bbbikeOrgMapnikGermanUrl = base_map_url + '/{z}/{x}/{y}.png';
    var bbbikeAttribution = M("Kartendaten") + ' \u00a9 ' + nowYear + ' <a href="http://bbbike.de">Slaven Rezi\u0107</a>';
    var bbbikeTileLayer = new L.TileLayer(bbbikeOrgMapnikGermanUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });

    var bbbike04TileLayer = new L.TileLayer(bbbikeOrgMapnikGermanUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });
    bbbike04TileLayer.setOpacity(0.4);

    var bbbikeOrgSmoothnessUrl = smoothness_map_url + '/{z}/{x}/{y}.png';
    var bbbikeSmoothnessTileLayer = new L.TileLayer(bbbikeOrgSmoothnessUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });

    var bbbikeOrgHandicapUrl = handicap_map_url + '/{z}/{x}/{y}.png';
    var bbbikeHandicapTileLayer = new L.TileLayer(bbbikeOrgHandicapUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });

    var bbbikeOrgCyclewayUrl = cycleway_map_url + '/{z}/{x}/{y}.png';
    var bbbikeCyclewayTileLayer = new L.TileLayer(bbbikeOrgCyclewayUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });

    var bbbikeOrgUnlitUrl = unlit_map_url + '/{z}/{x}/{y}.png';
    var bbbikeUnlitTileLayer = new L.TileLayer(bbbikeOrgUnlitUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });

    var bbbikeOrgGreenUrl = green_map_url + '/{z}/{x}/{y}.png';
    var bbbikeGreenTileLayer = new L.TileLayer(bbbikeOrgGreenUrl, {
        maxZoom: 18,
        attribution: bbbikeAttribution
    });

    /* XXX for some reason the layer does not work anymore; but the GeoJSON layer has the advantage about being clickable */
    //var bbbikeOrgUnknownUrl = unknown_map_url + '/{z}/{x}/{y}.png';
    //var bbbikeUnknownTileLayer = new L.TileLayer(bbbikeOrgUnknownUrl, {maxZoom: 18, attribution: bbbikeAttribution});
    var bbbikeUnknownUrl = bbbikeTempRoot + '/geojson/fragezeichen.geojson';
    var bbbikeUnknownTileLayer = new L.GeoJSON(null, stdGeojsonLayerOptions);

    var bbbikeXXXUrl = bbbikeTempRoot + '/geojson/fragezeichen-outdoor-nextcheck.geojson';
    var bbbikeXXXLayer = new L.GeoJSON(null, stdGeojsonLayerOptions);

    var bbbikeXXXFutureUrl = bbbikeTempRoot + '/geojson/fragezeichen-outdoor.geojson';
    var bbbikeXXXFutureLayer = new L.GeoJSON(null, stdGeojsonLayerOptions);

    var bbbikeTempBlockingsUrl = bbbikeTempRoot + '/geojson/bbbike-temp-blockings-optimized.geojson';
    var bbbikeTempBlockingsLayer = new L.GeoJSON(null, stdGeojsonLayerOptions);

    var bbbikeCommentsFerryUrl = bbbikeTempRoot + '/geojson/comments_ferry.geojson';
    var bbbikeCommentsFerryLayer = new L.GeoJSON(null, stdGeojsonLayerOptions);

    var osmMapnikUrl = use_osm_de_map ? 'https://tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    var osmAttribution = M("Kartendaten") + ' \u00a9 ' + nowYear + ' <a href="https://www.openstreetmap.org/">OpenStreetMap</a> Contributors';
    var osmTileLayer = new L.TileLayer(osmMapnikUrl, {
        maxZoom: 19,
        attribution: osmAttribution
    });

    var osm04TileLayer = new L.TileLayer(osmMapnikUrl, {
        maxZoom: 19,
        attribution: osmAttribution
    });
    osm04TileLayer.setOpacity(0.4);

    var cyclosmUrl = 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png';
    var cyclosmAttribution = '\u00a9 <a href="https://www.openstreetmap.org/">OpenStreetMap</a> Contributors. Tiles style by <a href="https://www.cyclosm.org">CyclOSM</a> hosted by <a href="https://openstreetmap.fr">OpenStreetMap France</a>';
    var cyclosmTileLayer = new L.TileLayer(cyclosmUrl, {
        maxZoom: 19,
        attribution: cyclosmAttribution
    });

    var berlinAerialYear = '2023';
    var berlinAerialVariant = '-dop20rgbi';
    var berlinAerialNewestUrl = 'https://tiles.codefor.de/berlin-' + berlinAerialYear + berlinAerialVariant + '/{z}/{x}/{y}.png';
    var berlinAerialAttribution = M("Kartendaten") + ': <a href="https://fbinter.stadt-berlin.de/fb/berlin/service_intern.jsp?id=a_luftbild' + berlinAerialYear + '_true_rgbi@senstadt&type=FEED">Geoportal Berlin / Digitale farbige TrueOrthophotos ' + berlinAerialYear + '</a>';
    var berlinAerialTileLayer = new L.TileLayer(berlinAerialNewestUrl, {
        maxZoom: 20,
        attribution: berlinAerialAttribution
    });

    var bvgStadtplanUrl = 'https://stadtplan.bvg.de/api/data/20/{z}/{x}/{y}.png';
    var bvgStadtplanAttribution = '\u00a9 <a href="https://www.bvg.de/de/datenschutz">2022 Berliner Verkehrsbetriebe</a>';
    var bvgStadtplanLayer = new L.TileLayer(bvgStadtplanUrl, {
        maxZoom: 16,
        attribution: bvgStadtplanAttribution
    });

    map = new L.Map('map', {
        zoomControl: false,
        zoomAnimation: true,
        fadeAnimation: false,
        // animations may be super-slow, seen on mosor/firefox9 - but see https://github.com/Leaflet/Leaflet/issues/1922
        // used for setting start/goal, see below for click/dblclick event
        layers: [bbbikeTileLayer]
    });

    var speedControl;

    var clockControl;

    map.addControl(new L.control.zoom());
    map.addControl(new L.control.scale());

    var overlayDefs = [{
        label: M("Qualit\u00e4t"),
        layer: bbbikeSmoothnessTileLayer,
        abbrev: 'Q',
        inControl: true
    }, {
        label: M("Handicaps"),
        layer: bbbikeHandicapTileLayer,
        abbrev: 'H',
        inControl: true
    }, {
        label: M("Radwege"),
        layer: bbbikeCyclewayTileLayer,
        abbrev: 'RW',
        inControl: true
    }, {
        label: M("Unbeleuchtet"),
        layer: bbbikeUnlitTileLayer,
        abbrev: 'NL',
        inControl: true
    }, {
        label: M("Gr\u00fcne Wege"),
        layer: bbbikeGreenTileLayer,
        abbrev: 'GR',
        inControl: true
    }];

    var baseMapDefs = [{
        label: "OSM",
        layer: osmTileLayer,
        abbrev: 'O',
        inControl: true
    }, {
        label: "BBBike",
        layer: bbbikeTileLayer,
        abbrev: 'B',
        inControl: true
    }, {
        label: "CyclOSM",
        layer: cyclosmTileLayer,
        abbrev: 'C',
        inControl: true
    }, {
        label: "BVG",
        layer: bvgStadtplanLayer,
        abbrev: 'BVG',
        inControl: true
    }];

    var overlayMaps = {};
    for (var i = 0; i < overlayDefs.length; i++) {
        var overlayDef = overlayDefs[i];
        var inControl = overlayDef.inControl;
        if (!inControl && initLayerAbbrevs.length) {
            for (var j = 0; j < initLayerAbbrevs.length; j++) {
                if (initLayerAbbrevs[j] == overlayDef.abbrev) {
                    inControl = true;
                    break;
                }
            }
        }
        if (inControl) {
            overlayMaps[overlayDef.label] = overlayDef.layer;
        }
    }
    var baseMaps = {};
    for (var i = 0; i < baseMapDefs.length; i++) {
        if (baseMapDefs[i].inControl || (initBaseMapAbbrev && initBaseMapAbbrev == baseMapDefs[i].abbrev) || addLayerToControl[baseMapDefs[i].abbrev]) {
            baseMaps[baseMapDefs[i].label] = baseMapDefs[i].layer;
        }
    }

    if (initLayerAbbrevs.length) {
        var abbrevToLayer = {};
        for (var i = 0; i < overlayDefs.length; i++) {
            abbrevToLayer[overlayDefs[i].abbrev] = overlayDefs[i].layer;
        }
        for (var i = 0; i < initLayerAbbrevs.length; i++) {
            var l = abbrevToLayer[initLayerAbbrevs[i]];
            if (l) {
                map.addLayer(l);
            } else {
                if (console && console.debug) {
                    console.debug("Layer abbrev '" + initLayerAbbrevs[i] + "' unhandled");
                }
            }
        }
    }

    var layersControl = new L.Control.Layers(baseMaps, overlayMaps);
    map.addControl(layersControl);

    var initTileLayer;
    if (initBaseMapAbbrev) {
        for (var i = 0; i < baseMapDefs.length; i++) {
            if (initBaseMapAbbrev == baseMapDefs[i].abbrev) {
                initTileLayer = baseMapDefs[i].layer;
                break;
            }
        }
    }
    if (!initTileLayer) {
        if (initBaseMapAbbrev && console && console.debug) {
            console.debug("Basemap abbrev '" + initBaseMapAbbrev + "' unhandled, fallback to default bbbike layer");
        }
        // initTileLayer = bbbikeTileLayer;
        initTileLayer = osmTileLayer;
    }
    map.addLayer(initTileLayer);
    if (initTileLayer != bbbikeTileLayer) { // otherwise it looks like the first layer in control is rendered *additionally*
        map.removeLayer(bbbikeTileLayer);
    }

    routeLayer = new L.GeoJSON();
    map.addLayer(routeLayer);

    if (isHttps) {
        addLocators();
    }

    map.on('moveend', function() {
        var center = map.getCenter();
        q.set('lat', parseFloat(center.lat).toFixed(6));
        q.set('lon', parseFloat(center.lng).toFixed(6));
        adjustHistory();
    });
    map.on('zoomend', function() {
        q.set('zoom', map.getZoom().toString());
        adjustHistory();
    });
    map.on('baselayerchange', function(e) {
        for (var i = 0; i < baseMapDefs.length; i++) {
            if (baseMapDefs[i].layer == e.layer) {
                q.set('bm', baseMapDefs[i].abbrev);
                adjustHistory();
                return;
            }
        }
    });

    var setViewLatLng;
    var setViewZoom;
    var setViewLayer;

    id2marker = {};

    if (initialGeojson) {
        currentLayer = map; // XXX hacky! must be set before creating geoJson layer (which would call onEachFeature callback)
        var l = L.geoJson(initialGeojson, stdGeojsonLayerOptions);
        l.addTo(map);
        setViewLayer = l;
    } else {
        var lat = q.get("mlat");
        var lon = q.get("mlon");
        if (lat && lon) {
            var center = new L.LatLng(lat, lon);
            setViewLatLng = center;
            setStartMarker(center);
        }
    }

    if (!setViewLatLng) {
        var lat = q.get("lat");
        var lon = q.get("lon");
        if (lat && lon) {
            setViewLatLng = new L.LatLng(lat, lon);
        }
    }
    if (setViewLayer && !setViewLatLng) {
        map.fitBounds(setViewLayer.getBounds());
    } else {
        if (!setViewLatLng) {
            setViewLatLng = defaultLatLng;
        }
        if (!setViewZoom) {
            setViewZoom = q.get("zoom") || defaultZoom;
        }
        map.setView(setViewLatLng, setViewZoom);
    }

    if (initialGeojson) {
        var listHtml = '';
        var features = initialGeojson.features;
        if (!features && initialGeojson.type == 'Feature') {
            features = [initialGeojson];
        }
        if (!features || !features.length) {
            listHtml += 'no features in geojson file<br>';
        } else {
            for (var i = 0; i < features.length; i++) {
                var featureProperties = features[i].properties
                if (featureProperties) {
                    listHtml += "\n" + '<a href="javascript:showMarker(' + featureProperties.id + ')">' + featureProperties.name + '</a><br><hr>';
                }
            }
        }

        setFeatureListContent(listHtml);
    }
}

function bbdgeojsonProp2Html(prop) {
    var html = prop.name;
    if (prop.urls) {
        html += '<br/>';
        for (var i = 0; i < prop.urls.length; i++) {
            html += '<a target="_blank" href="' + prop.urls[i] + '">' + prop.urls[i] + '</a>';
            if (i < prop.urls.length - 1) {
                html += '<br/>';
            }
        }
    }
    return html;
}

function getActualWidth() {
    return window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth || document.body.offsetWidth;
}

function getActualHeight() {
    return window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || document.body.offsetHeight;
}

function setFeatureListContent(listHtml) {
    var windowX = getActualWidth();
    var arrangement = windowX >= 800 ? 'h' : 'v';
    var windowY = getActualHeight();
    var mapDiv = map.getContainer();
    var listDiv;
    var otherListDiv;
    if (arrangement == 'h') {
        listDiv = document.getElementById('listleft');
        otherListDiv = document.getElementById('listbelow');
    } else {
        listDiv = document.getElementById('listbelow');
        otherListDiv = document.getElementById('listleft');
    }
    otherListDiv.style.visibility = 'hidden';
    listDiv.innerHTML = listHtml;
    listDiv.style.visibility = 'visible';
    listDiv.style.overflowY = 'scroll';
    listDiv.style.padding = '3px';
    if (arrangement == 'h') {
        listDiv.style.width = '20%';
        listDiv.style.height = '100%';
        listDiv.style.position = 'relative';
        mapDiv.style.position = 'relative';
        mapDiv.style.height = '100%';
    } else {
        var textHeightPercentage = 30;
        listDiv.style.height = (textHeightPercentage - 1).toString() + '%';
        listDiv.style.bottom = 0;
        listDiv.style.left = 0;
        listDiv.style.right = 0;
        listDiv.style.position = 'absolute';
        mapDiv.style.position = 'absolute';
        mapDiv.style.top = 0;
        mapDiv.style.left = 0;
        mapDiv.style.height = (100 - textHeightPercentage).toString() + '%';
        mapDiv.style.width = '100%';
    }
    map.invalidateSize(true);
}

function showMarker(id) {
    var marker = id2marker[id];
    if (marker) {
        marker.openPopup();
        map.setView(marker.getLatLng(), 13);
    } else {
        alert('Sorry, no marker with id ' + id);
    }
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function adjustHistory() {
    var func = URLchanged ? history.replaceState : history.pushState;
    if (func) {
        func.call(history, null, null, q.toString('&'));
        q = new HTTP.Query;
        URLchanged = true;
    }
}

