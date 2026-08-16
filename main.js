import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EPS = 1e-9;
const MIN_T = 1e-7;

function offsetCenter(spacing) { return new THREE.Vector3(0.48 * spacing, 0.48 * spacing, 0.48 * spacing); }
function latticeIndex(p, spacing, offset) { return new THREE.Vector3(Math.floor((p.x-offset.x)/spacing+0.5), Math.floor((p.y-offset.y)/spacing+0.5), Math.floor((p.z-offset.z)/spacing+0.5)); }
function centerAt(index, spacing, offset) { return new THREE.Vector3(offset.x+index.x*spacing, offset.y+index.y*spacing, offset.z+index.z*spacing); }

function raySphereT(origin, directionUnit, center, radius) {
  const oc = origin.clone().sub(center);
  const b = oc.dot(directionUnit);
  const c = oc.lengthSq() - radius*radius;
  const disc = b*b - c;
  if (disc < -EPS) return Infinity;
  const s = Math.sqrt(Math.max(0, disc));
  const t0 = -b-s;
  const t1 = -b+s;
  if (t0 > MIN_T) return t0;
  if (t1 > MIN_T) return t1;
  return Infinity;
}

// Amanatides-Woo-style traversal. Only a 3x3x3 neighborhood is tested per visited cell.
function firstCollision(origin, directionUnit, params) {
  const {spacing, halfExtent} = params;
  const collisionRadius = params.obstacleRadius + params.projectileRadius;
  const offset = offsetCenter(spacing);
  let cell = latticeIndex(origin, spacing, offset);
  if (Math.abs(cell.x)>halfExtent || Math.abs(cell.y)>halfExtent || Math.abs(cell.z)>halfExtent) return null;

  const dir = directionUnit;
  const step = new THREE.Vector3(dir.x>=0?1:-1, dir.y>=0?1:-1, dir.z>=0?1:-1);
  const tDelta = new THREE.Vector3(Math.abs(dir.x)>EPS?spacing/Math.abs(dir.x):Infinity, Math.abs(dir.y)>EPS?spacing/Math.abs(dir.y):Infinity, Math.abs(dir.z)>EPS?spacing/Math.abs(dir.z):Infinity);
  const boundary = (axisCell, axis) => {
    const c = offset[axis] + axisCell*spacing;
    return dir[axis]>=0 ? c+spacing*0.5 : c-spacing*0.5;
  };
  const tMax = new THREE.Vector3(Math.abs(dir.x)>EPS?(boundary(cell.x,'x')-origin.x)/dir.x:Infinity, Math.abs(dir.y)>EPS?(boundary(cell.y,'y')-origin.y)/dir.y:Infinity, Math.abs(dir.z)>EPS?(boundary(cell.z,'z')-origin.z)/dir.z:Infinity);

  let traversed = 0;
  const maxTraversedCells = Math.max(1000, (2*halfExtent+3)**3);
  while (traversed++ < maxTraversedCells) {
    let bestT = Infinity, bestCenter = null;
    for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) for (let dz=-1; dz<=1; dz++) {
      const ix=cell.x+dx, iy=cell.y+dy, iz=cell.z+dz;
      if (Math.abs(ix)>halfExtent || Math.abs(iy)>halfExtent || Math.abs(iz)>halfExtent) continue;
      const c = centerAt(new THREE.Vector3(ix,iy,iz), spacing, offset);
      const t = raySphereT(origin, dir, c, collisionRadius);
      if (t<bestT) { bestT=t; bestCenter=c; }
    }
    const nextT = Math.min(tMax.x,tMax.y,tMax.z);
    if (bestCenter && bestT <= nextT + 1e-8) return {t:bestT, center:bestCenter};
    if (!Number.isFinite(nextT)) return null;
    if (tMax.x <= nextT+1e-10) { cell.x += step.x; tMax.x += tDelta.x; }
    if (tMax.y <= nextT+1e-10) { cell.y += step.y; tMax.y += tDelta.y; }
    if (tMax.z <= nextT+1e-10) { cell.z += step.z; tMax.z += tDelta.z; }
    if (Math.abs(cell.x)>halfExtent+1 || Math.abs(cell.y)>halfExtent+1 || Math.abs(cell.z)>halfExtent+1) return null;
  }
  return null;
}

