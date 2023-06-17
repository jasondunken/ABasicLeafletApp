const dLat = 33.95;
const dLng = -83.383333;
const dWithin = 5;
const dMimeType = "geojson";
const dZoom = 13;

// setting the form default values
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
    getMonitoringStationData();
});

// public api endpoints
/* --- https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/ --- */
// flowlines
const url_NP21_flowlines = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/NHDSnapshot_NP21/MapServer/0";
// catchments
const url_NP21_catchments =
    "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/Catchments_NP21_Simplified/MapServer/0";
// WBD - HUC_8
const url_NP21_huc8 = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/WBD_NP21_Simplified/MapServer/2";
request1.innerHTML = url_NP21_flowlines;
request2.innerHTML = url_NP21_catchments;
request3.innerHTML = url_NP21_huc8;

// point indexing service
const point_indexing_service_url = "https://ofmpub.epa.gov/waters10/PointIndexing.Service";
const up_down_service_url = "https://ofmpub.epa.gov/waters10/UpstreamDownstream.Service";

// water monitoring locations
const url_NP21_monitor_locations =
    "https://watersgeo.epa.gov/arcgis.rest/services/NHDPlus_NP21/STORET_NP21/MapServer/0";
// STORET webservices
const url_stations_base = "https://www.waterqualitydata.us/data/Station/search";

