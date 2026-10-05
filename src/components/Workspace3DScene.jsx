import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { attentionMeaning } from '../lib/workspaceObjects'

const COLORS = {
  // Night blue and silver, like the rest of the app. Ultramarine is kept
  // for the selection highlight only, so the selected device stands out.
  ink: 0x05070f,
  surface: 0x0a0e22,
  panel: 0xa3aab6,
  screen: 0x0b1030,
  ultra: 0x2c46ff,
  bright: 0xcdd2db,
  pale: 0xd3d8e1,
  desk: 0x0c1022,
  edge: 0x1c2338,
  white: 0xe6e9ef,
  // What looking at a device does to the score, shown on the device itself:
  // --ds-attn-high for work, --ds-bad for a distraction.
  attnFocus: 0x2fe3a8,
  attnDistraction: 0xff4d6a,
}

const MEANING_COLOR = { focus: COLORS.attnFocus, distraction: COLORS.attnDistraction }
// Below this bounding radius a mesh is detail (keyboard keys), not outline.
const OUTLINE_MIN_RADIUS = .09

// A hairline along the hard edges of the device's own body, plus a faint
// tint of its surface: the device reads as "marked" without anything new
// lying on the desk. Lines never take the pointer, so dragging is unchanged.
function addAttentionOutline(group) {
  const lineMaterial = new THREE.LineBasicMaterial({ color: COLORS.attnFocus, transparent: true, opacity: 1, depthWrite: false, fog: false })
  const bodies = []
  group.traverse(child => { if (child.isMesh && child.userData.isWorkspaceMesh) bodies.push(child) })
  for (const body of bodies) {
    body.geometry.computeBoundingSphere()
    if (body.material.userData.baseEmissive || body.geometry.boundingSphere.radius < OUTLINE_MIN_RADIUS) continue
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry, 30), lineMaterial)
    outline.raycast = () => {}
    outline.userData.attentionOutline = true
    body.add(outline)
  }
  group.userData.attentionOutline = lineMaterial
}

function material(color, roughness = .48, metalness = .22) {
  const metal = color === COLORS.panel || color === COLORS.pale
  return new THREE.MeshStandardMaterial({ color, roughness: metal ? .32 : roughness, metalness: metal ? .65 : metalness })
}

function mesh(geometry, color, { y = 0, x = 0, z = 0, rotationX = 0, cast = true } = {}) {
  const item = new THREE.Mesh(geometry, material(color))
  item.position.set(x, y, z)
  item.rotation.x = rotationX
  item.castShadow = cast
  item.receiveShadow = true
  return item
}

function box(w, h, d, color, options) {
  return mesh(new THREE.BoxGeometry(w, h, d), color, options)
}

function screenPanel(width = 1.25, height = .72) {
  const group = new THREE.Group()
  const shell = box(width, height, .09, COLORS.panel, { y: .75 })
  const glass = box(width * .91, height * .84, .018, COLORS.screen, { y: .75, z: .055 })
  glass.material.emissive = new THREE.Color(0x1a2560)
  glass.material.emissiveIntensity = .35
  group.add(shell, glass)
  return group
}

