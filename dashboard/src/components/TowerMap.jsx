import { useEffect, useMemo, useRef, useState } from "react";
import { formatProbability, sentenceCase } from "../lib/formatters";
import { googleMapsApiKey } from "../lib/runtimeConfig";

const statusColor = {
  green: "#1D9E75",
  amber: "#BA7517",
  red: "#E24B4A",
};

const GOOGLE_MAPS_CALLBACK = "__neuralnet5gGoogleMapsInit";

let googleMapsPromise = null;

function loadGoogleMapsApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only be loaded in the browser."));
  }

  if (!googleMapsApiKey) {
    return Promise.reject(new Error("Google Maps API key is not configured. Set VITE_GOOGLE_MAPS_API_KEY."));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    window[GOOGLE_MAPS_CALLBACK] = () => {
      delete window[GOOGLE_MAPS_CALLBACK];
      resolve(window.google.maps);
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&v=weekly&callback=${GOOGLE_MAPS_CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[GOOGLE_MAPS_CALLBACK];
      reject(new Error("Failed to load Google Maps JavaScript API."));
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function getTowerPosition(tower) {
  return {
    lat: tower.lat ?? tower.kpis.lat ?? 20.5,
    lng: tower.lon ?? tower.kpis.lon ?? 78.9,
  };
}

function getMetroKey(tower) {
  const city = tower.city ?? tower.kpis.city ?? tower.tower_id;
  const [metro] = city.split(" - ");
  return metro.split(" Sector")[0].trim();
}

function disperseTowers(towers) {
  const groups = new Map();

  towers.forEach((tower) => {
    const key = getMetroKey(tower);
    const group = groups.get(key) ?? [];
    group.push(tower);
    groups.set(key, group);
  });

  return [...groups.values()].flatMap((group) => {
    const positions = group.map(getTowerPosition);
    const center = positions.reduce(
      (accumulator, position) => ({
        lat: accumulator.lat + position.lat / group.length,
        lng: accumulator.lng + position.lng / group.length,
      }),
      { lat: 0, lng: 0 },
    );
    const longitudeScale = Math.max(0.5, Math.cos((center.lat * Math.PI) / 180));
    const ordered = [...group].sort((left, right) => left.tower_id.localeCompare(right.tower_id));

    return ordered.map((tower, index) => {
      const ring = Math.floor(index / 6);
      const ringIndex = index % 6;
      const itemsInRing = Math.min(6, ordered.length - ring * 6);
      const angle = ((Math.PI * 2) / Math.max(1, itemsInRing)) * ringIndex - Math.PI / 2;
      const radialDistance = 0.12 + ring * 0.07;

      return {
        tower,
        position: {
          lat: center.lat + Math.sin(angle) * radialDistance,
          lng: center.lng + (Math.cos(angle) * radialDistance) / longitudeScale,
        },
      };
    });
  });
}

function createMarkerIcon(maps, status, { selected = false, attention = false } = {}) {
  const color = statusColor[status] ?? statusColor.green;
  const size = attention ? 34 : selected ? 28 : 20;
  const glowOpacity = attention ? 0.42 : selected ? 0.24 : 0.12;
  const strokeOpacity = attention ? 0.95 : 0.78;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="${attention ? 16 : selected ? 14 : 12}" fill="${color}" opacity="${glowOpacity}" />
      <circle cx="20" cy="20" r="${attention ? 10.5 : selected ? 9 : 7.5}" fill="${color}" stroke="white" stroke-width="2" stroke-opacity="${strokeOpacity}" />
      <circle cx="20" cy="20" r="2.5" fill="white" opacity="0.95" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size / 2),
  };
}

export default function TowerMap({ towers, selectedTower, attentionTowerId, onSelectTower }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapError, setMapError] = useState("");

  const legendItems = useMemo(
    () => [
      ["green", "Nominal", "Stable"],
      ["amber", "Warning", "Watch"],
      ["red", "Critical", "Act now"],
    ],
    [],
  );

  const positionedTowers = useMemo(() => disperseTowers(towers), [towers]);
  const positionByTowerId = useMemo(
    () => new Map(positionedTowers.map((entry) => [entry.tower.tower_id, entry.position])),
    [positionedTowers],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      try {
        const maps = await loadGoogleMapsApi();
        if (cancelled || !mapElementRef.current || mapRef.current) return;

        mapRef.current = new maps.Map(mapElementRef.current, {
          center: { lat: 20.5, lng: 78.9 },
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#f8f7f5" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#5f6368" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#f8f7f5" }] },
            { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#e4e1dc" }] },
            { featureType: "landscape", elementType: "geometry.fill", stylers: [{ color: "#f3f1ee" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#ebe7e2" }] },
            { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#dde8f3" }] },
          ],
        });
      } catch (error) {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : "Unable to load Google Maps.");
        }
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !mapRef.current) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    const bounds = new maps.LatLngBounds();

    markersRef.current = positionedTowers.map(({ tower, position }) => {
      const isSelected = selectedTower?.tower_id === tower.tower_id;
      const isAttention = attentionTowerId === tower.tower_id;
      bounds.extend(position);

      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: tower.tower_id,
        zIndex: isAttention ? 300 : isSelected ? 220 : 100,
        icon: createMarkerIcon(maps, tower.status, { selected: isSelected, attention: isAttention }),
        animation: isAttention ? maps.Animation.BOUNCE : isSelected ? maps.Animation.DROP : undefined,
      });

      marker.addListener("click", () => onSelectTower(tower));
      return marker;
    });

    const activeTargetId = selectedTower?.tower_id ?? attentionTowerId;
    if (activeTargetId && positionByTowerId.has(activeTargetId)) {
      mapRef.current.panTo(positionByTowerId.get(activeTargetId));
      mapRef.current.setZoom(6);
    } else if (positionedTowers.length > 0) {
      mapRef.current.fitBounds(bounds, 80);
    }

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [attentionTowerId, onSelectTower, positionByTowerId, positionedTowers, selectedTower]);

  return (
    <>
      <div className="absolute bottom-5 left-5 z-[500] max-w-[220px] map-legend shadow-apple-lift backdrop-blur-[20px] backdrop-saturate-[180%] transition-transform duration-300 ease-apple hover:-translate-y-[2px] hover:shadow-apple-hover">
        <div className="map-legend__title">Map legend</div>
        <div className="map-legend__body">
          All 50 towers are rendered with metro spread so operators can scan national risk without overlapping pins.
        </div>
        <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
          {legendItems.map(([status, label, note]) => (
            <div key={status} className="map-legend__row">
              <span className={`map-legend__dot map-legend__dot--${status}`} />
              <span className="map-legend__row-label">{label}</span>
              <span className="map-legend__row-status">{note}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedTower ? (
        <div className="absolute right-5 top-5 z-[500] hidden max-w-[204px] rounded-[18px] bg-[rgba(245,245,247,0.88)] px-4 py-4 shadow-apple-lift backdrop-blur-[20px] backdrop-saturate-[180%] animate-fade-in transition-transform duration-300 ease-apple hover:-translate-y-[2px] md:block">
          <div className="text-[12px] font-semibold uppercase tracking-[0.12px] text-black/52">Selected tower</div>
          <div className="mt-2 text-[17px] font-semibold leading-[1.24] tracking-apple-tight text-black/84">
            {selectedTower.tower_id}
          </div>
          <div className="mt-1 text-[14px] leading-[1.29] tracking-apple-caption text-black/68">
            {sentenceCase(selectedTower.fault_type)}
          </div>
          <div className="mt-3 text-[14px] leading-[1.29] tracking-apple-caption text-black/72">
            Risk {formatProbability(selectedTower.fault_probability)}
          </div>
        </div>
      ) : null}

      {mapError ? (
        <div className="flex h-full items-center justify-center bg-[#f5f5f7] px-6 text-center">
          <div className="max-w-[340px]">
            <div className="text-[21px] font-display font-semibold leading-[1.19] tracking-apple-loose text-black/84">
              Map unavailable
            </div>
            <div className="mt-2 text-[15px] leading-[1.42] tracking-apple-caption text-black/68">{mapError}</div>
          </div>
        </div>
      ) : (
        <div ref={mapElementRef} className="h-full w-full" />
      )}
    </>
  );
}
