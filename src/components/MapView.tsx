import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { MapsResult } from '../lib/mapsSearch'

export interface MapPoint {
  lat: number
  lng: number
}


/**
 * Mapa da busca: ponto central, círculo do raio e as empresas encontradas.
 * Clicar no mapa escolhe um novo centro.
 */
export function MapView({
  center,
  radiusKm,
  results,
  onPick,
  locked,
}: {
  center: MapPoint | null
  radiusKm: number
  results: MapsResult[]
  onPick: (p: MapPoint) => void
  locked?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<{ circle: L.Circle | null; pin: L.CircleMarker | null; results: L.LayerGroup | null; tiles: L.TileLayer | null }>({ circle: null, pin: null, results: null, tiles: null })
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  // Cria o mapa uma vez
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([-15.78, -47.93], 4)
    // OpenStreetMap; no tema escuro as peças são escurecidas por CSS (.xs-map-tiles)
    layer.current.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'xs-map-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layer.current.results = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (!lockedRef.current) pickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
    }
  }, [])

  // Centro e raio
  useEffect(() => {
    const m = map.current
    if (!m) return
    layer.current.circle?.remove()
    layer.current.pin?.remove()
    if (!center) return
    const ll = L.latLng(center.lat, center.lng)
    layer.current.circle = L.circle(ll, { radius: radiusKm * 1000, color: '#3b82f6', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.08, interactive: false }).addTo(m)
    layer.current.pin = L.circleMarker(ll, { radius: 6, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(m)
    m.fitBounds(layer.current.circle.getBounds(), { padding: [24, 24], animate: true, maxZoom: 15 })
  }, [center?.lat, center?.lng, radiusKm]) // eslint-disable-line react-hooks/exhaustive-deps

  // Empresas encontradas
  useEffect(() => {
    const group = layer.current.results
    if (!group) return
    group.clearLayers()
    for (const r of results) {
      if (!r.lat && !r.lng) continue
      L.circleMarker([r.lat, r.lng], {
        radius: 5,
        color: '#0b0c0f',
        weight: 1.5,
        fillColor: r.recurring ? '#a1a1aa' : r.website ? '#60a5fa' : '#3fb97f',
        fillOpacity: 1,
      })
        .bindTooltip(`<strong>${escapeHtml(r.name)}</strong><br/>${r.website ? 'Tem site' : 'Sem site'}${r.rating ? ` · ${r.rating.toFixed(1)}★` : ''}`, { direction: 'top', offset: [0, -4] })
        .addTo(group)
    }
  }, [results])

  return <div ref={el} className="xs-map size-full min-h-[280px] rounded-[10px]" />
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
