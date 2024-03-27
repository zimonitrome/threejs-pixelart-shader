import * as THREE from "three"
import { GreaterEqualDepth, Vector2 } from "three"

import { MapControls, OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'


import HelloWorldPass from "./HelloWorldPass"
import RenderPixelatedPass from "./RenderPixelatedPass"
import PixelatePass from "./PixelatePass"

import { stopGoEased } from "./math"

import warningStipesURL from "./assets/warningStripes.png"
import crateURL from "./assets/TileCrate.png"
import mechURL from "./assets/mech.fbx"
import zimoLogo from "./assets/zimo_logo.svg"

import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader";

let camera: THREE.Camera, scene: THREE.Scene, renderer: THREE.WebGLRenderer, composer: EffectComposer

init()
animate()

let isDragging = false;
let dragObject: THREE.Object3D | null = null;

var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
var plane = new THREE.Plane();
var pNormal = new THREE.Vector3(0, 0, 1); // Assuming you're dragging objects on a horizontal plane
var planeIntersect = new THREE.Vector3();
var shift = new THREE.Vector3();

let svgGroup: THREE.Group;

let groupData = new Map();

function getQuaternion(x: number, y: number, matrix: number[][]) {
    // Matrix multiplication
    let X = matrix[0][0] * x + matrix[0][1] * y;
    let Y = matrix[1][0] * x + matrix[1][1] * y;
    let Z = matrix[2][0] * x + matrix[2][1] * y;

    let axis = new THREE.Vector3(X, Y, Z);
    let magnitude = axis.length();
    axis.normalize()
    let quaternion = new THREE.Quaternion();
    return quaternion.setFromAxisAngle(axis, magnitude);
}

function init() {

    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    let renderResolution = screenResolution.clone().divideScalar(3)
    renderResolution.x |= 0
    renderResolution.y |= 0
    let aspectRatio = screenResolution.x / screenResolution.y

    camera = new THREE.OrthographicCamera(-aspectRatio, aspectRatio, 1, -1, 0.1, 10)
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x151729)
    // scene.background = new THREE.Color( 0xffffff )

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: false })
    // renderer.toneMapping = THREE.ACESFilmicToneMapping
    // renderer.toneMappingExposure = .75
    renderer.shadowMap.enabled = true
    renderer.setSize(screenResolution.x, screenResolution.y)
    document.body.appendChild(renderer.domElement)

    composer = new EffectComposer(renderer)
    // composer.addPass( new RenderPass( scene, camera ) )
    composer.addPass(new RenderPixelatedPass(renderResolution, scene, camera))
    let bloomPass = new UnrealBloomPass(screenResolution, .4, .1, .9)
    // composer.addPass(bloomPass)
    composer.addPass(new PixelatePass(renderResolution))

    // controls = new OrbitControls(camera, renderer.domElement)
    // controls.target.set(0, 0, 0);
    camera.position.z = 2;
    camera.position.y = 0.7;
    camera.position.x = 2;
    camera.lookAt(scene.position);
    // controls.update();
    // controls.minPolarAngle = controls.maxPolarAngle = controls.getPolarAngle()

    const texLoader = new THREE.TextureLoader()
    const tex_crate = pixelTex(texLoader.load(crateURL))
    const tex_warningStripes = pixelTex(texLoader.load(warningStipesURL))
    const tex_checker = pixelTex(texLoader.load("https://threejsfundamentals.org/threejs/resources/images/checker.png"))
    const tex_checker2 = pixelTex(texLoader.load("https://threejsfundamentals.org/threejs/resources/images/checker.png"))
    tex_checker.repeat.set(3, 3)
    tex_checker2.repeat.set(1.5, 1.5)

    // Geometry
    {
        const loader = new SVGLoader();
        loader.load(zimoLogo, svgData => {
            // Group that will contain all of our paths
            svgGroup = new THREE.Group();
            // svgGroup.scale.multiplyScalar(0.002);

            const texture = tex_checker;
            texture.repeat.set(0.01, 0.01);

            // Loop through all of the parsed paths
            const groupSizes = [
                1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3
                //  Z,I,M,O,_,N,i,T,R,O,M,E
            ]
            const shapes = svgData.paths.map(path => path.toShapes(false)).flat();

            let index = 0; // To keep track of the current index in the shapes array
            const partitionedShapes = groupSizes.map(size => {
                const part = shapes.slice(index, index + size); // Get a slice of the shapes array
                index += size; // Update the index
                return part;
            });

            partitionedShapes.forEach(shapeGroup => {
                const group = new THREE.Group();
                // Loop through all of the shapes in the group
                shapeGroup.forEach(shape => {
                    const geometry = new THREE.ExtrudeGeometry(shape, {
                        depth: 100,
                        bevelEnabled: false,
                    })

                    const material = new THREE.MeshPhongMaterial({
                        color: 0x7777ff,
                        // emissive: 0x143542,
                        // shininess: 100,
                        // specular: 0xffffff,
                        // opacity: 0.5
                    })

                    // Create a mesh and add it to the group
                    const mesh = new THREE.Mesh(
                        geometry,
                        material
                    );

                    let meshScaleFactor = 0.002; // Adjust this scale factor as needed
                    mesh.scale.set(meshScaleFactor, meshScaleFactor, meshScaleFactor);
                    mesh.scale.y *= -1;

                    group.add(mesh);

                });

                // Create a pivot object for each group
                const pivot = new THREE.Object3D();

                // Calculate the group's bounding box and center
                const box = new THREE.Box3().setFromObject(group);
                const center = new THREE.Vector3();
                box.getCenter(center);
                group.children.forEach((child) => {
                    child.position.sub(center); // Adjust child positions relative to the center
                });
                group.position.copy(center); // Move the group to the center
                pivot.add(group); // Add the group to the pivot

                let rotationMatrix = [
                    [Math.random(), Math.random()], // Row for X
                    [Math.random(), Math.random()], // Row for Y
                    [Math.random(), Math.random()]  // Row for Z
                ];

                groupData.set(group, {
                    position: group.position.clone(), // Use pivot position
                    rotationMatrix,
                });
                svgGroup.add(group);
            });

            // Center the group
            new THREE.Box3().setFromObject(svgGroup).getCenter(svgGroup.position).multiplyScalar(- 1);

            // Add our group to the scene (you'll need to create a scene)
            scene.add(svgGroup);

            // Initialize userData for storing velocity
            svgGroup.children.forEach(child => {
                child.userData.velocity = new THREE.Vector3(); // Initial velocity
            });
        });
    }

    // Lights
    scene.add(new THREE.AmbientLight(0x2d3645, 1.5))
    {
        let directionalLight = new THREE.DirectionalLight(0xfffc9c, .5)
        directionalLight.position.set(100, 100, 100)
        directionalLight.castShadow = true
        // directionalLight.shadow.radius = 0
        directionalLight.shadow.mapSize.set(2048, 2048)
        scene.add(directionalLight)
    }
    {
        let spotLight = new THREE.SpotLight(0xff8800, 1, 10, Math.PI / 16, .02, 2)
        // let spotLight = new THREE.SpotLight( 0xff8800, 1, 10, Math.PI / 16, 0, 2 )
        spotLight.position.set(2, 2, 0)
        let target = spotLight.target //= new THREE.Object3D()
        scene.add(target)
        target.position.set(0, 0, 0)
        spotLight.castShadow = true
        scene.add(spotLight)
        // spotLight.shadow.radius = 0
    }

    // Inside init() function, after setting up the scene, camera, and renderer:
    document.addEventListener("pointerdown", (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        var intersects = raycaster.intersectObjects(svgGroup.children, true);
        if (intersects.length > 0) {
            isDragging = true;
            let targetGroup = intersects[0].object.parent!;
            dragObject = targetGroup;
            planeIntersect.copy(intersects[0].point);
            plane.setFromNormalAndCoplanarPoint(pNormal, planeIntersect);
            shift.subVectors(targetGroup.position, intersects[0].point);
        }
        // onMove(event);
    });

    const onMove = (event) => {
        if (isDragging) {
            // Update mouse position
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
            // Update the raycaster
            raycaster.setFromCamera(mouse, camera);
            // Calculate the new intersection point with the plane
            raycaster.ray.intersectPlane(plane, planeIntersect);

            const object = dragObject!;

            // Move the object to the new position, accounting for the initial shift
            let posDiff = planeIntersect.add(shift);
            object.position.copy(posDiff);

            // Rotate
            let newPos = new THREE.Vector3(0, 0, 0);
            newPos.copy(posDiff);
            const originalData = groupData.get(object);
            newPos.sub(originalData!.position);
            let quaternion = getQuaternion(newPos.x, newPos.y, groupData.get(object)!.rotationMatrix);
            object.quaternion.copy(quaternion);
            object.userData.velocity.set(0, 0, 0.01);
        }
    };

    document.addEventListener("touchmove", (event) => {
        onMove(event.touches[0]);
    });

    document.addEventListener("pointermove", onMove);

    document.addEventListener("pointerup", () => {
        isDragging = false;
    });

    document.addEventListener("touchend", () => {
        isDragging = false;
    });


    // When press space
    document.addEventListener("keydown", (event) => {
        if (event.code === "Space") {
            // Reset all objects
            svgGroup.children.slice(1).forEach((object, index) => {
                setTimeout(() => {
                    object.position.copy(groupData.get(object)!.position);
                    object.userData.velocity.add(new THREE.Vector3(0, 0.03, 0)); // Add a small velocity to start the animation
                }, index * 75); // Delay each object by 100 milliseconds
            });
        }
    });
}

