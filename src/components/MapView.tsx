import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, MapMouseEvent, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import type { MapsResult } from '../lib/mapsSearch'

export interface MapPoint {
  lat: number
  lng: number
}

/** Mapa vetorial gratuito (OpenFreeMap, dados do OpenStreetMap), sem chave de API. */
const STYLE = {
  /** Colorido e legível */
  claro: 'https://tiles.openfreemap.org/styles/liberty',
  escuro: 'https://tiles.openfreemap.org/styles/dark',
}

export type MapStyle = keyof typeof STYLE

const STYLE_KEY = 'xs-prospeccao:estilo-mapa'

export function getMapStyle(): MapStyle {
  try {
    return localStorage.getItem(STYLE_KEY) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function saveMapStyle(style: MapStyle) {
  try {
    localStorage.setItem(STYLE_KEY, style)
  } catch {
    /* sem armazenamento */
  }
}

// Worker do MapLibre servido em /maplibre/ (ver vite.config.ts)
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

const AREA = 'xs-area'
const RESULTS = 'xs-results'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Círculo do raio como polígono (64 lados), em km reais na latitude do centro. */
function circle(center: MapPoint, radiusKm: number): Feature<Polygon> {
  const pts: [number, number][] = []
  const latKm = 110.574
  const lngKm = 111.32 * Math.cos((center.lat * Math.PI) / 180)
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push([center.lng + (Math.cos(a) * radiusKm) / lngKm, center.lat + (Math.sin(a) * radiusKm) / latKm])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }
}

function bounds(center: MapPoint, radiusKm: number): [[number, number], [number, number]] {
  const dLat = radiusKm / 110.574
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ]
}

function resultsData(results: MapsResult[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: results
      .filter((r) => r.lat || r.lng)
      .map((r) => ({
        type: 'Feature',
        properties: { name: r.name, site: r.website ? 1 : 0, recurring: r.recurring ? 1 : 0, rating: r.rating || 0 },
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      })),
  }
}

/** Nomes de ruas, bairros e cidades em português quando o mapa tiver. */
function portugueseLabels(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue
    const field = map.getLayoutProperty(layer.id, 'text-field')
    if (!field) continue
    map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:pt'], ['get', 'name_pt'], ['get', 'name:latin'], ['get', 'name']])
  }
}

/**
 * Mapa da busca: arraste o pino (ou clique no mapa) para escolher o centro;
 * o círculo mostra o raio e os pontos são as empresas encontradas.
 */
