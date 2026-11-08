import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const HIGHLIGHT = new THREE.Color(0x1f5fbf)
const NONE = new THREE.Color(0x000000)

// Rotatable 3D assembly. `explode` (0..1) slides every part along its travel;
// clicking a part calls onSelect(itemNo). Item numbers float over the parts
// once it is taken apart.
export default function ExplodedViewer({ buildModel, explode, selected, onSelect, height = 460 }) {
  const mountRef = useRef(null)
  const labelsRef = useRef(null)
  const partsRef = useRef({})
  const explodeRef = useRef(explode)
  const selectedRef = useRef(selected)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    explodeRef.current = explode
    selectedRef.current = selected
    onSelectRef.current = onSelect
  }, [explode, selected, onSelect])

  useEffect(() => {
    const mount = mountRef.current
    const width = () => mount.clientWidth || 600
    const model = buildModel()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(width(), height)
    mount.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, width() / height, 1, 3000)
    camera.position.set(...model.camera.position)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(...model.camera.target)
    controls.enableDamping = true
    controls.minDistance = 180
    controls.maxDistance = 900

    scene.add(new THREE.HemisphereLight(0xffffff, 0x55575c, 2.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.6)
    key.position.set(200, 260, 300)
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.3)
    fill.position.set(-250, -80, 120)
    const back = new THREE.DirectionalLight(0xffffff, 0.9)
    back.position.set(0, -200, -300)
    scene.add(key, fill, back)

    Object.entries(model.parts).forEach(([item, group]) => {
      group.userData.item = Number(item)
      scene.add(group)
    })
    partsRef.current = model.parts

    const labels = labelsRef.current
    const labelEls = {}
    Object.keys(model.parts).forEach(item => {
      const el = document.createElement('div')
      el.textContent = item
      el.className = 'absolute -translate-x-1/2 -translate-y-full rounded-md border px-2 py-0.5 text-xs font-semibold shadow-sm transition-colors'
      labels.appendChild(el)
      labelEls[item] = el
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down = null
    const onDown = event => { down = [event.clientX, event.clientY] }
    const onUp = event => {
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(Object.values(model.parts), true)[0]
      let node = hit?.object
      while (node && !node.userData.item) node = node.parent
      if (node) onSelectRef.current?.(node.userData.item)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = new ResizeObserver(() => {
      renderer.setSize(width(), height)
      camera.aspect = width() / height
      camera.updateProjectionMatrix()
    })
    resize.observe(mount)

    const box = new THREE.Box3()
    const point = new THREE.Vector3()
    let frame
    const loop = () => {
      const t = explodeRef.current
      Object.entries(model.travel).forEach(([item, [from, to]]) => {
        model.parts[item].position.z = from + (to - from) * t
      })
      controls.update()
      renderer.render(scene, camera)

      const opacity = Math.max(0, Math.min(1, (t - 0.35) / 0.4))
      Object.entries(labelEls).forEach(([item, el]) => {
        el.style.opacity = opacity
        if (!opacity) return
        box.setFromObject(model.parts[item])
        box.getCenter(point)
        point.y = box.max.y + 10
        point.project(camera)
        el.style.left = `${((point.x + 1) / 2) * width()}px`
        el.style.top = `${((1 - point.y) / 2) * height}px`
        const active = Number(item) === selectedRef.current
        el.style.background = active ? '#004A77' : 'rgba(255,255,255,0.92)'
        el.style.color = active ? '#ffffff' : '#263238'
        el.style.borderColor = active ? '#004A77' : '#cfd8dc'
      })
      frame = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      scene.traverse(node => {
        node.geometry?.dispose()
        node.material?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
      labels.replaceChildren()
    }
  }, [buildModel, height])

  useEffect(() => {
    Object.entries(partsRef.current).forEach(([item, group]) => {
      const active = Number(item) === selected
      group.traverse(node => {
        if (!node.material) return
        node.material.emissive = active ? HIGHLIGHT : NONE
        node.material.emissiveIntensity = active ? 0.45 : 0
      })
    })
  }, [selected])

  return (
    <div ref={mountRef} className="relative w-full cursor-grab overflow-hidden rounded-xl bg-gradient-to-b from-neutral-50 to-neutral-100 active:cursor-grabbing" style={{ height }}>
      <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-neutral-400">Drag to rotate · scroll to zoom · click a part</p>
    </div>
  )
}
