import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- CONFIGURATION ET ÉTAT ---
const AU_TO_KM = 149597870.7;
const EARTH_RADIUS_KM = 6371;
const MOON_DIST = 30;
let moonAngle = 0;
let asteroidBody, asteroidDataList = [];
let currentVelocityVec = new THREE.Vector3(0, 0, 0);
let startPos = new THREE.Vector3(0, 0, 0); 
let trajectoryLine; 

// Contrôle de vitesse (Global Time Scale)
let timeScale = 1.0; 

// Système de particules (Poussière / Traînée)
let dustParticles = [];
const MAX_PARTICLES = 60;

// Ceintures de Satellites
let satelliteBands = new THREE.Group();

// --- INITIALISATION SCÈNE ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Éclairage Solaire
const sun = new THREE.DirectionalLight(0xffffff, 3.5);
sun.position.set(20, 10, 20);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x444444));

const loader = new THREE.TextureLoader();

// --- OBJETS CÉLESTES FIXES ---
const earthGroup = new THREE.Group();

// 1. La Terre HD
const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshPhongMaterial({
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg'),
        specularMap: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg'),
        shininess: 15
    })
);

// 2. Les Nuages
const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.02, 64, 64),
    new THREE.MeshPhongMaterial({
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'),
        transparent: true, 
        opacity: 0.4
    })
);

earthGroup.add(earth, clouds);
scene.add(earthGroup);

// 3. La Lune
const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 32, 32),
    new THREE.MeshPhongMaterial({ map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg') })
);
scene.add(moon);

// 4. Champ d'étoiles
const starGeo = new THREE.BufferGeometry();
const starPos = [];
for(let i=0; i<8000; i++) {
    starPos.push((Math.random()-0.5)*2000, (Math.random()-0.5)*2000, (Math.random()-0.5)*2000);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2 })));

// 5. Satellites LEO & GEO
function createSatelliteBand(count, radius, spread, color) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius + (Math.random() - 0.5) * spread;
        pos.push(Math.cos(angle) * dist, (Math.random() - 0.5) * spread * 0.5, Math.sin(angle) * dist);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: color, size: 0.02, transparent: true, opacity: 0.6 }));
}
satelliteBands.add(createSatelliteBand(2500, 1.2, 0.1, 0x00ffff)); 
satelliteBands.add(createSatelliteBand(1500, 2.5, 0.2, 0xffff00)); 
scene.add(satelliteBands);

camera.position.set(15, 15, 25);

// --- INTERFACE DE VITESSE ---
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-val');
if(speedSlider) {
    speedSlider.addEventListener('input', (e) => {
        timeScale = parseFloat(e.target.value);
        if(speedDisplay) speedDisplay.innerText = `${timeScale.toFixed(1)}x`;
    });
}