export function MapView({
  center,
  radiusKm,
  results,
  onPick,
  locked,
  mapStyle = 'claro',
  hideCircle,
}: {
  center: MapPoint | null
  radiusKm: number
  results: MapsResult[]
  onPick: (p: MapPoint) => void
  locked?: boolean
  mapStyle?: MapStyle
  /** Só enquadra a área, sem desenhar o círculo (a busca por cidade/bairro não usa raio) */
  hideCircle?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const pin = useRef<Marker | null>(null)
  const ready = useRef(false)
  const state = useRef({ center, radiusKm, results, locked })
  state.current = { center, radiusKm, results, locked }
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const animRadius = useRef(radiusKm)

  /** (Re)cria as camadas próprias — também depois de trocar o estilo claro/escuro. */
  function addLayers(m: MlMap) {
    portugueseLabels(m)
    const { center: c } = state.current
    m.addSource(AREA, { type: 'geojson', data: c ? circle(c, animRadius.current) : { type: 'FeatureCollection', features: [] } })
    m.addLayer({ id: `${AREA}-fill`, type: 'fill', source: AREA, paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12 } })
    m.addLayer({ id: `${AREA}-glow`, type: 'line', source: AREA, paint: { 'line-color': '#3b82f6', 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.35 } })
    m.addLayer({ id: `${AREA}-line`, type: 'line', source: AREA, paint: { 'line-color': '#bfdbfe', 'line-width': 1.8, 'line-dasharray': [2.4, 1.6] } })
    m.addSource(RESULTS, { type: 'geojson', data: resultsData(state.current.results) })
    m.addLayer({
      id: RESULTS,
      type: 'circle',
      source: RESULTS,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 14, 6.5],
        'circle-color': ['case', ['==', ['get', 'recurring'], 1], '#a1a1aa', ['==', ['get', 'site'], 1], '#60a5fa', '#3fb97f'],
        'circle-stroke-color': '#0b0c0f',
        'circle-stroke-width': 1.5,
      },
    })
    ready.current = true
  }

  // Cria o mapa uma vez
  useEffect(() => {
    if (!el.current || map.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE[mapStyle],
      center: [-47.9, -15.8],
      zoom: 3.4,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      locale: { 'NavigationControl.ZoomIn': 'Aproximar', 'NavigationControl.ZoomOut': 'Afastar' },
    })
    m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap · OpenFreeMap' }), 'bottom-right')
    m.on('style.load', () => addLayers(m))
    m.on('click', (e: MapMouseEvent) => {
      if (state.current.locked) return
      pickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    // Nome da empresa ao passar o mouse
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'xs-popup' })
    m.on('mouseenter', RESULTS, (e: MapLayerMouseEvent) => {
      m.getCanvas().style.cursor = 'pointer'
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as { name: string; site: number; rating: number; recurring: number }
      const info = [p.recurring ? 'Já nos leads' : p.site ? 'Tem site' : 'Sem site', p.rating ? `${Number(p.rating).toFixed(1)}★` : ''].filter(Boolean).join(' · ')
      popup
        .setLngLat((f.geometry as Point).coordinates as [number, number])
        .setHTML(`<strong>${escapeHtml(p.name)}</strong><br/><span>${info}</span>`)
        .addTo(m)
    })
    m.on('mouseleave', RESULTS, () => {
      m.getCanvas().style.cursor = ''
      popup.remove()
    })

    map.current = m

    return () => {
      pin.current?.remove()
      pin.current = null
      m.remove()
      map.current = null
      ready.current = false
    }
  }, [])

  // Troca entre mapa claro e escuro (as camadas próprias são recriadas no style.load)
  const firstStyle = useRef(true)
  useEffect(() => {
    if (firstStyle.current) {
      firstStyle.current = false
      return
    }
    ready.current = false
    map.current?.setStyle(STYLE[mapStyle])
  }, [mapStyle])

  // Pino arrastável no centro
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!center) {
      pin.current?.remove()
      pin.current = null
      return
    }
    if (!pin.current) {
      const node = document.createElement('div')
      node.className = 'xs-pin'
      node.innerHTML = '<span></span>'
      const marker = new maplibregl.Marker({ element: node, draggable: true, clickTolerance: 4 }).setLngLat([center.lng, center.lat]).addTo(m)
      marker.on('drag', () => {
        const ll = marker.getLngLat()
        if (ready.current) (m.getSource(AREA) as GeoJSONSource | undefined)?.setData(circle({ lat: ll.lat, lng: ll.lng }, animRadius.current))
      })
      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        pickRef.current({ lat: ll.lat, lng: ll.lng })
      })
      pin.current = marker
    } else {
      pin.current.setLngLat([center.lng, center.lat])
    }
    pin.current!.setDraggable(!locked)
    pin.current!.getElement().classList.toggle('is-locked', !!locked)
  }, [center?.lat, center?.lng, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Círculo do raio (animado) e enquadramento
  useEffect(() => {
    const m = map.current
    if (!m || !center) {
      if (m && ready.current) (m.getSource(AREA) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const from = animRadius.current
    const to = radiusKm
    const duration = reducedMotion() ? 0 : 320
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1
      animRadius.current = from + (to - from) * (1 - (1 - t) ** 3)
      if (ready.current) (m.getSource(AREA) as GeoJSONSource | undefined)?.setData(hideCircle ? { type: 'FeatureCollection', features: [] } : circle(center, animRadius.current))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const fit = setTimeout(() => {
      m.fitBounds(bounds(center, radiusKm), { padding: 48, maxZoom: 15, duration: reducedMotion() ? 0 : 650 })
    }, 120)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fit)
    }
  }, [center?.lat, center?.lng, radiusKm, hideCircle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Empresas encontradas
  useEffect(() => {
    const m = map.current
    if (m && ready.current) (m.getSource(RESULTS) as GeoJSONSource | undefined)?.setData(resultsData(results))
  }, [results])

  return <div ref={el} className="xs-map size-full min-h-[280px] overflow-hidden rounded-[10px]" />
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