// Variables to control the arc movement
let angle = 0; // Initial angle
const speed = 0.1; // Speed of the animation
const maxHeightChange = 1; // Max height change in degrees

// Simulated spring parameters
const stiffness = 0.05; // Spring stiffness
const damping = 0.2; // Damping factor to slow down
const mass = 5; // Mass of the object

const originalOrientation = new THREE.Quaternion(); // Store the original orientation

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (!clock) return;
    const deltaTime = clock.getDelta();

    angle += speed;
    const radians = angle * (Math.PI / 180);
    const deltaY = (Math.sin(radians) - 1) * maxHeightChange;
    camera.position.y = deltaY + 1; // Adjust +1 (or your preferred offset) to ensure the camera doesn't "flip"
    camera.up.set(0, 1, 0); // Ensure the up vector is correct, preventing flips.
    camera.lookAt(scene.position);

    if (svgGroup) {
        for (const object of svgGroup.children) {
            if (isDragging && object === dragObject) continue; // Skip the object being dragged (if any
            const originalData = groupData.get(object);
            if (!originalData) continue;
            if (object.userData.velocity.length()) {
                // Position recovery logic here (as already implemented)
                const originalPosition = originalData.position;

                // Calculate spring force
                const displacement = object.position.clone().sub(originalPosition);
                const springForce = displacement.multiplyScalar(-stiffness);
                const dampingForce = object.userData.velocity.clone().multiplyScalar(-damping);
                const force = springForce.add(dampingForce);

                // Update velocity based on force
                const acceleration = force.divideScalar(mass);
                object.userData.velocity.add(acceleration);

                // Update position based on velocity
                object.position.add(object.userData.velocity);

                // Check if object is near the original position and if its velocity is low, then stop the animation
                if (displacement.length() < 0.0001 && object.userData.velocity.length() < 0.0001) {
                    object.position.copy(originalPosition);
                    object.userData.velocity.set(0, 0, 0); // Reset velocity
                }

                // Rotate
                let newPos = new THREE.Vector3(0, 0, 0);
                newPos.copy(object.position);
                newPos.sub(originalData.position);
                let quaternion = getQuaternion(newPos.x, newPos.y, originalData.rotationMatrix);
                object.quaternion.copy(quaternion);
            }
        }
    }

    // Render the scene with the updated camera position
    composer.render();
}


function pixelTex(tex: THREE.Texture) {
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
}
