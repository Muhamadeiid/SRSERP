import * as THREE from 'three'

// Knorr-Bremse compressor cylinder head (IPC figure 8-4), modelled from the
// catalogue drawing; sizes are proportional, not measured. Parts stack along
// Z in the drawing's order and slide from `travel[0]` (assembled) to
// `travel[1]` (exploded).

const material = (color, metalness, roughness) => new THREE.MeshStandardMaterial({ color, metalness, roughness })
const aluminium = () => material(0xc3c7cc, 0.35, 0.42)
const steel = () => material(0x9aa1a8, 0.45, 0.32)
const darkSteel = () => material(0x3b3e43, 0.5, 0.35)
const rubber = () => material(0x18181a, 0.05, 0.55)
const fibre = () => material(0x5a5f52, 0.05, 0.85)
const copper = () => material(0xb87a45, 0.55, 0.32)

const BOLT_HOLES = [[-40, -40], [40, -40], [40, 40], [-40, 40]]

function roundedRect(width, height, radius) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

function hole(x, y, radius) {
  const path = new THREE.Path()
  path.absarc(x, y, radius, 0, Math.PI * 2, true)
  return path
}

function plate(shape, depth, bevel) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 32,
  })
}

// A cylinder whose axis runs along Z
function zCylinder(radius, length, segments = 32) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function mesh(geometry, mat, x = 0, y = 0, z = 0) {
  const result = new THREE.Mesh(geometry, mat)
  result.position.set(x, y, z)
  return result
}

function gasket() {
  const shape = roundedRect(122, 122, 30)
  shape.holes.push(hole(0, 0, 47))
  BOLT_HOLES.forEach(([x, y]) => shape.holes.push(hole(x, y, 4.5)))
  const group = new THREE.Group()
  group.add(mesh(plate(shape, 1.6, 0), fibre()))
  return group
}

function discValve() {
  const shape = roundedRect(110, 110, 12)
  BOLT_HOLES.forEach(([x, y]) => shape.holes.push(hole(x, y, 4)))
  const group = new THREE.Group()
  group.add(mesh(plate(shape, 8, 0.8), steel()))
  // valve stops with their retaining screws
  ;[[-16, 14], [16, -14]].forEach(([x, y]) => {
    const stop = mesh(new THREE.BoxGeometry(34, 11, 4), darkSteel(), x, y, 10.5)
    stop.rotation.z = 0.6
    group.add(stop)
    group.add(mesh(zCylinder(3.2, 4, 6), darkSteel(), x + 13 * Math.cos(0.6), y + 13 * Math.sin(0.6), 13))
  })
  // valve ports
  ;[[18, 22], [-18, -22], [28, -4], [-28, 4]].forEach(([x, y]) => {
    group.add(mesh(zCylinder(5, 1.2), rubber(), x, y, 9.2))
  })
  return group
}

function oRing(radius) {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 2.3, 16, 96), rubber()))
  return group
}

function head() {
  const shape = roundedRect(118, 118, 14)
  BOLT_HOLES.forEach(([x, y]) => shape.holes.push(hole(x, y, 3.6)))
  const group = new THREE.Group()
  group.add(mesh(plate(shape, 44, 1.8), aluminium()))
  // lifting lug on top
  group.add(mesh(new THREE.BoxGeometry(58, 22, 30), aluminium(), 0, 68, 18))
  group.add(mesh(new THREE.CylinderGeometry(8, 8, 23, 32), darkSteel(), 0, 68, 18))
  // outlet boss and port
  group.add(mesh(zCylinder(22, 6), aluminium(), 0, 0, 48))
  group.add(mesh(zCylinder(11, 1), darkSteel(), 0, 0, 51.6))
  ;[[-30, -48], [30, -48]].forEach(([x, y]) => {
    group.add(mesh(zCylinder(7, 4), aluminium(), x, y, 46))
    group.add(mesh(zCylinder(3.5, 1), darkSteel(), x, y, 48.2))
  })
  // side ports
  ;[-1, 1].forEach(side => {
    const boss = mesh(new THREE.CylinderGeometry(7, 7, 6, 24), aluminium(), side * 61, 10, 26)
    boss.rotation.z = Math.PI / 2
    group.add(boss)
    const port = mesh(new THREE.CylinderGeometry(3.4, 3.4, 6.4, 24), darkSteel(), side * 61, 10, 26)
    port.rotation.z = Math.PI / 2
    group.add(port)
  })
  return group
}

function sealingRings() {
  const group = new THREE.Group()
  BOLT_HOLES.forEach(([x, y]) => {
    group.add(mesh(new THREE.TorusGeometry(4.3, 1.1, 12, 32), copper(), x, y, 0))
  })
  return group
}

function screws() {
  const group = new THREE.Group()
  BOLT_HOLES.forEach(([x, y]) => {
    group.add(mesh(zCylinder(3, 50, 20), darkSteel(), x, y, -25))
    group.add(mesh(zCylinder(5.4, 5.5), darkSteel(), x, y, 2.75))
    group.add(mesh(zCylinder(2.4, 0.6, 6), rubber(), x, y, 5.6))
  })
  return group
}

export function buildCylinderHead() {
  return {
    parts: {
      7: gasket(),
      1: discValve(),
      3: oRing(49),
      2: oRing(15),
      4: head(),
      6: sealingRings(),
      5: screws(),
    },
    travel: {
      7: [0, -90],
      1: [1.8, -45],
      3: [13, 25],
      2: [13, 55],
      4: [12, 95],
      6: [57.2, 175],
      5: [58.4, 215],
    },
    camera: { position: [260, 170, 330], target: [0, 0, 40] },
  }
}
