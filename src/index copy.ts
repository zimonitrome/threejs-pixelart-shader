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

let originalPositions = new Map();

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
            console.log(svgData);

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
                        color: 0x111111,
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

                // Assign a random normalized vector as the rotation axis and a maximum rotation angle
                const rotationAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
                const maxRotationAngle = 4* Math.PI * 2; // Full rotation

                // Store the pivot with the group's original properties
                originalPositions.set(group, {
                    position: pivot.position.clone(), // Use pivot position
                    pivot,
                    rotationAxis,
                    maxRotationAngle
                });

                svgGroup.add(pivot); // Add the pivot to the svgGroup instead of the group directly

            });

            console.log(svgGroup.children.length);

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
    });



    document.addEventListener("pointermove", (event) => {
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
            object.position.copy(planeIntersect.add(shift));

            // Rotate object
            const originalData = originalPositions.get(object);
            const distance = 5*object.position.distanceTo(originalData.position!);
            let angle = Math.min(distance * 0.1, originalData.maxRotationAngle);
            object.rotation.setFromVector3(originalData.rotationAxis.clone().multiplyScalar(angle));
        }
    });

    document.addEventListener("pointerup", () => {
        isDragging = false;
    });

    // document.addEventListener("pointerup", () => {
    //     if (isDragging) {
    //         isDragging = false;
    //         dragObject = null;
    //     }
    // });
}

// Variables to control the arc movement
let angle = 0; // Initial angle
const speed = 0.5; // Speed of the animation
const maxHeightChange = 1; // Max height change in degrees

let objectDynamics = new Map();

function animate() {
    requestAnimationFrame(animate);

    // angle += speed;
    // const radians = angle * (Math.PI / 180);
    // const deltaY = (Math.sin(radians) - 1) * maxHeightChange;
    // camera.position.y = deltaY + 1; // Adjust +1 (or your preferred offset) to ensure the camera doesn't "flip"
    // camera.up.set(0, 1, 0); // Ensure the up vector is correct, preventing flips.
    // camera.lookAt(scene.position);


    if (svgGroup) {
        for (const object of svgGroup.children) {
            if (isDragging && object === dragObject) continue; // Skip the object being dragged (if any
            const originalData = originalPositions.get(object);
            if (originalData) {
                const originalPosition = originalData.position;

                // Simulated spring parameters
                const stiffness = 0.05; // Spring stiffness
                const damping = 0.2; // Damping factor to slow down
                const mass = 5; // Mass of the object

                // Calculate spring force
                let displacement = object.position.clone().sub(originalPosition);
                let springForce = displacement.multiplyScalar(-stiffness);
                let dampingForce = object.userData.velocity.clone().multiplyScalar(-damping);
                let force = springForce.add(dampingForce);

                // Update velocity based on force
                let acceleration = force.divideScalar(mass);
                object.userData.velocity.add(acceleration);

                // Update position based on velocity
                object.position.add(object.userData.velocity);

                // Check if object is near the original position and if its velocity is low, then stop the animation
                if (displacement.length() < 0.0001 && object.userData.velocity.length() < 0.0001) {
                    object.position.copy(originalPosition);
                    object.userData.velocity.set(0, 0, 0); // Reset velocity
                }
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
