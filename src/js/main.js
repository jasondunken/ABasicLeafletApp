const dLat = 33.95;
const dLng = -83.383333;
const dWithin = 5;
const dMimeType = "geojson";
const dZoom = 13;

// setting the form initial values
input_lat.value = dLat;
input_lng.value = dLng;
input_within.value = dWithin;
input_mimeType.value = dMimeType;

// adding eventListeners to the buttons
getStreamNetworkButton.addEventListener("click", (event) => {
    event.preventDefault();
    getStreamNetwork();
});
getMonitoringStationsButton.addEventListener("click", (event) => {
    event.preventDefault();
    getMonitoringStations();
});

//Force Leaflet-ESRI GET requests to use JSONP <--- this is from the point-indexing-service example below
L.esri.get = L.esri.get.JSONP;

// public api endpoints
/* --- https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/ --- */
// flowlines
const url_NP21_flowlines = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/NHDSnapshot_NP21/MapServer/0";
// catchments
const url_NP21_catchments =
    "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/Catchments_NP21_Simplified/MapServer/0";
// WBD - HUC_8
const url_NP21_huc8 = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/WBD_NP21_Simplified/MapServer/2";

// point indexing service
const point_indexing_service_url = "https://ofmpub.epa.gov/waters10/PointIndexing.Service";
const up_down_service_url = "https://ofmpub.epa.gov/waters10/UpstreamDownstream.Service";

// water monitoring locations
const url_NP21_monitor_locations =
    "https://watersgeo.epa.gov/arcgis.rest/services/NHDPlus_NP21/STORET_NP21/MapServer/0";
// STORET webservices
const url_stations_base = "https://www.waterqualitydata.us/data/Station/search?";
let url_station_request = "";