// build base map
const map = L.map("map").setView([dLat, dLng], dZoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

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

const boundaries_huc8_ml = L.esri
    .featureLayer({
        url: url_NP21_huc8,
        minZoom: 7,
    })
    .addTo(map);
boundaries_huc8_ml.setStyle({
    color: "green",
    fillOpacity: 0,
});

// build icons
const dropperIcon = L.icon({
    iconUrl: "img/dropper.png",
    iconSize: [32, 32],
    iconAnchor: [0, 0],
    popupAnchor: [0, 32],
});
const beerCanIcon = L.icon({
    iconUrl: "img/beer-can.png",
    iconSize: [32, 32],
    iconAnchor: [0, 0],
    popupAnchor: [0, 32],
});

const snaplineColor = "#ff0000";
const streamStartColor = "#00F000";
const streamSegmentColor = "#00F0F0";

map.on("click", (event) => {
    setOrigin(event.latlng);
});

map.on("overlayadd", (event) => {
    streamline_ml.bringToFront();
});
map.on("layeradd", (event) => {
    streamline_ml.bringToFront();
});

// force update the map in case something in the dom has changed
// sometimes without this you can end up getting blank map tiles until you move/scale the map
map.invalidateSize();

const origin_marker = L.marker();
const snapline_ml = L.layerGroup();
const streamline_ml = L.featureGroup(); // needs to be a featureGroup is you want to use getBounds() on it
const stream_events_ml = L.layerGroup();
const monitoring_stations_ml = L.featureGroup();

const layers = {
    "Flow Lines": flowlines_ml,
    "Catchment Boundaries": catchments_ml,
    "HUC8 Boundaries": boundaries_huc8_ml,
    "Stream Events": stream_events_ml,
    "Monitoring Stations": monitoring_stations_ml,
};
const layer_options = L.control.layers(null, layers);
layer_options.addTo(map);

function setOrigin(latLng) {
    origin_marker.unbindPopup();
    snapline_ml.clearLayers();
    streamline_ml.clearLayers();
    stream_events_ml.clearLayers();

    origin_marker.setLatLng([latLng.lat, latLng.lng]);
    origin_marker.bindPopup(`Search origin <br> lat ${latLng.lat.toFixed(6)} <br> lng ${latLng.lng.toFixed(6)}`);
    origin_marker.addTo(map);

    // update the form
    input_lat.value = latLng.lat;
    input_lng.value = latLng.lng;
}

async function getStreamNetwork() {
    const pointIndex = await callPointIndexingService();
    const result = await callUpDownService(pointIndex);
    console.log("result: ", result);
}

function callPointIndexingService() {
    const parameters = {
        pGeometry: "POINT(" + input_lng.value + " " + input_lat.value + ")",
        pGeometryMod: "WKT,SRSNAME=urn:ogc:def:crs:OGC::CRS84",
        pPointIndexingMethod: "DISTANCE",
        pPointIndexingRaindropDist: 0,
        pPointIndexingMaxDist: 25,
        pOutputPathFlag: "TRUE",
        pReturnFlowlineGeomFlag: "FALSE",
    };
    const requestString = buildRequest(point_indexing_service_url, parameters);
    request4.innerHTML = requestString;

    return new Promise(async (resolve, reject) => {
        const response = await fetch(requestString);

        let pointIndexData = null;
        try {
            pointIndexData = await response.json();
        } catch (error) {
            console.log("error: ", error);
        }

        if (pointIndexData?.output) {
            addSnapLine(pointIndexData.output);
            resolve(pointIndexData.output);
        } else {
            reject(response);
        }
    });
}

function callUpDownService(pointIndex) {
    const comid = pointIndex.ary_flowlines[0].comid;
    const measure = pointIndex.ary_flowlines[0].fmeasure;
    const parameters = {
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
    const requestString = buildRequest(up_down_service_url, parameters);
    request5.innerHTML = requestString;

    return new Promise(async (resolve, reject) => {
        const response = await fetch(requestString);

        let streamData = null;
        try {
            streamData = await response.json();
        } catch (error) {
            console.log("error: ", error);
        }

        if (streamData?.output) {
            addStreamLine(comid, streamData.output.flowlines_traversed);
            addStreamEvents(streamData.output.events_encountered);
            output1.innerHTML = `comids found ${streamData.output.flowlines_traversed?.length}`;
            resolve(streamData.output);
        } else {
            reject(response);
        }
    });
}

function addSnapLine(pointIndex) {
    const feature = polyline(pointIndex.indexing_path.coordinates);
    feature.setStyle({
        color: snaplineColor,
        weight: 4,
    });
    snapline_ml.addLayer(feature);
    snapline_ml.addTo(map);
}

function addStreamLine(pPointComid, flowlines) {
    for (let i in flowlines) {
        const flowline = flowlines[i];
        const feature = polyline(flowline.shape.coordinates);
        let color = streamSegmentColor;
        if (flowline.comid === pPointComid) {
            color = streamStartColor;
        }
        feature.setStyle({
            color,
            weight: 4,
        });
        streamline_ml.addLayer(feature);
        feature.bindTooltip(`comid ${flowline.comid}`);
    }
    streamline_ml.addTo(map);
    map.fitBounds(streamline_ml.getBounds());
}

function addStreamEvents(events) {
    // events are "gages" encountered (pEventList items)
    for (let i = 0; i < events?.length; i++) {
        const event = events[i];
        const latLng = flipCoord(event.shape.coordinates);
        const marker = L.marker(latLng, { icon: dropperIcon });
        marker.markerInfo = `
            comid ${event.comid} <br>
            gageID ${event.source_featureid} <br>
            origin ${event.source_originator}
        `;
        marker.bindPopup(marker.markerInfo);
        marker.on("click", (clickEvent) => {
            output1.innerHTML = clickEvent.target.markerInfo;
        });
        marker.addTo(stream_events_ml);
    }
    stream_events_ml.addTo(map);
}

async function getMonitoringStationData() {
    monitoring_stations_ml.clearLayers();

    const parameters = {
        lat: input_lat.value,
        long: input_lng.value,
        within: input_within.value,
        mimeType: input_mimeType.value,
    };

    let url_station_request = buildRequest(url_stations_base, parameters);
    request6.innerHTML = url_station_request;

    return new Promise(async (resolve, reject) => {
        let response = await fetch(url_station_request);

        let stationData = null;
        try {
            stationData = await response.json();
        } catch (error) {
            console.log("error: ", error);
        }

        if (stationData?.features) {
            output2.innerHTML = `stations found ${stationData?.features?.length}`;
            addMonitoringStations(stationData);
            resolve(stationData);
        } else {
            reject(response);
        }
    });
}

function addMonitoringStations(stationData) {
    for (let feature of stationData?.features) {
        const marker = L.marker(flipCoord(feature.geometry.coordinates), { icon: beerCanIcon });
        marker.markerInfo = `
            huc8 ${feature.properties.HUCEightDigitCode} <br>
            locationID ${feature.properties.MonitoringLocationIdentifier} <br>
            location ${feature.properties.MonitoringLocationName} <br>
            org ${feature.properties.OrganizationFormalName}
        `;
        marker.bindPopup(marker.markerInfo);
        marker.addTo(monitoring_stations_ml);
        marker.on("click", (e) => {
            output2.innerHTML = e.target.markerInfo;
        });
    }
    monitoring_stations_ml.addTo(map);
}

// turns url + parameters{} into a url query string
function buildRequest(url, parameters) {
    let requestURL = url + "?";
    const params = Object.keys(parameters);
    requestURL += `${params[0]}=${parameters[params[0]]}`;
    for (let i = 1; i < params.length; i++) {
        requestURL += `&${params[i]}=${parameters[params[i]]}`;
    }
    return requestURL;
}

/**
 * the output from the endpoints used to gather data
 * return coordinates in [longitude, latitude] format,
 * Leaflet expects them in [latitude, longitude] format
 */

// polyline is just a wrapper around Leaflet.polyline that
// lets you build a polyline layer with coords in inverted order
function polyline(coords, options) {
    return L.polyline(lngLatArr2LatLngArr(coords, options));
}

function lngLatArr2LatLngArr(coords) {
    for (let coord of coords) {
        coord = flipCoord(coord);
    }
    return coords;
}

function flipCoord(coord) {
    const temp = coord[0];
    coord[0] = coord[1];
    coord[1] = temp;
    return coord;
}
