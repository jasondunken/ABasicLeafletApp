const dLat = 33.95817804679789;
const dLng = -83.37995409965515;
const dWithin = 5;
const dMimeType = "geojson";
const dZoom = 13;

// adding eventListeners to the buttons
getStreamNetworkButton.addEventListener("click", (event) => {
    event.preventDefault();
    getStreamNetwork();
});
getMonitoringStationsButton.addEventListener("click", (event) => {
    event.preventDefault();
    getMonitoringStationData();
});

/* public api endpoints */
// flowlines
const url_NP21_flowlines = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/NHDSnapshot_NP21/MapServer/0";
// catchments
const url_NP21_catchments =
    "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/Catchments_NP21_Simplified/MapServer/0";
// WBD - HUC_8
const url_NP21_huc8 = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/WBD_NP21_Simplified/MapServer/2";
// point indexing service
const point_indexing_service_url = "https://api.epa.gov/waters/v1/pointindexing";
const up_down_service_url = "https://api.epa.gov/waters/v1/upstreamdownstream";
// STORET webservices
const url_station_data = "https://www.waterqualitydata.us/data/Station/search";

// set up map, base maps, overlay maps, map controls, and custom icons -------------------------------------------------------------------------
const map = L.map("map").setView([dLat, dLng], dZoom);

const baseMaps = {
    "Open Street Map": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map),
    "Nat Geo World Map": L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
        {
            attribution:
                "Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC",
        }
    ),
    "World Imagery": L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution:
                "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        }
    ),
    "World Topo Map": L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        {
            attribution:
                "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community",
        }
    ),
};

// overlay maps
const flowlines_ml = L.esri
    .featureLayer({
        url: url_NP21_flowlines,
        minZoom: 12,
    })
    .addTo(map);
// you can set/update the style after creation
// flowlines_ml.setStyle({
//     color: "orange",
//     fillOpacity: 0,  /*<= [0, 1]*/
// });

const catchments_ml = L.esri
    .featureLayer({
        url: url_NP21_catchments,
        minZoom: 14,
        color: "orange",
        fillOpacity: 0,
    })
    .addTo(map);

const boundaries_huc8_ml = L.esri
    .featureLayer({
        url: url_NP21_huc8,
        minZoom: 7,
        color: "green",
        fillOpacity: 0,
    })
    .addTo(map);

const origin_marker = L.marker();
const snapline_ml = L.layerGroup();
const streamline_ml = L.featureGroup(); // needs to be a featureGroup is you want to use getBounds() or bringToFront() on it
const stream_events_ml = L.layerGroup();
const monitoring_stations_ml = L.featureGroup();

const overlayMaps = {
    "Flow Lines": flowlines_ml,
    "Catchment Boundaries": catchments_ml,
    "HUC8 Boundaries": boundaries_huc8_ml,
    "Stream Events": stream_events_ml,
    "Monitoring Stations": monitoring_stations_ml,
};
const layer_options = L.control.layers(baseMaps, overlayMaps);
layer_options.addTo(map);

const legend = L.control({ position: "bottomleft" });
legend.onAdd = (map) => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML += "<h4>A Basic Leaflet App</h4>";
    div.innerHTML += '<i style="background: #ff0000"></i><span>Snapline</span><br>';
    div.innerHTML += '<i style="background: #00F000"></i><span>Pour Point</span><br>';
    div.innerHTML += '<i style="background: #00F0F0"></i><span>Stream Network</span><br>';
    div.innerHTML +=
        '<i style="background-image: url(img/dropper.png);background-size: contain;"></i><span>Stream Event</span><br>';
    div.innerHTML +=
        '<i style="background-image: url(img/beer-can.png);background-size: contain;"></i><span>Monitoring Station</span><br>';
    return div;
};
legend.addTo(map);

// build icons
/*
    iconSize:     [38, 95], // size of the icon
    shadowSize:   [50, 64], // size of the shadow
    iconAnchor:   [22, 94], // point of the icon which will correspond to marker's location
    shadowAnchor: [4, 62],  // the same for the shadow
    popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
*/
const dropperIcon = L.icon({
    iconUrl: "img/dropper.png",
    iconSize: [32, 32],
    iconAnchor: [0, 32],
    popupAnchor: [5, 2],
});
const beerCanIcon = L.icon({
    iconUrl: "img/beer-can.png",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [5, 2],
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
// done setting up the map ----------------------------------------------------------------------------------------

// initialize form and data panel values
input_lat.value = dLat;
input_lng.value = dLng;
input_within.value = dWithin;
input_mimeType.value = dMimeType;

request1.innerHTML = url_NP21_flowlines;
request2.innerHTML = url_NP21_catchments;
request3.innerHTML = url_NP21_huc8;

setOrigin({ lat: dLat, lng: dLng });

// app functions
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
    loadingSpinner.style.display = "block";
    snapline_ml.clearLayers();
    streamline_ml.clearLayers();
    stream_events_ml.clearLayers();

    const pointIndex = await callPointIndexingService();
    const _ = await callUpDownService(pointIndex);
    loadingSpinner.style.display = "none";
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
        api_key: "XcG7zwVwPItaicv1FSfffyZ2ozxyMeD7Deox2ib1", // dev key from watersgeo.epa.gov/openapi/waters/# example
    };
    const requestString = buildRequest(point_indexing_service_url, parameters);
    request4.innerHTML = requestString;

    return new Promise(async (resolve, reject) => {
        const response = await fetch(requestString);

        let pointIndexData = null;
        try {
            pointIndexData = await response.json();
            console.log("data:", pointIndexData);
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
    if (!pointIndex.ary_flowlines) {
        return "error, invalid comid data, can't get stream data!";
    }
    const comid = pointIndex.ary_flowlines[0].comid;
    console.log("comid:", comid);
    const measure = pointIndex.ary_flowlines[0].fmeasure;
    const parameters = {
        pnavigationtype: "UT", // Upstream with tributaries
        pstartcomid: comid,
        // pstartpermanentidentifier
        // pstartreachcode
        // pstartmeasure
        // pstartsourcefeatureid
        // pstartsourceprogram
        // pstopcomid
        // pstoppermanentidentifier
        // pstopreachcode
        // pstopmeasure
        // pstopsourcefeatureid
        // pstopsourceprogram
        // pstopdistancekm
        // pstopbottomofpath
        // ptraversalsummary
        pflowlinelist: "TRUE",
        // peventlist
        // pnearestentitylist
        // f
        api_key: "XcG7zwVwPItaicv1FSfffyZ2ozxyMeD7Deox2ib1", // dev key from watersgeo.epa.gov/openapi/waters/# example
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
            console.log("streamData:", streamData);
            addStreamLine(comid, streamData.output.flowlines_traversed);
            addStreamEvents(streamData.output.events_encountered);
            const eventsEncountered = streamData.output.events_encountered?.length || 0;
            output1.innerHTML = `
                comids found ${streamData.output.flowlines_traversed?.length} | 
                events encountered ${eventsEncountered}
            `;
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

function getMonitoringStationData() {
    loadingSpinner.style.display = "block";
    monitoring_stations_ml.clearLayers();

    const parameters = {
        lat: input_lat.value,
        long: input_lng.value,
        within: input_within.value,
        mimeType: input_mimeType.value,
    };

    let url_station_request = buildRequest(url_station_data, parameters);
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
        loadingSpinner.style.display = "none";
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