// build base map
const map = L.map("map").setView([dLat, dLng], dZoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// build icons
const dropperIcon = L.icon({
    iconUrl: "img/32_32_dropper.png",
    iconSize: [32, 32],
    iconAnchor: [0, 0],
    popupAnchor: [0, 32],
});

// build map layers
const flowlines_ml = L.esri
    .featureLayer({
        url: url_NP21_flowlines,
        minZoom: 12,
    })
    .addTo(map);

const catchments_ml = L.esri
    .featureLayer({
        url: url_NP21_catchments,
        minZoom: 14,
    })
    .addTo(map);
catchments_ml.setStyle({
    color: "orange",
    fillOpacity: 0,
});

const boundaries_ml = L.esri
    .featureLayer({
        url: url_NP21_huc8,
    })
    .addTo(map);
boundaries_ml.setStyle({
    color: "red",
    fillOpacity: 0,
});

// force update the map in case something in the dom has changed
// sometimes with out this you can end up getting blank map tiles until you move/scale the map
map.invalidateSize();

// this code based on:
// https://www.epa.gov/waterdata/point-indexing-service / https://codepen.io/WATERS_SUPPORT/pen/ByVmKw?editors=0110
const snapline = L.geoJson().addTo(map);
const streamline = L.geoJson().addTo(map);
const searchStartStream = L.geoJson().addTo(map);
const station_layer = L.geoJson().addTo(map);

const pPoint = "POINT(" + input_lng.value + " " + input_lat.value + ")"; // this is the point "POINT(lng lat)"

function getStreamNetwork() {
    getPourPoint();
}

function getPourPoint() {
    const data = {
        pGeometry: "POINT(" + input_lng.value + " " + input_lat.value + ")",
        pGeometryMod: "WKT,SRSNAME=urn:ogc:def:crs:OGC::CRS84",
        pPointIndexingMethod: "DISTANCE",
        pPointIndexingRaindropDist: 0,
        pPointIndexingMaxDist: 25,
        pOutputPathFlag: "TRUE",
        pReturnFlowlineGeomFlag: "FALSE",
    };
    L.esri.get(point_indexing_service_url, data, pointIndexingResponse);
}

function pointIndexingResponse(error, response) {
    if (error) {
        console.log("point service error: ", error);
        return;
    }

    const pointIndex = response.output;
    if (pointIndex == null) {
        if (response.status.status_message !== null) {
            response_text = response.status.status_message;
        } else {
            response_text = "No results found!";
        }
        return;
    }
    addSnapLine(pointIndex);
    callUpDownService(pointIndex);
}

function addSnapLine(pointIndex) {
    snapline.clearLayers();

    const feature = geojson2feature(pointIndex.indexing_path);
    snapline.addData(feature).setStyle({
        color: "#FF0000",
        fillColor: "#FF0000",
    });
}

function callUpDownService(pointIndex) {
    const comid = pointIndex.ary_flowlines[0].comid;
    const measure = pointIndex.ary_flowlines[0].fmeasure;
    const data = {
        pNavigationType: "UT", // Upstream with tributaries
        pStartComid: comid,
        pStartMeasure: measure,
        pTraversalSummary: "TRUE",
        pFlowlinelist: "TRUE",
        pEventList: "10012,10030", // 10012 - STORET, Water Monitoring | 10030 - NPGAGE, USGS Streamgages from NHDPlus
        pEventListMod: ",",
        pStopDistancekm: 50, // if value is null, set to default value: 50km
        //"pStopDistancekm": options['input_within'].value,
        pNearestEntityList: "STORET,NPGAGE",
        pNearestEntityListMod: ",",
        //"optQueueResults": "THREADED", // using this option puts the request in a queue, must check for "complete"
        optOutPruneNumber: 8,
        optOutCS: "SRSNAME=urn:ogc:def:crs:OGC::CRS84",
    };
    L.esri.get(up_down_service_url, data, upDownResponse);
}

function upDownResponse(error, response) {
    if (error) {
        console.log("up/down service error: ", error);
        return;
    }
    streamline.clearLayers();
    searchStartStream.clearLayers();
    station_layer.clearLayers();
    // highlight upstream of search point
    const fl = response.output.flowlines_traversed;
    const streamColor = "#00F0F0";
    const startColor = "#00F000";

    // This is to color the start segment of the search, I tried to do this in the streamline layer (below) but it
    // could only use one color for all the elements in the layer(?)
    const searchStart = geojson2feature(fl[0].shape, "NHDFlowline " + fl[0].comid);
    searchStartStream.addData(searchStart).setStyle({
        color: startColor,
        weight: 4,
    });

    for (let i in fl) {
        let tmp_feature = geojson2feature(fl[i].shape, "NHDFlowline " + fl[i].comid, i + 10000);
        streamline.addData(tmp_feature).setStyle({
            color: streamColor,
            weight: 4,
        });
    }

    // "events" are gages encountered (pEventList items)
    for (let i = 0; i < response.output.events_encountered?.length; i++) {
        const sEvent = response.output.events_encountered[i];
        const sFeatureId = sEvent.source_featureid;
        const sProgram = sEvent.source_program;
        const tmp_feature = geojson2feature(sEvent.shape, sFeatureId, sProgram);
        const sMarker = L.geoJSON(tmp_feature)
            .bindPopup(i + " | " + tmp_feature.properties.id + "<br/>" + tmp_feature.properties.popupValue, {
                autoClose: false,
            })
            .addTo(station_layer);
        sMarker.openPopup();

        // Bring search start segment to front
        searchStartStream.bringToFront();
    }

    // centers map on result
    map.fitBounds(streamline.getBounds(), {
        maxZoom: 13,
    });
}

// Function to wrap GeoJSON geometry into a vanilla feature
function geojson2feature(p_geojson, p_popup_value, p_id) {
    if (p_geojson === undefined) {
        return null;
    }

    if (p_id === undefined || p_id == null) {
        p_id = 0;
    }

    const p_feature = {
        type: "Feature",
        properties: {
            id: p_id,
            popupValue: p_popup_value,
        },
        geometry: p_geojson,
    };

    return p_feature;
}

const http = new XMLHttpRequest();
let stations = "";
let stations_geojson = "";
let station_sites = L.geoJSON();
let origin_marker = L.marker();

// // connected to form send button
function getMonitoringStations() {
    url_station_request = buildRequest();

    http.open("GET", url_station_request, false);
    http.send();
    stations = http.responseText;
    stations_geojson = JSON.parse(stations);
    station_sites = L.geoJSON(stations_geojson, {
        pointToLayer: function (feature, latlng) {
            let marker = L.marker(latlng, { icon: dropperIcon });
            marker.markerInfo =
                feature.properties.HUCEightDigitCode + "\n" + feature.properties.MonitoringLocationIdentifier;
            marker.bindPopup(marker.markerInfo);
            marker.on("click", getFeatureData);
            return marker;
        },
    });
    station_sites.addTo(map);
    updateDataFields();
    updateLayerGroups();
}

function buildRequest() {
    // validate request
    const lat = input_lat.value;
    const lng = input_lng.value;
    const within = input_within.value;
    const mimeType = input_mimeType.value;

    return url_stations_base + "lat=" + lat + "&long=" + lng + "&within=" + within + "&mimeType=" + mimeType;
}

// map interaction
function onMapClick(e) {
    station_sites.remove();
    origin_marker.remove();
    const latlng = e.latlng;
    origin_marker = L.marker([latlng.lat, latlng.lng]).bindPopup("Search origin\n" + latlng.lat + " : " + latlng.lng);
    origin_marker.addTo(map);

    input_lat.value = latlng.lat;
    input_lng.value = latlng.lng;
}
map.on("click", onMapClick);

function getFeatureData(e) {
    document.getElementById("output_ComID").value = e.target.markerInfo;
    $("#output").text(e.target.markerInfo);
}

function updateDataFields() {
    request1.innerHTML = url_NP21_flowlines;
    request2.innerHTML = url_NP21_catchments;
    request3.innerHTML = url_NP21_huc8;
    request4.innerHTML = "url&stream_request";
    output1.innerHTML = http.status;
    request5.innerHTML = "url&station_request";
    output2.innerHTML = http.status;
}

let layer_options;
function updateLayerGroups() {
    if (layer_options) {
        layer_options.remove();
    }
    let overlayMaps = {
        "Flow Lines": flowlines_ml,
        Catchments: catchments_ml,
        "HUC8 Boundaries": boundaries_ml,
        "Station Sites": station_sites,
    };
    layer_options = L.control.layers(null, overlayMaps);
    layer_options.addTo(map);
}
updateDataFields();
updateLayerGroups();
