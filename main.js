import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EPS = 1e-9;
const MIN_T = 1e-7;

function latticeOffset(spacing, source) { return source === 'lattice' ? 0 : 0.48 * spacing; }
function latticeIndex1D(value, spacing, offset) { return Math.floor((value - offset) / spacing + 0.5); }
function center1D(index, spacing, offset) { return offset + index * spacing; }

function effectiveProjectileRadius(params, source) {
  return source === 'lattice' ? params.obstacleRadius : params.projectileRadius;
}

function raySphereT(origin, directionUnit, center, radius) {
  const oc = origin.clone().sub(center);
  const b = oc.dot(directionUnit);
  const c = oc.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < -EPS) return Infinity;
  const s = Math.sqrt(Math.max(0, disc));
  const t0 = -b - s;
  const t1 = -b + s;
  if (t0 > MIN_T) return t0;
  if (t1 > MIN_T) return t1;
  return Infinity;
}

function firstCollision3D(origin, directionUnit, params, source) {
  const { spacing, halfExtent } = params;
  const collisionRadius = params.obstacleRadius + effectiveProjectileRadius(params, source);
  const offset = latticeOffset(spacing, source);
  let cell = new THREE.Vector3(
    latticeIndex1D(origin.x, spacing, offset),
    latticeIndex1D(origin.y, spacing, offset),
    latticeIndex1D(origin.z, spacing, offset)
  );
  if (Math.abs(cell.x) > halfExtent || Math.abs(cell.y) > halfExtent || Math.abs(cell.z) > halfExtent) return null;

  const dir = directionUnit;
  const step = new THREE.Vector3(dir.x >= 0 ? 1 : -1, dir.y >= 0 ? 1 : -1, dir.z >= 0 ? 1 : -1);
  const tDelta = new THREE.Vector3(
    Math.abs(dir.x) > EPS ? spacing / Math.abs(dir.x) : Infinity,
    Math.abs(dir.y) > EPS ? spacing / Math.abs(dir.y) : Infinity,
    Math.abs(dir.z) > EPS ? spacing / Math.abs(dir.z) : Infinity
  );
  const boundary = (axisCell, axis) => {
    const c = center1D(axisCell, spacing, offset);
    return dir[axis] >= 0 ? c + spacing * 0.5 : c - spacing * 0.5;
  };
  const tMax = new THREE.Vector3(
    Math.abs(dir.x) > EPS ? (boundary(cell.x, 'x') - origin.x) / dir.x : Infinity,
    Math.abs(dir.y) > EPS ? (boundary(cell.y, 'y') - origin.y) / dir.y : Infinity,
    Math.abs(dir.z) > EPS ? (boundary(cell.z, 'z') - origin.z) / dir.z : Infinity
  );

  let traversed = 0;
  const maxTraversedCells = Math.max(1000, (2 * halfExtent + 3) ** 3);
  while (traversed++ < maxTraversedCells) {
    let bestT = Infinity, bestCenter = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const ix = cell.x + dx, iy = cell.y + dy, iz = cell.z + dz;
      if (Math.abs(ix) > halfExtent || Math.abs(iy) > halfExtent || Math.abs(iz) > halfExtent) continue;
      const c = new THREE.Vector3(center1D(ix, spacing, offset), center1D(iy, spacing, offset), center1D(iz, spacing, offset));
      if (source === 'lattice' && c.lengthSq() < 1e-14) continue;
      const t = raySphereT(origin, dir, c, collisionRadius);
      if (t < bestT) { bestT = t; bestCenter = c; }
    }
    const nextT = Math.min(tMax.x, tMax.y, tMax.z);
    if (bestCenter && bestT <= nextT + 1e-8) return { t: bestT, center: bestCenter };
    if (!Number.isFinite(nextT)) return null;
    if (tMax.x <= nextT + 1e-10) { cell.x += step.x; tMax.x += tDelta.x; }
    if (tMax.y <= nextT + 1e-10) { cell.y += step.y; tMax.y += tDelta.y; }
    if (tMax.z <= nextT + 1e-10) { cell.z += step.z; tMax.z += tDelta.z; }
    if (Math.abs(cell.x) > halfExtent + 1 || Math.abs(cell.y) > halfExtent + 1 || Math.abs(cell.z) > halfExtent + 1) return null;
  }
  return null;
}

