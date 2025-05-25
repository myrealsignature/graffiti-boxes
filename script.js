// script.js

import * as THREE from 'three';

// GSAP уже подключен в HTML через CDN, поэтому здесь его импортировать не нужно,
// он будет доступен глобально (window.gsap).

let scene, camera, renderer;
let plane, allBoxes = [];
let arcFocusTarget, circleCenterPoint;

const boxHeight = 2.44, boxWidth = 1.3, boxDepth = 0.32;
const numActualBoxes = 8;
const arcRadius = 48, totalArcAngleDeg = 42, totalArcAngleRad = THREE.MathUtils.degToRad(totalArcAngleDeg);

let currentViewIndex = 0;
const GENERAL_VIEWS_COUNT = 2;
const BOX_FOCUS_VIEWS_START_INDEX = GENERAL_VIEWS_COUNT;
let FINAL_LOOK_VIEW_INDEX;
let BOX_ROTATION_VIEWS_START_INDEX;
let FINAL_FADE_VIEW_INDEX;

let isAnimating = false;
const cameraAnimationDuration = 1.0;
const rotationAnimationDuration = 0.7;
const fadeAnimationDuration = 0.7;

const cameraViews = [];
let animatedLookAtTarget = new THREE.Vector3();

let accumulatedDeltaY = 0;
let currentScrollThreshold = window.innerHeight;
let scrollTimeout = null;
let canProcessScroll = true;