function deviceModel(type) {
  const group = new THREE.Group()
  if (type === 'monitor') {
    const panel = screenPanel()
    group.add(panel, box(.1, .48, .1, COLORS.pale, { y: .35 }), box(.55, .06, .3, COLORS.edge, { y: .07 }))
  } else if (type === 'laptop') {
    group.add(box(1.1, .08, .75, COLORS.edge, { y: .06, z: .08 }))
    const display = screenPanel(1.05, .64)
    display.position.set(0, .02, -.29)
    display.rotation.x = -.14
    group.add(display)
  } else if (type === 'camera') {
    // A recognisable webcam: rounded silver body, dark lens with a bright
    // ring, and a faint cone showing where it looks (towards the user).
    const body = box(.34, .16, .12, COLORS.panel)
    const rim = mesh(new THREE.CylinderGeometry(.07, .07, .03, 32), COLORS.white, { z: .065 })
    rim.rotation.x = Math.PI / 2
    rim.material.emissive = new THREE.Color(0x8a93a6)
    rim.material.emissiveIntensity = .5
    const glass = mesh(new THREE.CylinderGeometry(.045, .045, .036, 24), COLORS.ink, { z: .07 })
    glass.rotation.x = Math.PI / 2
    const coneMaterial = new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: .045, depthWrite: false, side: THREE.DoubleSide })
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.42, 2.2, 32, 1, true), coneMaterial)
    cone.rotation.x = -Math.PI / 2
    cone.position.z = .07 + 1.1
    cone.raycast = () => {}
    cone.userData.decorative = true
    group.add(body, rim, glass, cone)
  } else if (type === 'phone' || type === 'ipad') {
    const w = type === 'ipad' ? .66 : .32, d = type === 'ipad' ? .86 : .62
    group.add(box(w, .055, d, COLORS.panel, { y: .04 }))
    const glass = box(w * .88, .012, d * .9, COLORS.screen, { y: .076 })
    glass.material.emissive = new THREE.Color(0x1a2560)
    glass.material.emissiveIntensity = .3
    group.add(glass)
  } else if (type === 'keyboard') {
    group.add(box(1.05, .08, .38, COLORS.panel, { y: .05 }))
    for (let row = 0; row < 4; row += 1) for (let col = 0; col < 11; col += 1) {
      group.add(box(.072, .018, .055, COLORS.edge, { x: -.42 + col * .085, y: .1, z: -.13 + row * .085, cast: false }))
    }
  } else if (type === 'mouse') {
    const mouse = mesh(new THREE.SphereGeometry(.2, 24, 16), COLORS.panel, { y: .1 })
    mouse.scale.set(.72, .55, 1.1)
    group.add(mouse)
  } else {
    const colors = { paper: COLORS.white, notebook: 0x5c6370, book: 0x858c99 }
    const height = type === 'book' ? .12 : .045
    group.add(box(.7, height, .88, colors[type] || COLORS.pale, { y: height / 2 }))
    if (type === 'notebook') group.add(box(.05, .07, .88, COLORS.panel, { x: -.31, y: .06 }))
  }
  group.traverse(child => {
    if (!child.isMesh || child.userData.decorative) return
    child.userData.isWorkspaceMesh = true
    child.material.userData.baseEmissive = child.material.emissive?.getHex?.() || 0
    child.material.userData.baseEmissiveIntensity = child.material.emissiveIntensity || 0
  })
  return group
}

function scenePosition(object) {
  return {
    x: (object.scene?.x || 0) * 3.15,
    y: Math.max(-.15, Math.min(1.4, (object.scene?.y || 0) * .48)),
    z: ((object.scene?.z ?? .5) - .5) * 3.8,
  }
}

function mountedCameraPose(object, objects) {
  const mount = object.type === 'camera' ? object.cameraMount : null
  const target = mount && objects.find(candidate => candidate.id === mount.targetId && (candidate.type === 'monitor' || candidate.type === 'laptop'))
  if (!target) return null
  const targetPosition = scenePosition(target)
  const rotation = THREE.MathUtils.degToRad(-(target.scene?.rotation || 0))
  const targetScale = target.scene?.scale ?? 1
  const targetWidth = (target.type === 'monitor' ? 1.25 : 1.1) * (target.dimensions?.width || 1) * targetScale
  const targetHeight = (target.dimensions?.height || 1) * targetScale
  const localX = (mount.offsetX || 0) * targetWidth * .42
  const localZ = mount.style === 'top' ? .14 : .075
  return {
    x: targetPosition.x + localX * Math.cos(rotation) + localZ * Math.sin(rotation),
    y: targetPosition.y + 1.08 * targetHeight + (mount.style === 'top' ? .12 : 0),
    z: targetPosition.z - localX * Math.sin(rotation) + localZ * Math.cos(rotation),
    rotation,
    scale: mount.style === 'top' ? .85 : .65,
  }
}