function firstCollision2D(origin, directionUnit, params, source) {
  const { spacing, halfExtent } = params;
  const collisionRadius = params.obstacleRadius + effectiveProjectileRadius(params, source);
  const offset = latticeOffset(spacing, source);
  let cx = latticeIndex1D(origin.x, spacing, offset);
  let cy = latticeIndex1D(origin.y, spacing, offset);
  if (Math.abs(cx) > halfExtent || Math.abs(cy) > halfExtent) return null;

  const dx = directionUnit.x, dy = directionUnit.y;
  const stepX = dx >= 0 ? 1 : -1, stepY = dy >= 0 ? 1 : -1;
  const tDeltaX = Math.abs(dx) > EPS ? spacing / Math.abs(dx) : Infinity;
  const tDeltaY = Math.abs(dy) > EPS ? spacing / Math.abs(dy) : Infinity;
  const boundary = (cell, axisDir) => {
    const c = center1D(cell, spacing, offset);
    return axisDir >= 0 ? c + spacing * 0.5 : c - spacing * 0.5;
  };
  let tMaxX = Math.abs(dx) > EPS ? (boundary(cx, dx) - origin.x) / dx : Infinity;
  let tMaxY = Math.abs(dy) > EPS ? (boundary(cy, dy) - origin.y) / dy : Infinity;

  let traversed = 0;
  const maxTraversedCells = Math.max(1000, (2 * halfExtent + 3) ** 2);
  while (traversed++ < maxTraversedCells) {
    let bestT = Infinity, bestCenter = null;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
      if (Math.abs(ix) > halfExtent || Math.abs(iy) > halfExtent) continue;
      const c = new THREE.Vector3(center1D(ix, spacing, offset), center1D(iy, spacing, offset), 0);
      if (source === 'lattice' && c.lengthSq() < 1e-14) continue;
      const t = raySphereT(origin, directionUnit, c, collisionRadius);
      if (t < bestT) { bestT = t; bestCenter = c; }
    }
    const nextT = Math.min(tMaxX, tMaxY);
    if (bestCenter && bestT <= nextT + 1e-8) return { t: bestT, center: bestCenter };
    if (!Number.isFinite(nextT)) return null;
    if (tMaxX <= nextT + 1e-10) { cx += stepX; tMaxX += tDeltaX; }
    if (tMaxY <= nextT + 1e-10) { cy += stepY; tMaxY += tDeltaY; }
    if (Math.abs(cx) > halfExtent + 1 || Math.abs(cy) > halfExtent + 1) return null;
  }
  return null;
}

function simulate(params, mode, source) {
  const start = new THREE.Vector3(0, 0, 0);
  const theta = params.thetaDeg * Math.PI / 180;
  const initialVelocity = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0).multiplyScalar(params.speed);
  let p = start.clone(), v = initialVelocity.clone(), totalTime = 0, maxSpeedError = 0;
  const positions = [start.clone()], collisions = [];
  let reason = 'collision target reached';

  for (let i = 0; i < params.collisionTarget; i++) {
    const hit = mode === '2D' ? firstCollision2D(p, v.clone().normalize(), params, source) : firstCollision3D(p, v.clone().normalize(), params, source);
    if (!hit) { reason = 'left the finite lattice / no further collision'; break; }
    const point = p.clone().add(v.clone().multiplyScalar(hit.t / params.speed));
    if (mode === '2D') point.z = 0;
    const normal = point.clone().sub(hit.center).normalize();
    if (mode === '2D') normal.z = 0;
    const before = v.clone();
    const after = v.clone().sub(normal.clone().multiplyScalar(2 * v.dot(normal)));
    if (mode === '2D') after.z = 0;
    const flightTime = hit.t / params.speed;
    totalTime += flightTime;
    maxSpeedError = Math.max(maxSpeedError, Math.abs(after.length() - params.speed));
    collisions.push({ index: i + 1, point, normal, velocityBefore: before, velocityAfter: after, obstacle: hit.center, flightTime, cumulativeTime: totalTime });
    positions.push(point.clone());
    p = point.clone().add(normal.clone().multiplyScalar(1e-8 * params.spacing));
    v = after;
  }
  return { start, initialVelocity, positions, collisions, totalTime, reachedTarget: collisions.length === params.collisionTarget, terminatedReason: reason, maxSpeedError };
}

