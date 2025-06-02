// main.js
import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

let camera, scene, renderer, controller;
const arrows = [], targets = [], explosions = [];
let score = 0;
const clock = new THREE.Clock();
let gameTime = 60;
let lastSpawn = 0;
let spawnInterval = 3;
const maxTargets = 2;
let gameOver = false;

const listener = new THREE.AudioListener();
const audioLoader = new THREE.AudioLoader();
const backgroundMusic = new THREE.Audio(listener);
let soundBuffer = null;

let vrHUDGroup = new THREE.Group();
let font, vrScoreMesh, vrGameOverMesh, restartBtnMesh;

init();
animate();

function init() {
  scene = new THREE.Scene();
  const loader = new THREE.TextureLoader();
  loader.load('./img/forest.jpg', texture => {
    scene.background = texture;
  });

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);
  camera.add(listener);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  const light = new THREE.HemisphereLight(0xffffff, 0x444444);
  light.position.set(0, 1, 0);
  scene.add(light);

  const waterTexture = loader.load('./img/water.jpg');
  waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
  waterTexture.repeat.set(4, 4);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ map: waterTexture })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  scene.add(floor);

  // Árboles eliminados para dejar vista despejada a los blancos

  controller = renderer.xr.getController(0);
  controller.addEventListener("selectstart", onSelectStart);
  scene.add(controller);

  audioLoader.load('Disparo.mp3', buffer => { soundBuffer = buffer; });
  audioLoader.load('Luz de Feria.mp3', buffer => {
    backgroundMusic.setBuffer(buffer);
    backgroundMusic.setLoop(true);
    backgroundMusic.setVolume(0.5);
    backgroundMusic.play();
  });

  const fontLoader = new FontLoader();
  fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', loadedFont => {
    font = loadedFont;
    createVRHUDTexts();
  });

  window.addEventListener("resize", onWindowResize);
  updateHUD();
}

function createVRHUDTexts() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  vrScoreMesh = createTextMesh(`Puntaje: ${score}`, mat);
  vrScoreMesh.position.set(-0.5, 0.3, -1);
  vrHUDGroup.add(vrScoreMesh);

  vrGameOverMesh = createTextMesh(``, mat);
  vrGameOverMesh.position.set(-0.5, 0.1, -1);
  vrHUDGroup.add(vrGameOverMesh);

  restartBtnMesh = createTextMesh(`Reiniciar`, mat);
  restartBtnMesh.position.set(-0.3, -0.1, -1);
  restartBtnMesh.visible = false;
  restartBtnMesh.userData.isRestartButton = true;
  vrHUDGroup.add(restartBtnMesh);

  scene.add(vrHUDGroup);
}

function createTextMesh(text, material) {
  const geo = new TextGeometry(text, { font, size: 0.1, height: 0.01 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.text = text;
  return mesh;
}

function updateText(mesh, newText) {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.geometry = new TextGeometry(newText, { font, size: 0.1, height: 0.01 });
}

function updateHUD() {
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const camDir = camera.getWorldDirection(new THREE.Vector3());
  vrHUDGroup.position.copy(camPos).add(camDir.multiplyScalar(1.5));
  vrHUDGroup.lookAt(camPos);

  updateText(vrScoreMesh, `Puntaje: ${score}`);
}

function spawnTarget() {
  const geometry = new THREE.CircleGeometry(0.4, 64);
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load('./img/target.png'); // Diana
  const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
  const target = new THREE.Mesh(geometry, material);
  target.position.set((Math.random() - 0.5) * 4, 1 + Math.random() * 2, -4);
  target.rotation.y = Math.PI;
  target.userData = {
    spawnTime: clock.elapsedTime,
    direction: Math.random() > 0.5 ? 1 : -1,
    speed: 0.5 + Math.random() * 0.5
  };
  scene.add(target);
  targets.push(target);
}

function createArrow() {
  const arrowGroup = new THREE.Group();

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
  );
  shaft.position.y = 0.25;
  arrowGroup.add(shaft);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.025, 0.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  tip.position.y = 0.5;
  arrowGroup.add(tip);

  // Plumas traseras
  const featherGeo = new THREE.PlaneGeometry(0.1, 0.05);
  const featherMat = new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const feather = new THREE.Mesh(featherGeo, featherMat);
    feather.position.set(0, 0, -0.02 + i * 0.02);
    feather.rotation.y = Math.PI / 2;
    arrowGroup.add(feather);
  }

  return arrowGroup;
}