const pageFooterUI = document.getElementById('page-footer');
const navArrowsUI = document.getElementById('nav-arrows');
const textPanelUI = document.getElementById('text-panel');
const prevBoxBtn = document.getElementById('prev-box-btn');
const nextBoxBtn = document.getElementById('next-box-btn');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdddddd);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // === ВКЛЮЧЕНИЕ ТЕНЕЙ: Начало ===
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Мягкие тени, можно выбрать другие
    // === ВКЛЮЧЕНИЕ ТЕНЕЙ: Конец ===
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Уменьшаем ambient для контраста теней
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 80, 40); // Позиция света влияет на направление теней
    // === НАСТРОЙКА СВЕТА ДЛЯ ТЕНЕЙ: Начало ===
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; // Качество карты теней
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 200; // Должно охватывать вашу сцену
    directionalLight.shadow.camera.left = -100; // Область видимости камеры тени
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    // directionalLight.shadow.bias = -0.001; // Может помочь от "acne"
    // === НАСТРОЙКА СВЕТА ДЛЯ ТЕНЕЙ: Конец ===
    scene.add(directionalLight);

    // Опциональный хелпер для отладки камеры тени
    // const shadowCamHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowCamHelper);

    plane = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x008000, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    // === ПОЛУЧЕНИЕ ТЕНЕЙ ПОЛОМ: Начало ===
    plane.receiveShadow = true;
    // === ПОЛУЧЕНИЕ ТЕНЕЙ ПОЛОМ: Конец ===
    scene.add(plane);

    circleCenterPoint = new THREE.Vector3(0, boxHeight / 2, 0);
    const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1, transparent: true });
    const angleStep = numActualBoxes > 1 ? totalArcAngleRad / (numActualBoxes - 1) : 0;
    const startAngle = -totalArcAngleRad / 2;

    for (let i = 0; i < numActualBoxes; i++) {
        const box = new THREE.Mesh(boxGeometry, boxMaterial.clone());
        const angle = startAngle + i * angleStep;
        box.position.set( circleCenterPoint.x + arcRadius * Math.sin(angle), boxHeight / 2, circleCenterPoint.z + arcRadius * Math.cos(angle) );
        // === ОТБРАСЫВАНИЕ ТЕНЕЙ БОКСАМИ: Начало ===
        box.castShadow = true;
        // box.receiveShadow = true; // Если боксы должны получать тени друг от друга
        // === ОТБРАСЫВАНИЕ ТЕНЕЙ БОКСАМИ: Конец ===
        box.userData.id = i + 1; 
        box.userData.initialRotationY = box.rotation.y; 
        scene.add(box); 
        allBoxes.push(box);
    }

    arcFocusTarget = (numActualBoxes > 0) ? new THREE.Vector3(circleCenterPoint.x, boxHeight / 2, circleCenterPoint.z + arcRadius) : new THREE.Vector3(0, boxHeight / 2, 0);

    cameraViews.push({ name: "View 1: Top Down", type: "general", position: new THREE.Vector3(arcFocusTarget.x, arcFocusTarget.y + 40, arcFocusTarget.z + 5), lookAt: arcFocusTarget.clone(), fov: 60 });
    cameraViews.push({ name: "View 2: Arc Front", type: "general", position: new THREE.Vector3(arcFocusTarget.x, 1.6, circleCenterPoint.z + arcRadius + 30), lookAt: arcFocusTarget.clone(), fov: 55 });

    const cameraHeightBoxFocus = 1.6, cameraOffsetX = 1.5, cameraOffsetZFromFrontFace = 4.0;
    allBoxes.forEach((box, index) => {
        const boxPos = box.position;
        const targetCameraPosition = new THREE.Vector3(boxPos.x + cameraOffsetX, cameraHeightBoxFocus, (boxPos.z + boxDepth / 2) + cameraOffsetZFromFrontFace);
        const targetLookAtPos = new THREE.Vector3(targetCameraPosition.x, targetCameraPosition.y, boxPos.z);
        cameraViews.push({ name: `View 3.${index + 1}: Focus Box ${index + 1}`, type: "box_focus", boxIndex: index, position: targetCameraPosition, lookAt: targetLookAtPos, fov: 50 });
    });

    const lastBoxViewConfig = cameraViews[cameraViews.length - 1];
    const finalCamPos = lastBoxViewConfig.position.clone(); finalCamPos.x += 1.0; finalCamPos.y -= 0.5;
    const finalLookAt = lastBoxViewConfig.lookAt.clone(); finalLookAt.x += 1.0; finalLookAt.y -= 0.5;
    cameraViews.push({ name: `View 4: Shifted Look Box ${numActualBoxes}`, type: "final_look", boxIndex: numActualBoxes - 1, position: finalCamPos, lookAt: finalLookAt, fov: lastBoxViewConfig.fov });
    FINAL_LOOK_VIEW_INDEX = cameraViews.length - 1;

    BOX_ROTATION_VIEWS_START_INDEX = cameraViews.length;
    const lastBoxForRotation = allBoxes[numActualBoxes - 1];
    const initialRotY = lastBoxForRotation.userData.initialRotationY;

    cameraViews.push({ name: "View 5.1 (Base for Rotation)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY, text: "Бокс готов к вращению.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    cameraViews.push({ name: "View 5.2 (Rotate +90 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + Math.PI / 2, text: "Бокс повернут на 90° по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    cameraViews.push({ name: "View 5.3 (Rotate +180 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + Math.PI, text: "Бокс повернут на 180° по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    cameraViews.push({ name: "View 5.4 (Rotate +360 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + 2 * Math.PI, text: "Бокс совершил полный оборот по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });

    FINAL_FADE_VIEW_INDEX = cameraViews.length;
    cameraViews.push({ name: "View 6: Fade Out", type: "final_fade", box: lastBoxForRotation, cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });

    if (cameraViews.length > 0) {
        setCameraToView(0, true);
    }
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('wheel', onMouseWheel, { passive: false });
    prevBoxBtn.addEventListener('click', () => navigateWithButtons(-1));
    nextBoxBtn.addEventListener('click', () => navigateWithButtons(1));
    animate();
}

function setScrollThreshold(nextViewIdx, currentViewIdx) {
    const nextView = cameraViews[nextViewIdx];
    const currentView = cameraViews[currentViewIdx];
    if (!nextView) { currentScrollThreshold = window.innerHeight; return; }

    if (currentView && currentView.type === "final_look" && nextView.type === "box_rotation" && nextView.name === "View 5.1 (Base for Rotation)") {
        currentScrollThreshold = window.innerHeight / 2;
    }
    else if (currentView && currentView.type === "box_rotation" && nextView.type === "box_rotation" &&
             (currentView.name === "View 5.1 (Base for Rotation)" || currentView.name === "View 5.2 (Rotate +90 deg)") ) {
        currentScrollThreshold = window.innerHeight / 2;
    }
    else if (currentView && currentView.name === "View 5.3 (Rotate +180 deg)" && nextView.name === "View 5.4 (Rotate +360 deg)") {
         currentScrollThreshold = window.innerHeight;
    }
    else if (currentView && currentView.name === "View 5.4 (Rotate +360 deg)" && nextView.type === "final_fade") {
         currentScrollThreshold = window.innerHeight;
    }
    else {
        currentScrollThreshold = window.innerHeight;
    }
    // console.log(`Threshold: ${currentScrollThreshold.toFixed(0)} (${currentView ? currentView.name : 'Start'} -> ${nextView.name})`);
}

function setCameraToView(viewIndex, instant = false) {
    if (isAnimating && !instant) return;
    if (viewIndex < 0 || viewIndex >= cameraViews.length) return;

    const targetViewConfig = cameraViews[viewIndex];
    isAnimating = true;
    canProcessScroll = false;

    const prevViewIndex = currentViewIndex;
    currentViewIndex = viewIndex;
    setScrollThreshold(viewIndex, prevViewIndex);

    let actualCameraPosition, actualLookAt, actualFov;
    if (targetViewConfig.cameraViewIndexToClone !== undefined) {
        const baseCamView = cameraViews[targetViewConfig.cameraViewIndexToClone];
        actualCameraPosition = baseCamView.position.clone();
        actualLookAt = baseCamView.lookAt.clone();
        actualFov = baseCamView.fov;
    } else {
        actualCameraPosition = targetViewConfig.position.clone();
        actualLookAt = targetViewConfig.lookAt.clone();
        actualFov = targetViewConfig.fov;
    }

    handleSceneAndFooterState(targetViewConfig, cameraViews[prevViewIndex]);

    const duration = (targetViewConfig.type === "box_rotation" || targetViewConfig.type === "final_fade") ? rotationAnimationDuration : cameraAnimationDuration;
    
    const tl = gsap.timeline({
        onComplete: () => {
            isAnimating = false;
            if (targetViewConfig.type === "box_rotation") {
                targetViewConfig.box.rotation.y = targetViewConfig.targetRotationY;
            }
            if (targetViewConfig.type === "final_fade") {
                targetViewConfig.box.material.opacity = 0;
                targetViewConfig.box.visible = false;
                textPanelUI.style.opacity = 0;
                textPanelUI.style.display = 'none';
            }

            camera.position.copy(actualCameraPosition);
            animatedLookAtTarget.copy(actualLookAt);
            camera.lookAt(animatedLookAtTarget);
            camera.fov = actualFov;
            camera.updateProjectionMatrix();

            setTimeout(() => { canProcessScroll = true; accumulatedDeltaY = 0; }, 200);
        }
    });

    let cameraNeedsAnimation = true;
    if (targetViewConfig.type === "box_rotation" || targetViewConfig.type === "final_fade") {
        if (camera.position.distanceTo(actualCameraPosition) < 0.01 && camera.fov === actualFov && animatedLookAtTarget.distanceTo(actualLookAt) < 0.01) {
            cameraNeedsAnimation = false;
        }
    }
    
    if (cameraNeedsAnimation) {
        tl.to(camera.position, { ...actualCameraPosition, duration: duration, ease: 'power2.inOut', onUpdate: () => camera.lookAt(animatedLookAtTarget) }, 0);
        tl.to(animatedLookAtTarget, { ...actualLookAt, duration: duration, ease: 'power2.inOut' }, 0);
        tl.to(camera, { fov: actualFov, duration: duration, ease: 'power2.inOut', onUpdate: () => camera.updateProjectionMatrix() }, 0);
    } else {
        animatedLookAtTarget.copy(actualLookAt);
        camera.lookAt(animatedLookAtTarget);
    }

    if (targetViewConfig.type === "box_rotation") {
        tl.to(targetViewConfig.box.rotation, { y: targetViewConfig.targetRotationY, duration: rotationAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0);
    }
    if (targetViewConfig.type === "final_fade") {
        tl.to(targetViewConfig.box.material, { opacity: 0, duration: fadeAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0);
        tl.to(textPanelUI, { opacity: 0, duration: fadeAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0);
    }
    updateUIForView(viewIndex);
}

function handleSceneAndFooterState(targetView, prevView) {
    const targetType = targetView.type;

    if (targetType === "final_fade") { pageFooterUI.style.height = '95vh'; }
    else if (targetType === "final_look" || targetType === "box_rotation") { pageFooterUI.style.height = '13vh'; }
    else { pageFooterUI.style.height = '8vh'; }

    const isRotationOrFade = (targetType === "box_rotation" || targetType === "final_fade");
    const isFinalLook = (targetType === "final_look");
            
    plane.visible = !(isFinalLook || isRotationOrFade);

    allBoxes.forEach(b => {
        if (isRotationOrFade) {
            b.visible = (b === targetView.box);
            if (b === targetView.box) {
                b.material.opacity = (targetType === "final_fade" && isAnimating) ? b.material.opacity : 1;
            }
        } else if (isFinalLook) {
            b.visible = true;
            b.material.opacity = 1;
        } else {
            b.visible = true;
            b.material.opacity = 1;
        }
    });
            
    if (targetType === "general") {
        textPanelUI.style.display = 'none';
    } else {
        textPanelUI.style.display = 'block';
        textPanelUI.style.opacity = (targetType === "final_fade" && isAnimating) ? textPanelUI.style.opacity : 1;
    }
}

function onMouseWheel(event) {
    event.preventDefault();
    if (!canProcessScroll || isAnimating) return;
    accumulatedDeltaY += event.deltaY;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { if (!isAnimating) accumulatedDeltaY = 0; }, 400);
    if (accumulatedDeltaY > currentScrollThreshold) {
        if (currentViewIndex < cameraViews.length - 1) { setCameraToView(currentViewIndex + 1); clearTimeout(scrollTimeout); }
        else accumulatedDeltaY = 0;
    } else if (accumulatedDeltaY < -currentScrollThreshold) {
        if (currentViewIndex > 0) { setCameraToView(currentViewIndex - 1); clearTimeout(scrollTimeout); }
        else accumulatedDeltaY = 0;
    }
}

function updateUIForView(viewIndex) {
    if (viewIndex < 0 || viewIndex >= cameraViews.length) return;
    const view = cameraViews[viewIndex];

    if (view.type === "box_focus") {
        navArrowsUI.style.visibility = 'visible';
        textPanelUI.innerHTML = `<h2>Бокс №${allBoxes[view.boxIndex].userData.id}</h2><p>Фокус на боксе.</p>`;
        prevBoxBtn.classList.toggle('disabled', view.boxIndex === 0);
        nextBoxBtn.classList.toggle('disabled', view.boxIndex === allBoxes.length - 1);
    } else if (view.type === "final_look") {
        navArrowsUI.style.visibility = 'hidden';
        textPanelUI.innerHTML = `<h2>Бокс №${allBoxes[view.boxIndex].userData.id}</h2><p>Подготовка к вращению.</p>`;
    } else if (view.type === "box_rotation") {
        navArrowsUI.style.visibility = 'hidden';
        textPanelUI.innerHTML = `<h2>Бокс №${view.box.userData.id}</h2><p>${view.text}</p>`;
    } else if (view.type === "final_fade") {
        navArrowsUI.style.visibility = 'hidden';
        textPanelUI.innerHTML = `<h2>Прощание</h2><p>Вселенная схлопывается...</p>`;
    } else { // general views
        navArrowsUI.style.visibility = 'hidden';
    }
}

function navigateWithButtons(direction) {
    const currentConfig = cameraViews[currentViewIndex];
    if (currentConfig && currentConfig.type === "box_focus") {
        let targetViewIdx = currentViewIndex + direction;
        if (targetViewIdx >= BOX_FOCUS_VIEWS_START_INDEX && targetViewIdx < BOX_FOCUS_VIEWS_START_INDEX + numActualBoxes) {
            setCameraToView(targetViewIdx);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if(cameraViews.length > 0 && currentViewIndex >=0 ) {
        setScrollThreshold(currentViewIndex, currentViewIndex > 0 ? currentViewIndex -1 : -1);
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Запускаем инициализацию, когда DOM готов
document.addEventListener('DOMContentLoaded', init);