const statsEl = document.querySelector('#stats');
const val = id => Number(document.querySelector('#' + id).value);
const readParams = () => ({
  spacing: val('spacing'), obstacleRadius: val('obstacleRadius'), projectileRadius: val('projectileRadius'), speed: val('speed'), thetaDeg: val('theta'),
  collisionTarget: Math.max(1, Math.floor(val('collisions'))), halfExtent: Math.max(2, Math.floor(val('halfExtent')))
});

const modeButtons = [...document.querySelectorAll('[data-mode]')];
const sourceButtons = [...document.querySelectorAll('[data-source]')];
let mode = '3D';
let source = 'injected';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050816);
scene.fog = new THREE.Fog(0x050816, 90, 260);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1400);
camera.position.set(42, 34, 52);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0x9bbcff, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 3.4); key.position.set(40, 60, 35); key.castShadow = true; scene.add(key);

const gridHelper = new THREE.GridHelper(190, 38, 0x294268, 0x14213a);
scene.add(gridHelper);
const latticeGroup = new THREE.Group();
const pathGroup = new THREE.Group();
scene.add(latticeGroup, pathGroup);
const projectile = new THREE.Mesh(new THREE.SphereGeometry(.45, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: .22, metalness: .2, emissive: 0x1f2937 }));
projectile.castShadow = true;
scene.add(projectile);
const startMarker = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
scene.add(startMarker);

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    obj.traverse(n => {
      if (n.isMesh || n.isLine || n.isLineSegments) {
        n.geometry?.dispose();
        if (Array.isArray(n.material)) n.material.forEach(m => m.dispose()); else n.material?.dispose();
      }
    });
  }
}

function buildLattice(params) {
  clearGroup(latticeGroup);
  const count = 2 * params.halfExtent + 1;
  const total = mode === '2D' ? count ** 2 : count ** 3;
  const geometry = new THREE.SphereGeometry(params.obstacleRadius, mode === '2D' ? 18 : 10, mode === '2D' ? 12 : 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x3b82c4, roughness: .46, metalness: .06, transparent: true, opacity: .78 });
  const mesh = new THREE.InstancedMesh(geometry, material, total);
  const dummy = new THREE.Object3D();
  let k = 0;
  const o = latticeOffset(params.spacing, source);
  if (mode === '2D') {
    for (let x = -params.halfExtent; x <= params.halfExtent; x++) for (let y = -params.halfExtent; y <= params.halfExtent; y++) {
      if (source === 'lattice' && x === 0 && y === 0) continue;
      dummy.position.set(o + x * params.spacing, o + y * params.spacing, 0);
      dummy.updateMatrix(); mesh.setMatrixAt(k++, dummy.matrix);
    }
  } else {
    for (let x = -params.halfExtent; x <= params.halfExtent; x++) for (let y = -params.halfExtent; y <= params.halfExtent; y++) for (let z = -params.halfExtent; z <= params.halfExtent; z++) {
      if (source === 'lattice' && x === 0 && y === 0 && z === 0) continue;
      dummy.position.set(o + x * params.spacing, o + y * params.spacing, o + z * params.spacing);
      dummy.updateMatrix(); mesh.setMatrixAt(k++, dummy.matrix);
    }
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  latticeGroup.add(mesh);
  const extent = (params.halfExtent + 1) * params.spacing;
  gridHelper.visible = mode === '3D';
  gridHelper.scale.set(extent / 95, 1, extent / 95);
}