function onSelectStart() {
  if (gameOver) {
    const intersects = controller.intersectObject ? controller.intersectObject(restartBtnMesh) : [];
    if (restartBtnMesh.visible) restartGame();
    return;
  }
  const arrow = createArrow();

  const tempMatrix = new THREE.Matrix4().extractRotation(controller.matrixWorld);
  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
  const position = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);

  arrow.position.copy(position);
  arrow.lookAt(position.clone().add(arrow.userData.velocity));
  arrow.userData.velocity = direction.multiplyScalar(3);

  if (soundBuffer) {
    const sound = new THREE.PositionalAudio(listener);
    sound.setBuffer(soundBuffer);
    sound.setVolume(1);
    arrow.add(sound);
    sound.play();
  }

  arrows.push(arrow);
  scene.add(arrow);
}

function restartGame() {
  gameOver = false;
  gameTime = 60;
  score = 0;
  arrows.forEach(a => scene.remove(a));
  arrows.length = 0;
  targets.forEach(t => scene.remove(t));
  targets.length = 0;
  updateText(vrGameOverMesh, '');
  restartBtnMesh.visible = false;
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  if (scene && scene.background) {
    const t = clock.getElapsedTime();
    if (scene.getObjectByName('floor')) {
      const floorMat = scene.getObjectByName('floor').material;
      if (floorMat.map) floorMat.map.offset.set(t * 0.05, t * 0.02);
    }
  }
  const delta = clock.getDelta();
  if (gameOver) return;
  gameTime -= delta;
  updateHUD();

  if (gameTime <= 0) {
    gameTime = 60;
    score = 0;
    targets.forEach(t => scene.remove(t));
    targets.length = 0;
  }

  if (targets.length < maxTargets && clock.elapsedTime - lastSpawn > spawnInterval) {
    spawnTarget();
    lastSpawn = clock.elapsedTime;
    spawnInterval = Math.max(0.8, spawnInterval * 0.98);
  }

  arrows.forEach((arrow, i) => {
    arrow.position.addScaledVector(arrow.userData.velocity, delta);
    if (arrow.position.length() > 50) {
      scene.remove(arrow);
      arrows.splice(i, 1);
    }
    targets.forEach((target, j) => {
      const dist = arrow.position.distanceTo(target.position);
      if (dist < 0.5) {
        createExplosion(target.position);
        scene.remove(arrow);
        arrows.splice(i, 1);
        scene.remove(target);
        targets.splice(j, 1);
        score++;
      }
    });
  });

  targets.forEach((target) => {
    // Movimiento horizontal tipo vaivén
    target.position.x += Math.sin(clock.elapsedTime * target.userData.speed) * 0.01 * target.userData.direction;
    if (clock.elapsedTime - target.userData.spawnTime > 10) {
      gameOver = true;
      updateText(vrGameOverMesh, '¡Has perdido!');
      restartBtnMesh.visible = true;
    }
  });

  explosions.forEach((e, idx) => {
    e.group.children.forEach(p => {
      p.position.addScaledVector(p.userData.velocity, delta);
      p.userData.velocity.multiplyScalar(0.95);
    });
    e.time += delta;
    if (e.time > 1.5) {
      scene.remove(e.group);
      explosions.splice(idx, 1);
    }
  });

  renderer.render(scene, camera);
}

function createExplosion(position) {
  const particles = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    const geo = new THREE.SphereGeometry(0.02);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(position);
    p.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    particles.add(p);
  }
  scene.add(particles);
  explosions.push({ group: particles, time: 0 });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
