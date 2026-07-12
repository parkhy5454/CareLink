import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Vite 번들 환경에서 기본 마커 아이콘 경로가 깨지는 문제가 있어, 심플한 원형 아이콘으로 대체합니다.
function makeIcon(color) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
}

const hospitalIcon = makeIcon('#3D7FF2')
const meIcon = makeIcon('#12C79A')

function FitBounds({ points }) {
  const map = useMap()
  if (points.length > 0) {
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
  }
  return null
}

export default function HospitalMap({ hospitals, myLocation, onSelect }) {
  const points = hospitals.filter((h) => h.lat && h.lng)
  const center = myLocation || (points[0] ? { lat: points[0].lat, lng: points[0].lng } : { lat: 37.5665, lng: 126.978 })

  return (
    <div className="map-wrap">
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={meIcon}>
            <Popup>내 위치</Popup>
          </Marker>
        )}
        {points.map((h) => (
          <Marker key={h.code} position={[h.lat, h.lng]} icon={hospitalIcon}>
            <Popup>
              <div className="map-popup">
                <b>{h.name}</b>
                <p>{h.type} · {h.sido} {h.sigungu}</p>
                {h.distance_km != null && <p>약 {h.distance_km.toFixed(1)}km</p>}
                <button onClick={() => onSelect(h)}>이 병원 예약하기</button>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds points={myLocation ? [...points, myLocation] : points} />
      </MapContainer>
    </div>
  )
}
