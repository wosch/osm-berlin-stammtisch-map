// URL layout, lang detection
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

    map.on('overlayadd', function(e) {
        var overlayDef;
        for (var i = 0; i < overlayDefs.length; i++) {
            if (overlayDefs[i].layer == e.layer) {
                overlayDef = overlayDefs[i];
                break;
            }
        }
        if (overlayDef.geojsonurl && !overlayDef._geojsonloaded) {
            overlayDef._geojsonloaded = true;
            var xhr = new XMLHttpRequest();
            xhr.open('GET', overlayDef.geojsonurl);
            xhr.responseType = 'json';
            xhr.onload = function() {
                if (xhr.status === 200) {
                    currentLayer = overlayDef.layer; // XXX hacky! must be set before calling addData (which would call onEachFeature callback)
                    var geojson = xhr.response;
                    var currentTimeSeconds = Math.floor(new Date().getTime() / 1000);
                    geojson.features = geojson.features.filter(function(feature) {
                        if (feature.properties["x-until"] && currentTimeSeconds > feature.properties["x-until"]) {
                            // console.log("skip " + feature.properties["name"] + " because of x-until");
                            return false;
                        }
                        if (feature.properties["x-from"] && currentTimeSeconds < feature.properties["x-from"]) {
                            // console.log("skip " + feature.properties["name"] + " because of x-from");
                            return false;
                        }
                        return true;
                    });
                    overlayDef.layer.addData(geojson);
                }
            };
            xhr.send();
        }
    });

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
    map.on('overlayadd', function(e) {
        for (var i = 0; i < overlayDefs.length; i++) {
            if (overlayDefs[i].layer == e.layer) {
                var abbrev = overlayDefs[i].abbrev;
                var val = q.get('l');
                if (val != null) {
                    if (!val.match("(^|,)" + abbrev + "(,|$)")) {
                        val += ',' + abbrev;
                    }
                } else {
                    val = abbrev;
                }
                q.set('l', val);
                adjustHistory();
                return;
            }
        }
    });
    map.on('overlayremove', function(e) {
        for (var i = 0; i < overlayDefs.length; i++) {
            if (overlayDefs[i].layer == e.layer) {
                var abbrev = overlayDefs[i].abbrev;
                var oldval = q.get('l').split(',');
                var newval = oldval.filter(function(e) {
                    return e != abbrev
                }).join(',');
                if (newval == '') {
                    q.unset('l');
                } else {
                    q.set('l', newval);
                }
                adjustHistory();
                return;
            }
        }
    });

    var setViewLatLng;
    var setViewZoom;
    var setViewLayer;

    id2marker = {};

    if (initialRouteGeojson) {
        showRoute(initialRouteGeojson);
        setViewLatLng = L.GeoJSON.coordsToLatLng(initialRouteGeojson.geometry.coordinates[0]);
    } else if (initialGeojson) {
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

function getSearchCoordParams(startPoint, goalPoint) {
    return "startc_wgs84=" + startPoint.lng + "," + startPoint.lat + ";zielc_wgs84=" + goalPoint.lng + "," + goalPoint.lat;
}

// XXX do not hardcode!
var commonSearchParams = ";pref_seen=1;pref_speed=20;pref_cat=;pref_quality=;pref_green=;scope=;referer=bbbikeleaflet;output_as=geojson";

function searchRoute(startPoint, goalPoint) {
    searchState = 'searching';
    var searchCoordParams = getSearchCoordParams(startPoint, goalPoint);
    var requestLine = cgiURL + "?" + searchCoordParams + commonSearchParams;
    var routeRequest = new XMLHttpRequest();
    routeRequest.open("GET", requestLine, true);
    setLoadingMarker(goalPoint);
    routeRequest.onreadystatechange = function() {
        showRouteResult(routeRequest);
    };
    routeRequest.send(null);
}

function showRouteResult(request) {
    if (request.readyState == 4) {
        if (request.status != 200) {
            alert("Error calculating route: " + request.statusText + " (status=" + request.status + ")");
        } else {
            var geojson;
            var json = "geojson = " + request.responseText;
            eval(json);
            showRoute(geojson);
            if (show_feature_list) {
                populateRouteList(geojson);
            }
        }
        map.removeLayer(loadingMarker);
        searchState = 'start';
    }
}

function showRoute(geojson) {
    routeLayer.clearLayers();
    routeLayer.addData(geojson);
    var coordinatesLength = geojson.geometry.coordinates.length;
    if (coordinatesLength) {
        setStartMarker(L.GeoJSON.coordsToLatLng(geojson.geometry.coordinates[0]));
        setGoalMarker(L.GeoJSON.coordsToLatLng(geojson.geometry.coordinates[coordinatesLength - 1]));
    }
}

function setStartMarker(latLng) {
    if (!startMarker) {
        startMarker = new L.Marker(latLng, {
            icon: startIcon
        });
    } else {
        startMarker.setLatLng(latLng);
    }
    map.addLayer(startMarker);
}

function setGoalMarker(latLng) {
    if (!goalMarker) {
        goalMarker = new L.Marker(latLng, {
            icon: goalIcon
        });
    } else {
        goalMarker.setLatLng(latLng);
    }
    map.addLayer(goalMarker);
}

function setLoadingMarker(latLng) {
    if (!loadingMarker) {
        loadingMarker = new L.Marker(latLng, {
            icon: loadingIcon
        });
    } else {
        loadingMarker.setLatLng(latLng);
    }
    map.addLayer(loadingMarker);
}

function populateRouteList(geojson) {
    var result = geojson.properties.result;
    var route = result.Route;

    var html = "<div>Länge: " + sprintf("%.2f", result.Len / 1000) + " km</div>\n";

    var pref_speed;
    var pref_time;
    for (var speed in result.Speed) {
        if (result.Speed[speed].Pref == "1") {
            pref_speed = speed;
            pref_time = result.Speed[speed].Time;
            break;
        }
    }
    if (pref_speed) {
        var h = parseInt(pref_time);
        var m = parseInt((pref_time - h) * 60);
        html += "<div>Fahrzeit (" + pref_speed + " km/h): " + h + "h" + m + "min</div>\n";
    }

    // XXX duplicated in cgi
    var rawDirectionToArrow = {
        'l': '&#x21d0;',
        'hl': '&#x21d6;',
        'hr': '&#x21d7;',
        'r': '&#x21d2;',
        'u': '&#x21b6;',
    };
    html += "<table>\n";
    html += "<tr><th>Etappe</th><th></th><th>Straße</th></tr>\n";
    for (var i = 0; i < route.length; i++) {
        var elem = route[i];
        html += "<tr>";
        html += "<td style='text-align:right;'>" + sprintf("%.2f", elem.Dist / 1000) + " km</td>";
        html += "<td>" + (rawDirectionToArrow[elem.Direction] || '') + "</td>";
        var coord = L.GeoJSON.coordsToLatLng(geojson.geometry.coordinates[elem.PathIndex]);
        html += '<td onclick="showStreet(' + "'" + escapeHtml(elem.Strname) + "'" + ', ' + coord.lat + ',' + coord.lng + ')">' + escapeHtml(elem.Strname) + "</a></td>";
        html += "</tr>\n";
    }
    html += "</table>\n";
    html += "</div>\n";

    setFeatureListContent(html);
}

function showStreet(strname, lat, lng) {
    map.openPopup(strname, new L.LatLng(lat, lng));
}

// from https://gist.github.com/BMintern/1795519
// XXX is this fine or too hackish?


function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function getLineStringCenter(latLngArray) {
    if (latLngArray.length == 1) {
        return latLngArray[0];
    }
    var len = 0;
    for (var i = 1; i < latLngArray.length; i++) {
        len += latLngArray[i].distanceTo(latLngArray[i - 1]);
    }
    var len0 = 0;
    for (var i = 1; i < latLngArray.length; i++) {
        len0 += latLngArray[i].distanceTo(latLngArray[i - 1]);
        if (len0 > len / 2) {
            // XXX ungenau, besser machen!
            var newLat = (latLngArray[i].lat - latLngArray[i - 1].lat) / 2 + latLngArray[i - 1].lat;
            var newLng = (latLngArray[i].lng - latLngArray[i - 1].lng) / 2 + latLngArray[i - 1].lng;
            return L.latLng(newLat, newLng);
        }
    }
    // should never be reached
}

function adjustHistory() {
    var func = URLchanged ? history.replaceState : history.pushState;
    if (func) {
        func.call(history, null, null, q.toString('&'));
        q = new HTTP.Query;
        URLchanged = true;
    }
}

////////////////////////////////////////////////////////////////////////

function AccelHandler() {
    this.scrollarray = new ScrollArray(20);
}

AccelHandler.prototype.start = function() {
    var _this = this;
    this.devicemotionlistener = function(event) {
        var now = Date.now();
        var g = event.accelerationIncludingGravity;
        _this.scrollarray.push({
            'x': g.x,
            'y': g.y,
            'z': g.z,
            'time': now
        });
    };
    this.scrollarray.empty();
    window.addEventListener("devicemotion", this.devicemotionlistener, true);
};

AccelHandler.prototype.stop = function() {
    if (this.devicemotionlistener) {
        window.removeEventListener("devicemotion", this.devicemotionlistener, true);
        this.devicemotionlistener = null;
    }
};

AccelHandler.prototype.flush = function() {
    var res = this.scrollarray.as_array();
    this.scrollarray.empty();
    return res;
};

//////////////////////////////////////////////////////////////////////

function TrackSegs() {
    this.init();
}
TrackSegs.prototype.init = function() {
    this.polyline = [
        []
    ];
    this.upload = [
        []
    ];
};
TrackSegs.prototype.addPos = function(e, accelres) {
    this.polyline[this.polyline.length - 1].push(e.latlng);
    if (enable_upload) {
        var uplRec = {
            lat: this._trimDigits(e.latlng.lat, 6),
            lng: this._trimDigits(e.latlng.lng, 6),
            acc: this._trimDigits(e.pos.coords.accuracy, 1),
            time: e.pos.timestamp
        };
        if (e.pos.coords.altitude != null) {
            uplRec.alt = e.pos.coords.altitude;
        }
        if (e.pos.coords.altitudeAccuracy != null) {
            uplRec.altacc = this._trimDigits(e.pos.coords.altitudeAccuracy, 1);
        }
        if (accelres) {
            var accelUplRecs = [];
            var firstTime;
            for (var i = 0; i < accelres.length; i++) {
                var accelUplRec = {
                    x: this._trimDigits(accelres[i].x, 2),
                    y: this._trimDigits(accelres[i].y, 2),
                    z: this._trimDigits(accelres[i].z, 2)
                };
                if (i == 0) {
                    accelUplRec.time = accelres[i].time;
                    firstTime = accelres[i].time;
                } else {
                    accelUplRec.dt = accelres[i].time - firstTime;
                }
                accelUplRecs.push(accelUplRec);
            }
            uplRec.accel = accelUplRecs;
        }
        this.upload[this.upload.length - 1].push(uplRec);
    }
};
TrackSegs.prototype.addGap = function(e) {
    this.polyline.push([]);
    this.upload.push([]);
};
TrackSegs.prototype._trimDigits = function(num, digits) {
    return num.toString().replace(new RegExp("(\\.\\d{" + digits + "}).*"), "$1");
};
TrackSegs.prototype.lastKmH = function(smooth) {
    if (!smooth || smooth < 2) {
        smooth = 2;
    }
    // XXX this.upload is only available with enable_upload!!!
    if (this.upload.length >= 1) {
        var lastSeg = this.upload[this.upload.length - 1];
        if (lastSeg.length >= smooth) {
            var prelastUpl = lastSeg[lastSeg.length - smooth];
            var lastUpl = lastSeg[lastSeg.length - 1];
            var timedelta = lastUpl.time - prelastUpl.time;
            if (timedelta <= 0) {
                return null;
            }
            var lastPolySeg = this.polyline[this.polyline.length - 1];
            var prelastPoly = lastPolySeg[lastPolySeg.length - smooth];
            var lastPoly = lastPolySeg[lastPolySeg.length - 1];
            var metersdelta = lastPoly.distanceTo(prelastPoly);
            return 3.6 * metersdelta / (timedelta / 1000); // m/s -> km/h
        }
    }
    return null;
};
