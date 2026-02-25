import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- CONFIGURATION ET ÉTAT ---
const AU_TO_KM = 149597870.7;
const MOON_DIST = 30;
let moonAngle = 0;
let asteroidBody, asteroidDataList = [];
let currentVelocityVec = new THREE.Vector3(0, 0, 0); // Vecteur de direction unique

// --- INITIALISATION SCÈNE ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(10, 5, 10);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x333333));

const loader = new THREE.TextureLoader();

// --- OBJETS CÉLESTES FIXES ---
const earthGroup = new THREE.Group();
const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshPhongMaterial({
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg'),
        specularMap: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg'),
        shininess: 15
    })
);
const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.02, 64, 64),
    new THREE.MeshPhongMaterial({
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'),
        transparent: true, opacity: 0.5
    })
);
earthGroup.add(earth, clouds);
scene.add(earthGroup);

const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 32, 32),
    new THREE.MeshPhongMaterial({
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg')
    })
);
scene.add(moon);

const starGeo = new THREE.BufferGeometry();
const starPos = [];
for(let i=0; i<8000; i++) {
    starPos.push((Math.random()-0.5)*2000, (Math.random()-0.5)*2000, (Math.random()-0.5)*2000);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2 })));

camera.position.set(0, 3, 10);

// --- LOGIQUE NASA ---
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
    } catch (e) {
        console.error("NASA API Error");
    }
}

function populateSelect() {
    const select = document.getElementById('asteroid-select');
    select.innerHTML = ""; 
    asteroidDataList.forEach((ast, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.innerText = `${ast[0]}`;
        select.appendChild(opt);
    });
    select.addEventListener('change', (e) => updateDisplay(e.target.value));
}

function updateDisplay(index) {
    const data = asteroidDataList[index];
    const name = data[0];
    const dateStr = data[3];
    const distKm = parseFloat(data[4]) * AU_TO_KM;
    const velocityKms = parseFloat(data[7]);
    const magH = data[10] ? parseFloat(data[10]) : 22;

    // Calcul Diamètre & Énergie (Sécurité anti-zéro)
    let sizeM = Math.round(Math.pow(10, (3.122 - 0.5 * magH)) * 1000);
    if (sizeM <= 0 || isNaN(sizeM)) sizeM = 150; 
    const mass = ((4/3) * Math.PI * Math.pow(sizeM/2, 3)) * 3000;
    const energy = (0.5 * mass * Math.pow(velocityKms * 1000, 2)) / 4.184e15;

    // HUD
    document.getElementById('obj-name').innerText = `TARGET: ${name}`;
    document.getElementById('obj-dist').innerText = `CLOSEST: ${Math.round(distKm).toLocaleString()} KM`;
    document.getElementById('obj-energy').innerText = `ENERGY: ${energy.toFixed(2)} MT`;
    document.getElementById('obj-danger').innerHTML = distKm < 50000 ? `<span class="warning">DANGER CRITIQUE</span>` : `STATUS: TRACKING`;
    document.getElementById('obj-date').innerText = `ARRIVAL: ${dateStr}`;
    document.getElementById('obj-size').innerText = `DIAMETER: ~${sizeM} M`;
    document.getElementById('obj-velocity').innerText = `VELOCITY: ${velocityKms.toFixed(2)} KM/S`;
    document.getElementById('obj-mag').innerText = `MAGNITUDE: ${magH} (H)`;

    // --- CALCUL DE TRAJECTOIRE UNIQUE ---
    // On définit une direction basée sur l'index pour que chaque objet ait son propre angle
    const angle = (index / 10) * Math.PI * 2;
    const speedScale = velocityKms / 150; // Ajustement visuel de la vitesse
    currentVelocityVec.set(
        Math.cos(angle) * speedScale,
        (Math.random() - 0.5) * 0.01, // Légère variation verticale
        Math.sin(angle) * speedScale
    );

    initAsteroid3D();
}

function initAsteroid3D() {
    if(asteroidBody) scene.remove(asteroidBody);

    const astGeo = new THREE.IcosahedronGeometry(0.2, 3);
    const pos = astGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const noise = 0.8 + Math.random() * 0.4;
        pos.setXYZ(i, pos.getX(i) * noise, pos.getY(i) * noise, pos.getZ(i) * noise);
    }

    asteroidBody = new THREE.Mesh(astGeo, new THREE.MeshPhongMaterial({ 
        map: loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg'),
        color: 0x999999 
    }));

    // Position de départ : On le place loin à l'opposé de sa direction pour qu'il "traverse"
    asteroidBody.position.set(
        -currentVelocityVec.x * 250,
        -currentVelocityVec.y * 250,
        -currentVelocityVec.z * 250
    );
    
    scene.add(asteroidBody);
}

// --- ANIMATION ---
function animate() {
    requestAnimationFrame(animate);
    
    earth.rotation.y += 0.0005;
    clouds.rotation.y += 0.0007;
    moonAngle += 0.002;
    moon.position.set(Math.cos(moonAngle) * MOON_DIST, 0, Math.sin(moonAngle) * MOON_DIST);

    if(asteroidBody) {
        // Appliquer la direction unique
        asteroidBody.position.add(currentVelocityVec);
        
        asteroidBody.rotation.y += 0.01;
        asteroidBody.rotation.x += 0.005;

        // Boucle de reset si l'objet s'éloigne (distance > 40)
        if(asteroidBody.position.length() > 40) {
            asteroidBody.position.set(
                -currentVelocityVec.x * 250,
                -currentVelocityVec.y * 250,
                -currentVelocityVec.z * 250
            );
        }

        // Effet visuel d'alerte proximité
        const d = asteroidBody.position.length();
        if(d < 2.5) {
            asteroidBody.material.emissive.setHex(0xff0000);
            asteroidBody.material.emissiveIntensity = 0.6;
        } else {
            asteroidBody.material.emissive.setHex(0x000000);
        }
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