function simulate(params) {
  const start = new THREE.Vector3(0,0,0);
  const theta = params.thetaDeg*Math.PI/180;
  const initialVelocity = new THREE.Vector3(Math.cos(theta),Math.sin(theta),0).multiplyScalar(params.speed);
  let p=start.clone(), v=initialVelocity.clone(), totalTime=0, maxSpeedError=0;
  const positions=[start.clone()], collisions=[];
  let reason='collision target reached';
  for (let i=0;i<params.collisionTarget;i++) {
    const hit=firstCollision(p,v.clone().normalize(),params);
    if (!hit) { reason='left the finite lattice / no further collision'; break; }
    const point=p.clone().add(v.clone().multiplyScalar(hit.t/params.speed));
    const normal=point.clone().sub(hit.center).normalize();
    const before=v.clone();
    const after=v.clone().sub(normal.clone().multiplyScalar(2*v.dot(normal)));
    const flightTime=hit.t/params.speed;
    totalTime+=flightTime;
    maxSpeedError=Math.max(maxSpeedError,Math.abs(after.length()-params.speed));
    collisions.push({index:i+1, point, normal, velocityBefore:before, velocityAfter:after, obstacle:hit.center, flightTime, cumulativeTime:totalTime});
    positions.push(point.clone());
    p=point.clone().add(normal.clone().multiplyScalar(1e-8*params.spacing));
    v=after;
  }
  return {start,initialVelocity,positions,collisions,totalTime,reachedTarget:collisions.length===params.collisionTarget,terminatedReason:reason,maxSpeedError};
}

const app=document.querySelector('#app');
const panel=document.querySelector('.panel');
const statsEl=document.querySelector('#stats');
const val=id=>Number(document.querySelector('#'+id).value);
const readParams=()=>({spacing:val('spacing'),obstacleRadius:val('obstacleRadius'),projectileRadius:val('projectileRadius'),speed:val('speed'),thetaDeg:val('theta'),collisionTarget:Math.max(1,Math.floor(val('collisions'))),halfExtent:Math.max(2,Math.floor(val('halfExtent')))});

const scene=new THREE.Scene(); scene.background=new THREE.Color(0x050816); scene.fog=new THREE.Fog(0x050816,90,260);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,1000); camera.position.set(42,34,52);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; document.body.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
scene.add(new THREE.AmbientLight(0x9bbcff,2.0)); const key=new THREE.DirectionalLight(0xffffff,3.4); key.position.set(40,60,35); key.castShadow=true; scene.add(key);
const gridHelper=new THREE.GridHelper(190,38,0x294268,0x14213a); scene.add(gridHelper);
const latticeGroup=new THREE.Group(); const pathGroup=new THREE.Group(); scene.add(latticeGroup,pathGroup);
const projectile=new THREE.Mesh(new THREE.SphereGeometry(.45,20,14),new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:.22,metalness:.2,emissive:0x1f2937})); projectile.castShadow=true; scene.add(projectile);
const startMarker=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),new THREE.MeshBasicMaterial({color:0x34d399})); scene.add(startMarker);