function createLine(points, color, opacity = .95) {
  if (points.length < 2) return null;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  pathGroup.add(line);
  return line;
}

function addTrajectory(res) {
  clearGroup(pathGroup);
  // The full trajectory is built only once for geometry bounds. During animation its draw range is progressively revealed.
  if (res.positions.length < 2) return;
  const geometry = new THREE.BufferGeometry().setFromPoints(res.positions);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xfb7185, transparent: true, opacity: .98 }));
  geometry.setDrawRange(0, 1);
  line.userData.isTrajectory = true;
  pathGroup.add(line);
  line.userData.pointsCount = res.positions.length;

  for (const e of res.collisions) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.08, effectiveProjectileRadius(readParams(), source) * .08), 8, 6), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    m.position.copy(e.point); m.visible = false; m.userData.segment = e.index; m.userData.isCollisionMarker = true;
    pathGroup.add(m);
  }
}

function revealTrajectory(segment) {
  const line = pathGroup.children.find(o => o.userData.isTrajectory);
  if (line) line.geometry.setDrawRange(0, Math.max(1, Math.min(segment + 1, line.userData.pointsCount)));
  for (const child of pathGroup.children) {
    if (child.userData.isCollisionMarker) child.visible = child.userData.segment <= segment;
  }
}

function fmt(n) { return Number(n).toFixed(5); }

