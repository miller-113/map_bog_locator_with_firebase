import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { database, ref, onValue, set, remove, push } from "./firebase";

mapboxgl.accessToken = process.env.REACT_APP_MAP_BOX_ACCESS_TOKEN;

const Map = () => {
  const mapContainerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [dataUpdated, setDataUpdated] = useState(false);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-87.65, 41.84],
      zoom: 10,
    });

    setMap(map);
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("markers", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "markers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#51bbd6",
            100,
            "#f1f075",
            750,
            "#f28cb1",
          ],
          "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "markers",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "markers",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#11b4da",
          "circle-radius": 5,
        },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0].properties.cluster_id;
        map.getSource("markers").getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom,
          });
        });
      });

      map.on("click", "unclustered-point", (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const timestamp = e.features[0].properties.Timestamp;

        new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setHTML(`<p>Timestamp: ${timestamp}</p>`)
          .addTo(map);
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    const questsRef = ref(database, "quests");
    const listener = onValue(questsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const newClusterData = Object.keys(data).map((key) => {
          const quest = data[key];
          const { Location, Timestamp } = quest;
          const [lng, lat] = Location.split(",").map(Number);

          return {
            type: "Feature",
            properties: { id: key, Timestamp },
            geometry: {
              type: "Point",
              coordinates: [lng, lat],
            },
          };
        });

        if (map.getSource("markers")) {
          map.getSource("markers").setData({
            type: "FeatureCollection",
            features: newClusterData,
          });
        }
        setDataUpdated(true);
      }
    });

    return () => {
      listener();
    };
  }, [map]);

  const handleMapClick = useCallback(
    (event) => {
      const { lng, lat } = event.lngLat || {};
      if (lng === undefined || lat === undefined) {
        console.error("lngLat is undefined");
        return;
      }

      const newQuestRef = push(ref(database, "quests"));
      set(newQuestRef, {
        Location: `${lng},${lat}`,
        Timestamp: new Date().toISOString(),
      });

      const newFeature = {
        type: "Feature",
        properties: { id: newQuestRef.key, Timestamp: new Date().toISOString() },
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      };

      if (map.getSource("markers")) {
        map.getSource("markers").setData((prevData) => {
          const features = prevData.features || [];
          return {
            type: "FeatureCollection",
            features: [...features, newFeature],
          };
        });
      }
    },
    [map]
  );

  useEffect(() => {
    if (map) {
      map.on("click", handleMapClick);
      return () => {
        map.off("click", handleMapClick);
      };
    }
  }, [map, handleMapClick]);

  const handleClearMarkers = useCallback(() => {
    remove(ref(database, "quests"));
    if (map.getSource("markers")) {
      map.getSource("markers").setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [map]);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw" }}>
      <div
        className="map-container"
        ref={mapContainerRef}
        style={{ width: "100%", height: "100%" }}
      />
      <button
        onClick={handleClearMarkers}
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          padding: "10px",
          backgroundColor: "#fff",
          border: "2px solid #000",
          borderRadius: "5px",
          cursor: "pointer",
          zIndex: 1,
        }}
      >
        Delete all
      </button>
    </div>
  );
};

export default Map;
