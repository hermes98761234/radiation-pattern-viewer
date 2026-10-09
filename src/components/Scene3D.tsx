import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import {
  ArrowHelper,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Cut } from '../lib/analysis'
import { colorAt, radiusOf, ringOffsets, type Colormap, type Scale } from '../lib/display'
import { D2R, dirVec, type PatternGrid } from '../lib/grid'

export type SceneHandle = { resetView: () => void; snapshot: () => string | null }
export type Hover = { theta: number; phi: number; gain: number } | null

type Props = {
  grid: PatternGrid
  peak: { theta: number; phi: number; gain: number }
  cutA: Cut
  cutB: Cut
  scale: Scale
  range: number
  colormap: Colormap
  wire: boolean
  spin: boolean
  showCuts: boolean
  /** Changes whenever the theme does, so the background and label colours are re-read from CSS. */
  themeKey: string
  onHover: (h: Hover) => void
  onUnavailable: () => void
  ref?: Ref<SceneHandle>
}

type Three = {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  controls: OrbitControls
  mesh: Mesh
  overlay: Group
  guides: Group
  frame: number
}

const css = (el: Element, name: string, fallback: string) => getComputedStyle(el).getPropertyValue(name).trim() || fallback

function label(text: string, color: string): Sprite {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.font = 'bold 40px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 32, 34)
  const s = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthTest: false }))
  s.scale.setScalar(0.14)
  return s
}

function disposeGroup(g: Group) {
  for (const o of [...g.children]) {
    g.remove(o)
    const m = o as Mesh
    m.geometry?.dispose()
    const mat = m.material as { map?: { dispose(): void }; dispose(): void } | undefined
    mat?.map?.dispose()
    mat?.dispose()
  }
}