export default function Workspace3DScene({ objects, selectedId, view, onSelect, onMove }) {
  const hostRef = useRef(null)
  const runtimeRef = useRef(null)
  const [sceneError, setSceneError] = useState('')
  const callbacksRef = useRef({ onSelect, onMove })
  callbacksRef.current = { onSelect, onMove }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch (error) {
      console.error('[Workspace3DScene] WebGL unavailable', error)
      setSceneError('3D preview is unavailable on this device. Your workspace settings are still editable.')
      return
    }
    setSceneError('')
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(COLORS.ink)
    scene.fog = new THREE.FogExp2(COLORS.ink, .055)
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100)
    camera.position.set(6.4, 5.4, 7.2)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .075
    controls.minDistance = 4.5
    controls.maxDistance = 13
    controls.maxPolarAngle = Math.PI * .48
    controls.target.set(0, .35, 0)

    scene.add(new THREE.HemisphereLight(0xdfe5f5, 0x080b18, 2.0))
    const key = new THREE.DirectionalLight(0xf2f4fa, 3.8)
    key.position.set(-4, 8, 5)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7
    scene.add(key)
    const rim = new THREE.PointLight(0x9aa3b5, 18, 14, 2)
    rim.position.set(4, 3, -3)
    scene.add(rim)

    const desk = box(7.3, .22, 4.7, COLORS.desk, { y: -.18 })
    desk.material.roughness = .6
    desk.material.metalness = .05
    scene.add(desk)
    // The glowing edge is a slightly larger slab tucked just under the desk
    // top, so only its rim shows. At y -.055 it sat above the top (-.07) and
    // painted the whole surface bright emissive blue.
    const deskEdge = box(7.38, .045, 4.78, COLORS.edge, { y: -.1 })
    deskEdge.material.emissive = new THREE.Color(0x0c1230)
    deskEdge.material.emissiveIntensity = .3
    scene.add(deskEdge)
    for (const x of [-3.15, 3.15]) for (const z of [-1.85, 1.85]) scene.add(box(.18, 2.3, .18, COLORS.surface, { x, y: -1.4, z }))
    const userMarker = new THREE.Group()
    const userRing = mesh(new THREE.RingGeometry(.42, .5, 48), COLORS.pale, { y: -.03, rotationX: -Math.PI / 2, cast: false })
    userRing.material.emissive = new THREE.Color(0x5c6370)
    userRing.material.emissiveIntensity = .6
    const userHead = mesh(new THREE.SphereGeometry(.17, 24, 18), COLORS.bright, { y: .55 })
    const userShoulders = mesh(new THREE.SphereGeometry(.38, 24, 18), COLORS.panel, { y: .17 })
    userShoulders.scale.set(1.25, .55, .7)
    userMarker.add(userRing, userHead, userShoulders)
    userMarker.position.z = 3.05
    scene.add(userMarker)
    const floor = mesh(new THREE.PlaneGeometry(30, 30), 0x050713, { y: -2.56, rotationX: -Math.PI / 2, cast: false })
    scene.add(floor)
    const grid = new THREE.GridHelper(22, 44, COLORS.edge, 0x111936)
    grid.position.y = -2.54
    grid.material.opacity = .22
    grid.material.transparent = true
    scene.add(grid)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let draggingId = null
    let desiredCamera = null
    const objectGroups = new Map()

    const pointerFor = event => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
    }
    const pointerDown = event => {
      pointerFor(event)
      const hits = raycaster.intersectObjects([...objectGroups.values()], true)
      const id = hits[0]?.object?.userData?.objectId
      callbacksRef.current.onSelect?.(id || null)
      if (id && hits[0]?.object?.userData?.draggable !== false) {
        draggingId = id
        controls.enabled = false
        renderer.domElement.setPointerCapture?.(event.pointerId)
      }
    }
    const pointerMove = event => {
      if (!draggingId) return
      pointerFor(event)
      const point = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(dragPlane, point)) return
      callbacksRef.current.onMove?.(draggingId, {
        x: Math.max(-1, Math.min(1, point.x / 3.15)),
        z: Math.max(0, Math.min(1, point.z / 3.8 + .5)),
      })
    }
    const pointerUp = event => {
      draggingId = null
      controls.enabled = true
      renderer.domElement.releasePointerCapture?.(event.pointerId)
    }
    const contextLost = event => {
      event.preventDefault()
      setSceneError('The 3D preview stopped responding. Your workspace settings are still editable.')
    }
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointermove', pointerMove)
    renderer.domElement.addEventListener('pointerup', pointerUp)
    renderer.domElement.addEventListener('webglcontextlost', contextLost)

    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      if (desiredCamera) {
        camera.position.lerp(desiredCamera, .085)
        if (camera.position.distanceTo(desiredCamera) < .035) desiredCamera = null
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()
    runtimeRef.current = { scene, camera, controls, renderer, objectGroups, setDesiredCamera: value => { desiredCamera = value } }
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointermove', pointerMove)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      scene.traverse(item => {
        item.geometry?.dispose?.()
        if (Array.isArray(item.material)) item.material.forEach(entry => { entry.map?.dispose?.(); entry.dispose?.() })
        else { item.material?.map?.dispose?.(); item.material?.dispose?.() }
      })
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const liveIds = new Set(objects.map(object => object.id))
    for (const [id, group] of runtime.objectGroups) {
      if (liveIds.has(id)) continue
      runtime.scene.remove(group)
      group.traverse(child => { child.geometry?.dispose?.(); child.material?.map?.dispose?.(); child.material?.dispose?.() })
      runtime.objectGroups.delete(id)
    }
    for (const object of objects) {
      let group = runtime.objectGroups.get(object.id)
      if (!group) {
        group = deviceModel(object.type)
        addAttentionOutline(group)
        group.userData.objectId = object.id
        group.traverse(child => { child.userData.objectId = object.id })
        runtime.objectGroups.set(object.id, group)
        runtime.scene.add(group)
      }
      const meaningColor = MEANING_COLOR[attentionMeaning(object)]
      const outline = group.userData.attentionOutline
      outline.color.setHex(meaningColor ?? COLORS.attnFocus)
      group.traverse(child => { if (child.userData.attentionOutline) child.visible = meaningColor != null })
      const mountPose = mountedCameraPose(object, objects)
      const position = mountPose || scenePosition(object)
      group.position.set(position.x, position.y, position.z)
      group.rotation.y = mountPose?.rotation ?? THREE.MathUtils.degToRad(-(object.scene?.rotation || 0))
      const scale = mountPose?.scale ?? object.scene?.scale ?? 1
      const dimensions = object.dimensions || {}
      group.scale.set(
        scale * (dimensions.width || 1),
        scale * (dimensions.height || 1),
        scale * (dimensions.depth || 1),
      )
      group.traverse(child => {
        child.userData.draggable = !mountPose
        if (!child.isMesh || !child.material?.emissive) return
        if (object.id === selectedId) {
          child.material.emissive.setHex(COLORS.ultra)
          child.material.emissiveIntensity = .55
        } else if (meaningColor != null && !child.material.userData.baseEmissive) {
          child.material.emissive.setHex(meaningColor)
          child.material.emissiveIntensity = .22
        } else {
          child.material.emissive.setHex(child.material.userData.baseEmissive || 0)
          child.material.emissiveIntensity = child.material.userData.baseEmissiveIntensity || 0
        }
      })
    }
  }, [objects, selectedId])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const positions = {
      iso: new THREE.Vector3(6.4, 5.4, 7.2),
      top: new THREE.Vector3(0, 10.8, .01),
      front: new THREE.Vector3(0, 3.2, 10.2),
    }
    runtime.controls.target.set(0, .25, 0)
    runtime.setDesiredCamera(positions[view] || positions.iso)
  }, [view])

  return <div ref={hostRef} className="workspace-3d-host" aria-label="Interactive 3D workspace editor">
    {sceneError && <div className="workspace-3d-error" role="status">{sceneError}</div>}
  </div>
}
