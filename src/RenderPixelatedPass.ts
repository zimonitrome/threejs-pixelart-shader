import * as THREE from "three"
import { Vector2, WebGLRenderer, WebGLRenderTarget } from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass"

export default class RenderPixelatedPass extends Pass {

    fsQuad: FullScreenQuad
    resolution: THREE.Vector2
    scene: THREE.Scene
    camera: THREE.Camera
    rgbRenderTarget: WebGLRenderTarget
    normalRenderTarget: WebGLRenderTarget
    normalMaterial: THREE.Material

    constructor( resolution: THREE.Vector2, scene: THREE.Scene, camera: THREE.Camera ) {
        super()
        this.resolution = resolution
        this.fsQuad = new FullScreenQuad( this.material() )
        this.scene = scene
        this.camera = camera

        this.rgbRenderTarget = pixelRenderTarget( resolution, THREE.RGBAFormat, true )
        this.normalRenderTarget = pixelRenderTarget( resolution, THREE.RGBFormat, false )

        this.normalMaterial = new THREE.MeshNormalMaterial()
    }

    render(
        renderer: WebGLRenderer,
        writeBuffer: WebGLRenderTarget
    ) {
        renderer.setRenderTarget( this.rgbRenderTarget )
        renderer.render( this.scene, this.camera )

        const overrideMaterial_old = this.scene.overrideMaterial
        renderer.setRenderTarget( this.normalRenderTarget )
        this.scene.overrideMaterial = this.normalMaterial
        renderer.render( this.scene, this.camera )
        this.scene.overrideMaterial = overrideMaterial_old

        // @ts-ignore
        const uniforms = this.fsQuad.material.uniforms
        uniforms.tDiffuse.value = this.rgbRenderTarget.texture
        uniforms.tDepth.value = this.rgbRenderTarget.depthTexture
        uniforms.tNormal.value = this.normalRenderTarget.texture

        if ( this.renderToScreen ) {
            renderer.setRenderTarget( null )
        } else {
            renderer.setRenderTarget( writeBuffer )
            if ( this.clear ) renderer.clear()
        }
        this.fsQuad.render( renderer )
    }

    material() {
        return new THREE.ShaderMaterial( {
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                tNormal: { value: null },
                resolution: {
                    value: new THREE.Vector4(
                        this.resolution.x,
                        this.resolution.y,
                        1 / this.resolution.x,
                        1 / this.resolution.y,
                    )
                }
            },
            vertexShader:
                `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
                `,
            fragmentShader:
                `
                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;
                uniform sampler2D tNormal;
                uniform vec4 resolution;
                varying vec2 vUv;

                float getDepth(int x, int y) {
                    return texture2D( tDepth, vUv + vec2(x, y) * resolution.zw ).r;
                }

                vec3 getNormal(int x, int y) {
                    return texture2D( tNormal, vUv + vec2(x, y) * resolution.zw ).rgb * 2.0 - 1.0;
                }

                float neighborNormalEdgeIndicator(int x, int y, float depth, vec3 normal) {
                    float depthDiff = getDepth(x, y) - depth;
                    
                    // Edge pixels should yield to faces closer to the bias direction.
                    vec3 normalEdgeBias = vec3(1., 1., 1.); // This should probably be a parameter.
                    float normalDiff = dot(normal - getNormal(x, y), normalEdgeBias);
                    // Adjusting for "radius" by making the detection stricter or more lenient
                    float radiusInfluence = 1.0; // Placeholder for any adjustments simulating radius effect
                    float normalIndicator = clamp(smoothstep(-.01 * radiusInfluence, .01 * radiusInfluence, normalDiff), 0.0, 1.0);
                    
                    float depthIndicator = clamp(sign(-depthDiff * .25 + .0025 * radiusInfluence), 0.0, 1.0);

                    return distance(normal, getNormal(x, y)) * depthIndicator * normalIndicator;
                }

                float depthEdgeIndicator() {
                    float depth = getDepth(0, 0);
                
                    float diff = 0.0;

                    diff += clamp(depth - getDepth( 0, -1), 0.0,  1.0);
                    diff += clamp(depth - getDepth( 0,  1), 0.0,  1.0);
                    diff += clamp(depth - getDepth( 1, -0), 0.0,  1.0);
                    diff += clamp(depth - getDepth( 1,  0), 0.0,  1.0);
                    
                    return floor(smoothstep(0.001, 0.01, diff) * 2.) / 2.;
                }
                

                float normalEdgeIndicator() {
                    float depth = getDepth(0, 0);
                    vec3 normal = getNormal(0, 0);
                    
                    float indicator = 0.0;

                    indicator += neighborNormalEdgeIndicator(0, -1, depth, normal);
                    indicator += neighborNormalEdgeIndicator(0, 1, depth, normal);
                    indicator += neighborNormalEdgeIndicator(-1, 0, depth, normal);
                    indicator += neighborNormalEdgeIndicator(1, 0, depth, normal);

                    return step(0.1, indicator);
                }

                void main() {
                    vec4 texel = texture2D( tDiffuse, vUv );

                    float coeff =  3.0;
                    float coeff2 =  0.3;

                    float dei = depthEdgeIndicator();
                    float nei = normalEdgeIndicator();

                    float sign = +1.0;

                    float coefficient = dei > 0.0 ? (1.0 - sign*coeff * dei) : (1.0 + sign*coeff2 * nei);
                    // float coefficient = 1.0 - sign*coeff * dei;

                    gl_FragColor = texel * coefficient;
                }
                `
        } )
    }
}

function pixelRenderTarget( resolution: THREE.Vector2, pixelFormat: THREE.PixelFormat, depthTexture: boolean ) {
    const renderTarget = new WebGLRenderTarget(
        resolution.x, resolution.y,
        !depthTexture ?
            undefined
            : {
                depthTexture: new THREE.DepthTexture(
                    resolution.x,
                    resolution.y
                ),
                depthBuffer: true
            }
    )
    renderTarget.texture.format = pixelFormat
    renderTarget.texture.minFilter = THREE.NearestFilter
    renderTarget.texture.magFilter = THREE.NearestFilter
    renderTarget.texture.generateMipmaps = false
    renderTarget.stencilBuffer = false
    return renderTarget
}