export default function Scene3D(p: Props) {
  const { grid, peak, cutA, cutB, scale, range, colormap, wire, showCuts, themeKey, ref } = p
  const host = useRef<HTMLDivElement>(null)
  const three = useRef<Three | null>(null)
  const props = useRef(p)
  useLayoutEffect(() => {
    props.current = p
  })

  useImperativeHandle(ref, () => ({
    resetView: () => {
      const t = three.current
      if (!t) return
      t.camera.position.set(2.1, -2.6, 1.7)
      t.controls.target.set(0, 0, 0)
      t.controls.update()
    },
    snapshot: () => {
      const t = three.current
      if (!t) return null
      t.renderer.render(t.scene, t.camera)
      return t.renderer.domElement.toDataURL('image/png')
    },
  }))

  // Renderer, camera, controls: created once.
  useEffect(() => {
    const el = host.current!
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    } catch {
      props.current.onUnavailable()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    el.appendChild(renderer.domElement)
    const scene = new Scene()
    const camera = new PerspectiveCamera(35, 1, 0.05, 50)
    camera.up.set(0, 0, 1)
    camera.position.set(2.1, -2.6, 1.7)
    scene.add(new AmbientLight(0xffffff, 1.1))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(2, -3, 4)
    scene.add(key)
    const fill = new DirectionalLight(0xffffff, 1.0)
    fill.position.set(-3, 2, -1)
    scene.add(fill)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    controls.autoRotateSpeed = 1.2
    const mesh = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.55, metalness: 0.05 }))
    scene.add(mesh)
    const overlay = new Group()
    const guides = new Group()
    scene.add(overlay, guides)
    const t: Three = { renderer, scene, camera, controls, mesh, overlay, guides, frame: 0 }
    three.current = t

    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 300
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    const loop = () => {
      t.frame = requestAnimationFrame(loop)
      controls.autoRotate = props.current.spin
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    // Hover readout: nearest mesh vertex under the pointer.
    const ray = new Raycaster()
    const ptr = new Vector2()
    let pending = false
    const onMove = (e: PointerEvent) => {
      if (pending || e.buttons) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        const r = renderer.domElement.getBoundingClientRect()
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        ray.setFromCamera(ptr, camera)
        const hit = ray.intersectObject(mesh, false)[0]
        const g = props.current.grid
        if (!hit || !hit.face) return props.current.onHover(null)
        const n = hit.face.a
        const i = Math.floor(n / g.nPhi)
        const j = n % g.nPhi
        props.current.onHover({ theta: i * g.dTheta, phi: j * g.dPhi, gain: g.gain[n] })
      })
    }
    const onLeave = () => props.current.onHover(null)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(t.frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      mesh.geometry.dispose()
      ;(mesh.material as MeshStandardMaterial).dispose()
      disposeGroup(overlay)
      disposeGroup(guides)
      renderer.dispose()
      renderer.domElement.remove()
      three.current = null
    }
  }, [])

  // Pattern surface.
  useEffect(() => {
    const t = three.current
    if (!t) return
    const { nTheta, nPhi } = grid
    const pos = new Float32Array(nTheta * nPhi * 3)
    const col = new Float32Array(nTheta * nPhi * 3)
    for (let i = 0; i < nTheta; i++) {
      const th = i * grid.dTheta * D2R
      const st = Math.sin(th)
      const ct = Math.cos(th)
      for (let j = 0; j < nPhi; j++) {
        const n = i * nPhi + j
        const g = grid.gain[n]
        const r = radiusOf(g, peak.gain, range, scale)
        const ph = j * grid.dPhi * D2R
        pos[3 * n] = r * st * Math.cos(ph)
        pos[3 * n + 1] = r * st * Math.sin(ph)
        pos[3 * n + 2] = r * ct
        const [cr, cg, cb] = colorAt(colormap, 1 + (g - peak.gain) / range)
        col[3 * n] = cr
        col[3 * n + 1] = cg
        col[3 * n + 2] = cb
      }
    }
    const idx = new Uint32Array((nTheta - 1) * nPhi * 6)
    let k = 0
    for (let i = 0; i < nTheta - 1; i++)
      for (let j = 0; j < nPhi; j++) {
        const a = i * nPhi + j
        const b = i * nPhi + ((j + 1) % nPhi)
        const c = (i + 1) * nPhi + j
        const d = (i + 1) * nPhi + ((j + 1) % nPhi)
        idx[k++] = a
        idx[k++] = c
        idx[k++] = b
        idx[k++] = b
        idx[k++] = c
        idx[k++] = d
      }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('color', new BufferAttribute(col, 3))
    geo.setIndex(new BufferAttribute(idx, 1))
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    t.mesh.geometry.dispose()
    t.mesh.geometry = geo
    ;(t.mesh.material as MeshStandardMaterial).wireframe = wire
  }, [grid, peak.gain, scale, range, colormap, wire])

  // Cut curves and the beam arrow.
  useEffect(() => {
    const t = three.current
    if (!t) return
    disposeGroup(t.overlay)
    if (!showCuts) return
    const curve = (cut: Cut, color: number) => {
      const pts: number[] = []
      for (const c of cut) {
        const r = radiusOf(c.gain, peak.gain, range, scale) * 1.004 + 0.002
        const [x, y, z] = dirVec(c.theta, c.phi)
        pts.push(x * r, y * r, z * r)
      }
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
      const line = new LineLoop(geo, new LineBasicMaterial({ color, depthTest: false, transparent: true }))
      line.renderOrder = 2
      return line
    }
    t.overlay.add(curve(cutA, 0xf59e0b), curve(cutB, 0x22d3ee))
    const [x, y, z] = dirVec(peak.theta, peak.phi)
    const arrow = new ArrowHelper(new Vector3(x, y, z), new Vector3(0, 0, 0), 1.3, 0xffffff, 0.09, 0.05)
    t.overlay.add(arrow)
  }, [cutA, cutB, showCuts, peak.theta, peak.phi, peak.gain, range, scale])

  // Axes, rings and background follow the scale and theme.
  useEffect(() => {
    const t = three.current
    if (!t) return
    const el = host.current!
    const bg = css(el, '--chart-bg', '#0b0d11')
    const fg = css(el, '--chart-fg', '#a3aab6')
    const gridCol = css(el, '--grid-strong', '#3a414e')
    t.scene.background = new Color(bg)
    disposeGroup(t.guides)
    const axis = (v: [number, number, number], color: number, name: string) => {
      const geo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(...v).multiplyScalar(1.28)])
      t.guides.add(new Line(geo, new LineBasicMaterial({ color })))
      const s = label(name, fg)
      s.position.set(...(v.map((c) => c * 1.4) as [number, number, number]))
      t.guides.add(s)
    }
    axis([1, 0, 0], 0xef4444, 'x')
    axis([0, 1, 0], 0x22c55e, 'y')
    axis([0, 0, 1], 0x3b82f6, 'z')
    for (const off of ringOffsets(range, scale)) {
      const r = radiusOf(peak.gain + off, peak.gain, range, scale)
      if (r <= 0.01) continue
      const pts: number[] = []
      for (let a = 0; a < 128; a++) pts.push(r * Math.cos((a / 128) * 2 * Math.PI), r * Math.sin((a / 128) * 2 * Math.PI), 0)
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
      const ring = new LineLoop(geo, new LineBasicMaterial({ color: new Color(gridCol), transparent: true, opacity: off === 0 ? 0.9 : 0.45 }))
      t.guides.add(ring)
    }
  }, [themeKey, range, scale, peak.gain])

  return <div className="scene-canvas" ref={host} role="img" aria-label="3D radiation pattern" />
}