// --- PARTICULES ---
function createDustParticle() {
    const geo = new THREE.SphereGeometry(0.04, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const p = new THREE.Mesh(geo, mat);
    scene.add(p);
    return { mesh: p, life: 1.0 };
}

function updateParticles() {
    if (!asteroidBody) return;
    if (dustParticles.length < MAX_PARTICLES) dustParticles.push(createDustParticle());
    const p = dustParticles.shift();
    p.mesh.position.copy(asteroidBody.position);
    p.life = 1.0;
    p.mesh.material.opacity = 0.8;
    p.mesh.scale.setScalar(1.0);
    dustParticles.push(p);
    dustParticles.forEach(particle => {
        particle.life -= 0.02 * (timeScale > 0.1 ? timeScale : 0.1);
        particle.mesh.material.opacity = particle.life;
        particle.mesh.scale.setScalar(particle.life);
    });
}

// --- NASA API ---
async function fetchTop10() {
    const now = new Date().toISOString().split('T')[0];
    const targetUrl = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${now}&date-max=2126-01-01&dist-max=0.05&sort=dist`;
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);
    try {
        const res = await fetch(proxyUrl);
        const json = await res.json();
        asteroidDataList = json.data.slice(0, 10);
        populateSelect();
        updateDisplay(0); 
    } catch (e) { console.error("NASA API Error"); }
}

function populateSelect() {
    const select = document.getElementById('asteroid-select');
    if(!select) return;
    select.innerHTML = ""; 
    asteroidDataList.forEach((ast, index) => {
        const opt = document.createElement('option');
        opt.value = index; opt.innerText = `${ast[0]}`;
        select.appendChild(opt);
    });
    select.addEventListener('change', (e) => updateDisplay(e.target.value));
}

function updateDisplay(index) {
    const data = asteroidDataList[index];
    const distKm = parseFloat(data[4]) * AU_TO_KM;
    const velocityKms = parseFloat(data[7]);
    
    // CORRECTION MAGNITUDE : Check NASA index 10 (H)
    const rawMag = data[10];
    const magH = (rawMag !== null && rawMag !== undefined && rawMag !== "") ? parseFloat(rawMag) : 22.0;

    // Calculs de Masse et Énergie basés sur la Magnitude corrigée
    let sizeM = Math.round(Math.pow(10, (3.122 - 0.5 * magH)) * 1000);
    if (sizeM <= 0 || isNaN(sizeM)) sizeM = 150; 
    const mass = ((4/3) * Math.PI * Math.pow(sizeM/2, 3)) * 3000;
    const energy = (0.5 * mass * Math.pow(velocityKms * 1000, 2)) / 4.184e15;

    // Mise à jour du HUD
    document.getElementById('obj-name').innerText = `TARGET: ${data[0]}`;
    document.getElementById('obj-dist').innerText = `MISS DISTANCE: ${Math.round(distKm).toLocaleString()} KM`;
    document.getElementById('obj-energy').innerText = `ENERGY: ${energy.toFixed(2)} MT`;
    document.getElementById('obj-danger').innerHTML = distKm < 45000 ? `<span class="warning">SATELLITE IMPACT RISK</span>` : `STATUS: CLEAR PATH`;
    document.getElementById('obj-date').innerText = `ARRIVAL: ${data[3]}`;
    document.getElementById('obj-size').innerText = `DIAMETER: ~${sizeM} M`;
    document.getElementById('obj-velocity').innerText = `VELOCITY: ${velocityKms.toFixed(2)} KM/S`;
    document.getElementById('obj-mag').innerText = `MAGNITUDE: ${magH.toFixed(1)} (H)`;

    // TRAJECTOIRE
    const visualMissDist = Math.max(0.5, Math.min(distKm / 15000, 15)); 
    const baseSpeed = velocityKms / 100;
    const flightDir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.2, Math.random() - 0.5).normalize();
    const offsetDir = new THREE.Vector3().crossVectors(flightDir, new THREE.Vector3(0, 1, 0)).normalize();
    
    currentVelocityVec.copy(flightDir).multiplyScalar(baseSpeed);
    startPos.copy(flightDir).multiplyScalar(-60).add(offsetDir.multiplyScalar(visualMissDist));

    initAsteroid3D(index, startPos, flightDir);
}

function initAsteroid3D(seed, position, direction) {
    if(asteroidBody) scene.remove(asteroidBody);
    if(trajectoryLine) scene.remove(trajectoryLine);

    const detail = 2 + (seed % 2); 
    const astGeo = new THREE.IcosahedronGeometry(0.4, detail);
    const posAttr = astGeo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
        const noise = 0.75 + (Math.sin(i + seed) * 0.35); 
        posAttr.setXYZ(i, posAttr.getX(i) * noise, posAttr.getY(i) * noise, posAttr.getZ(i) * noise);
    }

    const palette = [0x888888, 0x616161, 0x424242, 0x3e2723, 0x546e7a, 0x78909c, 0x263238, 0x4e342e, 0x757575, 0x212121];
    asteroidBody = new THREE.Mesh(astGeo, new THREE.MeshPhongMaterial({ 
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg'),
        color: palette[seed % palette.length], bumpScale: 0.15, emissive: 0x111111
    }));

    asteroidBody.position.copy(position);
    scene.add(asteroidBody);

    const linePoints = [position.clone().add(direction.clone().multiplyScalar(-100)), position.clone().add(direction.clone().multiplyScalar(200))];
    trajectoryLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 }));
    scene.add(trajectoryLine);
}

function animate() {
    requestAnimationFrame(animate);
    earth.rotation.y += 0.0005 * timeScale;
    clouds.rotation.y += 0.0007 * timeScale;
    moonAngle += 0.002 * timeScale;
    moon.position.set(Math.cos(moonAngle) * MOON_DIST, 0, Math.sin(moonAngle) * MOON_DIST);
    
    satelliteBands.children.forEach(band => band.rotation.y += 0.0005 * timeScale);

    if(asteroidBody) {
        const frameVelocity = currentVelocityVec.clone().multiplyScalar(timeScale);
        asteroidBody.position.add(frameVelocity);
        asteroidBody.rotation.y += 0.02 * timeScale;

        if(asteroidBody.position.length() > 100) {
            asteroidBody.position.copy(startPos);
        }

        const d = asteroidBody.position.length();
        asteroidBody.material.emissive.setHex(d < 2.8 ? 0xff0000 : 0x111111);
        updateParticles();
    }
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

fetchTop10();
animate();