function clearGroup(group){ while(group.children.length){const obj=group.children.pop(); obj.traverse(n=>{if(n.isMesh||n.isLine){n.geometry.dispose(); if(Array.isArray(n.material)) n.material.forEach(m=>m.dispose()); else n.material.dispose();}});} }
function buildLattice(params){
  clearGroup(latticeGroup);
  const count=2*params.halfExtent+1, total=count**3, geometry=new THREE.SphereGeometry(params.obstacleRadius,10,8), material=new THREE.MeshStandardMaterial({color:0x3b82c4,roughness:.46,metalness:.06,transparent:true,opacity:.78});
  const mesh=new THREE.InstancedMesh(geometry,material,total); const dummy=new THREE.Object3D(); let k=0; const o=.48*params.spacing;
  for(let x=-params.halfExtent;x<=params.halfExtent;x++) for(let y=-params.halfExtent;y<=params.halfExtent;y++) for(let z=-params.halfExtent;z<=params.halfExtent;z++) {dummy.position.set(o+x*params.spacing,o+y*params.spacing,o+z*params.spacing);dummy.updateMatrix();mesh.setMatrixAt(k++,dummy.matrix);}
  mesh.instanceMatrix.needsUpdate=true; latticeGroup.add(mesh); const extent=(params.halfExtent+1)*params.spacing; gridHelper.scale.set(extent/95,1,extent/95);
}
function addTrajectory(res){
  clearGroup(pathGroup); if(res.positions.length<2)return;
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(res.positions),new THREE.LineBasicMaterial({color:0xfb7185,transparent:true,opacity:.95})); pathGroup.add(line);
  for(const e of res.collisions){const m=new THREE.Mesh(new THREE.SphereGeometry(.105,8,6),new THREE.MeshBasicMaterial({color:0xfbbf24}));m.position.copy(e.point);pathGroup.add(m);}
}
function updateStats(){
  if(!result){statsEl.innerHTML='<strong>Ready.</strong><br>Run the simulation to compute the collision sequence.';return;}
  const last=result.collisions.at(-1), p=last?.point??result.start, speed=last?.velocityAfter.length()??result.initialVelocity.length();
  statsEl.innerHTML=`<strong>${result.collisions.length}</strong> / ${readParams().collisionTarget} collisions<br>Position: (<strong>${p.x.toFixed(4)}</strong>, <strong>${p.y.toFixed(4)}</strong>, <strong>${p.z.toFixed(4)}</strong>)<br>Speed: <strong>${speed.toFixed(5)}</strong> &nbsp;|&nbsp; |Δv| max error: <strong>${result.maxSpeedError.toExponential(2)}</strong><br>Flight time: <strong>${result.totalTime.toFixed(5)}</strong><br>Status: <strong>${result.reachedTarget?'target reached':result.terminatedReason}</strong>`;
}
function placeProjectile(segment){ if(!result)return; const i=Math.max(0,Math.min(segment,result.positions.length-1)); projectile.position.copy(result.positions[i]); displaySegment=i; }
function frameCamera(res){ const box=new THREE.Box3().setFromPoints(res.positions), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3()).length(); controls.target.copy(center); const dir=camera.position.clone().sub(controls.target).normalize(); camera.position.copy(center.clone().add(dir.multiplyScalar(Math.max(24,size*.75)))); camera.lookAt(center); }

let result=null, displaySegment=0, running=false, lastAdvance=performance.now();
function runSimulation(){
  const params=readParams();
  if(params.obstacleRadius+params.projectileRadius>=params.spacing*.5){statsEl.innerHTML='<strong>Invalid geometry:</strong><br>obstacle radius + projectile radius must be less than a/2.';return;}
  buildLattice(params); result=simulate(params); addTrajectory(result); displaySegment=0; projectile.position.copy(result.start); updateStats(); running=true; lastAdvance=performance.now(); frameCamera(result);
}
document.querySelector('#run').onclick=runSimulation;
document.querySelector('#reset').onclick=()=>{running=false;displaySegment=0;projectile.position.set(0,0,0);updateStats();};
document.querySelector('#step').onclick=()=>{if(!result)runSimulation();running=false;if(result){placeProjectile(displaySegment+1);updateStats();}};

runSimulation();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function animate(now){requestAnimationFrame(animate);controls.update();if(running&&result&&displaySegment<result.positions.length-1){const interval=Math.max(10,val('animMs'));if(now-lastAdvance>=interval){placeProjectile(displaySegment+1);lastAdvance=now;updateStats();}}else if(running&&result)running=false;renderer.render(scene,camera);}
requestAnimationFrame(animate);