function updateRecord() {
  const settings = document.querySelector('#settingsRecord');
  const body = document.querySelector('#collisionBody');
  if (!result) {
    settings.innerHTML = '<div><span>Status</span><b>No simulation</b></div>';
    body.innerHTML = '';
    return;
  }
  const p = readParams();
  const rows = [
    ['Mode', mode], ['Moving entity', source === 'lattice' ? 'Lattice ball' : 'Injected ball'],
    ['Spacing a', p.spacing], ['Obstacle radius', p.obstacleRadius], ['Moving radius', effectiveProjectileRadius(p, source)],
    ['Speed v', p.speed], ['Angle θ', `${p.thetaDeg}°`], ['Target collisions', p.collisionTarget],
    ['Half-extent', p.halfExtent], ['Animation', `${val('animMs')} ms / segment`], ['Reached', `${result.collisions.length} / ${p.collisionTarget}`]
  ];
  settings.innerHTML = rows.map(([k,v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  const startRow = `<tr><td>0</td><td>${fmt(result.start.x)}</td><td>${fmt(result.start.y)}</td><td>${fmt(result.start.z)}</td><td>${fmt(result.initialVelocity.x)}</td><td>${fmt(result.initialVelocity.y)}</td><td>${fmt(result.initialVelocity.z)}</td><td>—</td><td>0.00000</td></tr>`;
  body.innerHTML = startRow + result.collisions.map(e => `<tr><td>${e.index}</td><td>${fmt(e.point.x)}</td><td>${fmt(e.point.y)}</td><td>${fmt(e.point.z)}</td><td>${fmt(e.velocityAfter.x)}</td><td>${fmt(e.velocityAfter.y)}</td><td>${fmt(e.velocityAfter.z)}</td><td>${fmt(e.flightTime)}</td><td>${fmt(e.cumulativeTime)}</td></tr>`).join('');
}

function downloadCSV() {
  if (!result) return;
  const p = readParams();
  const lines = [];
  lines.push(['mode', mode, 'moving_entity', source, 'spacing_a', p.spacing, 'obstacle_radius', p.obstacleRadius, 'moving_radius', effectiveProjectileRadius(p, source), 'speed', p.speed, 'theta_deg', p.thetaDeg, 'target_collisions', p.collisionTarget, 'half_extent', p.halfExtent].join(','));
  lines.push('collision,x,y,z,vx,vy,vz,flight_time,cumulative_time');
  for (const e of result.collisions) lines.push([e.index,e.point.x,e.point.y,e.point.z,e.velocityAfter.x,e.velocityAfter.y,e.velocityAfter.z,e.flightTime,e.cumulativeTime].join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `celestial-lattice-${mode.toLowerCase()}-${source}-history.csv`; a.click();
  URL.revokeObjectURL(url);
}

function updateStats() {
  if (!result) {
    statsEl.innerHTML = '<strong>Ready.</strong><br>Run the simulation to compute the collision sequence.';
    return;
  }
  const last = result.collisions.at(-1), p = last?.point ?? result.start, speed = last?.velocityAfter.length() ?? result.initialVelocity.length();
  statsEl.innerHTML = `<strong>${result.collisions.length}</strong> / ${readParams().collisionTarget} collisions<br>Position: (<strong>${p.x.toFixed(4)}</strong>, <strong>${p.y.toFixed(4)}</strong>, <strong>${p.z.toFixed(4)}</strong>)<br>Speed: <strong>${speed.toFixed(5)}</strong> &nbsp;|&nbsp; |Δv| max error: <strong>${result.maxSpeedError.toExponential(2)}</strong><br>Flight time: <strong>${result.totalTime.toFixed(5)}</strong><br>Mode: <strong>${mode}</strong> &nbsp;|&nbsp; Moving entity: <strong>${source === 'lattice' ? 'lattice ball' : 'injected ball'}</strong> &nbsp;|&nbsp; Status: <strong>${result.reachedTarget ? 'target reached' : result.terminatedReason}</strong>`;
}

function placeProjectile(segment) {
  if (!result) return;
  const i = Math.max(0, Math.min(segment, result.positions.length - 1));
  projectile.position.copy(result.positions[i]);
  revealTrajectory(i);
  displaySegment = i;
}

function frameCamera(res) {
  const box = new THREE.Box3().setFromPoints(res.positions);
  const center = box.getCenter(new THREE.Vector3());
  const size = Math.max(12, box.getSize(new THREE.Vector3()).length());
  controls.target.copy(center);
  const dir = mode === '2D' ? new THREE.Vector3(0, 0, 1) : camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(center.clone().add(dir.multiplyScalar(Math.max(24, size * .75))));
  camera.lookAt(center);
}

function beginCinematicCamera() {
  if (!result) return;
  cinematic = true;
  controls.enabled = false;
  const p = result.positions[0];
  const next = result.positions[1] ?? p.clone().add(result.initialVelocity.clone().normalize());
  const direction = next.clone().sub(p).normalize();
  if (mode === '2D') {
    camera.position.set(p.x, p.y, Math.max(26, readParams().halfExtent * readParams().spacing * 0.8));
    camera.lookAt(p.x, p.y, 0);
  } else {
    const side = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const offset = direction.clone().multiplyScalar(-9).add(new THREE.Vector3(0, 6, 0)).add(side.multiplyScalar(5));
    camera.position.copy(p).add(offset);
    camera.lookAt(p.clone().add(direction.multiplyScalar(10)));
  }
}

function followParticle() {
  if (!result || !cinematic) return;
  const i = displaySegment;
  const p = result.positions[i];
  const next = result.positions[Math.min(i + 1, result.positions.length - 1)];
  let direction = next.clone().sub(p);
  if (direction.lengthSq() < 1e-12 && i > 0) direction = p.clone().sub(result.positions[i - 1]);
  direction.normalize();
  if (mode === '2D') {
    const desired = new THREE.Vector3(p.x, p.y, Math.max(22, readParams().halfExtent * readParams().spacing * 0.62));
    camera.position.lerp(desired, 0.22);
    camera.lookAt(p.x, p.y, 0);
  } else {
    const side = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const desired = p.clone().add(direction.clone().multiplyScalar(-9)).add(new THREE.Vector3(0, 5.5, 0)).add(side.multiplyScalar(4.5));
    camera.position.lerp(desired, 0.18);
    const look = p.clone().add(direction.clone().multiplyScalar(8));
    const currentTarget = controls.target.clone();
    currentTarget.lerp(look, 0.18);
    controls.target.copy(currentTarget);
    camera.lookAt(currentTarget);
  }
}

let result = null;
let displaySegment = 0;
let running = false;
let cinematic = false;
let lastAdvance = performance.now();

function syncSourceUI() {
  const latticeMode = source === 'lattice';
  sourceButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.source === source));
  document.querySelector('#source-label').textContent = latticeMode ? 'Lattice ball' : 'Injected projectile';
  const projectileInput = document.querySelector('#projectileRadius');
  projectileInput.disabled = latticeMode;
  projectileInput.title = latticeMode ? 'Locked: moving lattice ball has the same radius as each lattice sphere.' : '';
  if (latticeMode) projectileInput.value = document.querySelector('#obstacleRadius').value;
}

function setSource(nextSource, rerun = true) {
  source = nextSource;
  syncSourceUI();
  if (rerun) runSimulation();
}

function setMode(nextMode, rerun = true) {
  mode = nextMode;
  modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  document.querySelector('#mode-label').textContent = mode === '3D' ? '3D spatial lattice' : '2D planar lattice';
  if (rerun) runSimulation();
}

function runSimulation() {
  const params = readParams();
  if (source === 'lattice') {
    document.querySelector('#projectileRadius').value = params.obstacleRadius;
    params.projectileRadius = params.obstacleRadius;
    if (2 * params.obstacleRadius >= params.spacing) {
      running = false;
      statsEl.innerHTML = '<strong>Invalid geometry:</strong><br>equal lattice balls require 2 × obstacle radius < spacing a.';
      return;
    }
  } else if (params.obstacleRadius + params.projectileRadius >= params.spacing * 0.5) {
    running = false;
    statsEl.innerHTML = '<strong>Invalid geometry:</strong><br>obstacle radius + projectile radius must be less than a/2.';
    return;
  }
  buildLattice(params);
  projectile.scale.setScalar(effectiveProjectileRadius(params, source) / 0.45);
  result = simulate(params, mode, source);
  addTrajectory(result);
  displaySegment = 0;
  projectile.position.copy(result.start);
  revealTrajectory(0);
  updateStats();
  updateRecord();
  beginCinematicCamera();
  running = true;
  lastAdvance = performance.now();
}

document.querySelector('#run').onclick = runSimulation;
document.querySelector('#reset').onclick = () => {
  running = false;
  cinematic = false;
  controls.enabled = true;
  displaySegment = 0;
  if (result) {
    projectile.position.copy(result.start);
    revealTrajectory(0);
    frameCamera(result);
  } else projectile.position.set(0, 0, 0);
  updateStats();
  updateRecord();
};
document.querySelector('#step').onclick = () => {
  if (!result) runSimulation();
  running = false;
  cinematic = false;
  controls.enabled = true;
  if (result) {
    placeProjectile(displaySegment + 1);
    updateStats();
    updateRecord();
  }
};
modeButtons.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
sourceButtons.forEach(btn => btn.addEventListener('click', () => setSource(btn.dataset.source)));
document.querySelector('#obstacleRadius').addEventListener('input', () => { if (source === 'lattice') document.querySelector('#projectileRadius').value = document.querySelector('#obstacleRadius').value; });
document.querySelector('#downloadCsv').addEventListener('click', downloadCSV);

setMode('3D', false);
setSource('injected', false);
updateRecord();
runSimulation();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate(now) {
  requestAnimationFrame(animate);
  if (running && result && displaySegment < result.positions.length - 1) {
    const interval = Math.max(10, val('animMs'));
    if (now - lastAdvance >= interval) {
      placeProjectile(displaySegment + 1);
      lastAdvance = now;
      updateStats();
      followParticle();
    }
  } else if (running && result) {
    running = false;
    cinematic = false;
    controls.enabled = true;
    updateStats();
    frameCamera(result);
  }
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
