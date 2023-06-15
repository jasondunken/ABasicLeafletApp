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

// STORET webservices
const url_stations_base = "https://www.waterqualitydata.us/data/Station/search?";
let url_station_request = "";

/* --- https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/ --- */
// catchments
const url_NP21_catchments =
    "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/Catchments_NP21_Simplified/MapServer/0";
// WBD - HUC_8
const url_NP21_huc8 = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/WBD_NP21_Simplified/MapServer/2";
// flowlines
const url_NP21_flowlines = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/NHDSnapshot_NP21/MapServer/0";
// water monitoring locations
const url_NP21_monitor_locations =
    "https://watersgeo.epa.gov/arcgis.rest/services/NHDPlus_NP21/STORET_NP21/MapServer/0";

// build base map
let map = L.map("map").setView([dLat, dLng], dZoom);
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

// build app layers
const catchments_ml = L.esri
    .featureLayer({
        url: url_NP21_catchments,
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

const flowlines_ml = L.esri
    .featureLayer({
        url: url_NP21_flowlines,
    })
    .addTo(map);

// web services ------------------------------------------------------------------------------------------------->>>

// this code lifted from:
// https://www.epa.gov/waterdata/point-indexing-service / https://codepen.io/WATERS_SUPPORT/pen/ByVmKw?editors=0110

/* The Point Indexing service is a subset component of the Event Indexing Service
 * providing a simplified point indexing function for linking a point to the
 * NHDPlus hydrology network via either a straightforward shortest distance snap or via raindrop indexing
 * utilizing the NHDPlus flow direction grid.
 * The service returns the point, information about the indexing action
 * and NHD flowline information describing the nearest NHD hydrography.
 */

// Add layers to hold the service results
let snapline = L.geoJson().addTo(map);
let streamline = L.geoJson().addTo(map);
let searchStartStream = L.geoJson().addTo(map);
let station_layer = L.geoJson().addTo(map);

const service_url = "https://ofmpub.epa.gov/waters10/";

let pPoint = "POINT(" + input_lng.value + " " + input_lat.value + ")"; // this is the point "POINT(lng lat)"

function getStreamNetwork() {
    // Load the parameters to pass to the service
    let data = {
        pGeometry: "POINT(" + input_lng.value + " " + input_lat.value + ")",
        pGeometryMod: "WKT,SRSNAME=urn:ogc:def:crs:OGC::CRS84",
        pPointIndexingMethod: "DISTANCE",
        pPointIndexingRaindropDist: 0,
        pPointIndexingMaxDist: 25,
        pOutputPathFlag: "TRUE",
        pReturnFlowlineGeomFlag: "FALSE",
    };

    // Use ESRI request module to call service
    L.esri.get(service_url + "PointIndexing.Service", data, get_callback);
}

// Callback function on service completion
function get_callback(err, response) {
    if (err) {
        console.log("ERROR: " + err);
        return false;
    }

    // validate response
    let srv_rez = response.output;
    if (srv_rez == null) {
        if (response.status.status_message !== null) {
            response_text = response.status.status_message;
        } else {
            response_text = "No results found!";
        }
        return false;
    }

    // extract data form response object
    let comid = srv_rez.ary_flowlines[0].comid;
    let measure = srv_rez.ary_flowlines[0].fmeasure;

    document.getElementById("output_ComID").value = comid;

    // removes previous snapline/streamline/station_layer
    snapline.clearLayers();
    streamline.clearLayers();
    searchStartStream.clearLayers();
    station_layer.clearLayers();

    // adds new snapline to layer
    let tmp_feature = geojson2feature(srv_rez.indexing_path);
    snapline.addData(tmp_feature).setStyle({
        color: "#FF0000",
        fillColor: "#FF0000",
    });

    var data = {
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

    // Use ESRI request module to call service
    L.esri.get(service_url + "UpstreamDownstream.Service", data, UD_get_callback);
}

// for testing purposes...
let shapeArray = [];
let entities_encountered = [];

function UD_get_callback(err, response) {
    // highlight upstream of search point
    let fl = response.output.flowlines_traversed;
    let streamColor = "#00F0F0";
    let startColor = "#00F000";

    // This is to color the start segment of the search, I tried to do this in the streamline layer (below) but it
    // could only use one color for all the elements in the layer(?)
    let searchStart = geojson2feature(fl[0].shape, "NHDFlowline " + fl[0].comid);
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

    /* NOT GETTING all USGS (NPGAGE) STATIONS WITH THE ABOVE METHOD, NOT SURE WHAT IS GOING ON */
    /* also, getting duplicates in the events_encountered list */

    // draw events_encountered
    for (let i = 0; i < response.output.events_encountered.length; i++) {
        let sEvent = response.output.events_encountered[i];
        let sFeatureId = sEvent.source_featureid;
        let sProgram = sEvent.source_program;
        shapeArray.push(sEvent.shape);
        entities_encountered = response.output.nearest_entities_encountered;
        console.log(
            "Event: " +
                i +
                " | shape: " +
                sEvent.shape.coordinates[0] +
                ":" +
                sEvent.shape.coordinates[1] +
                " | " +
                sProgram +
                " | " +
                sFeatureId
        );
        let tmp_feature = geojson2feature(sEvent.shape, sFeatureId, sProgram);
        let sMarker = L.geoJSON(tmp_feature)
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
// end of lifted code

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
    let lat = input_lat.value;
    let lng = input_lng.value;
    let within = input_within.value;
    let mimeType = input_mimeType.value;

    return url_stations_base + "lat=" + lat + "&long=" + lng + "&within=" + within + "&mimeType=" + mimeType;
}

// app interaction
function onMapClick(e) {
    station_sites.remove();
    origin_marker.remove();
    let latlng = e.latlng;
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

// janky method to force update all the html fields
let response_text = "";
function updateDataFields() {
    //$("#request1").text("request 1: " + url_surface_water_features);
    $("#request1").text("url_NP21_flowlines: " + url_NP21_flowlines);
    $("#request2").text("url_NP21_catchments: " + url_NP21_catchments);
    $("#request3").text("url_NP21_HUC8: " + url_NP21_huc8);
    $("#request4").text("url_station_request: " + url_station_request);
    $("#responseCode").text(http.status);
    $("#output").text(response_text);
}

let layer_options;
function updateLayerGroups() {
    if (layer_options) {
        layer_options.remove();
    }
    let overlayMaps = {
        "Station Sites": station_sites,
        "HUC8 Boundaries": boundaries_ml,
        Catchments: catchments_ml,
        "Flow Lines": flowlines_ml,
    };
    layer_options = L.control.layers(null, overlayMaps);
    layer_options.addTo(map);
}
updateDataFields();
updateLayerGroups();
