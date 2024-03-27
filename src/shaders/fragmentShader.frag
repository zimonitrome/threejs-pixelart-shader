uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec4 resolution;
varying vec2 vUv;

float getDepth(int x, int y) {
    return texture2D( tDepth, vUv + vec2(x, y) * resolution.zw ).r;
}

float getDepth2(int x, int y) {
    return texture2D( tDepth, vUv + vec2(x, y) ).r;
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
    float depth = getDepth2(0, 0);

    float diff = 0.0;

    // Calculate depth differences without early quantization
    diff += max(depth - getDepth2(0, -1), 0.0);
    diff += max(depth - getDepth2(0,  1), 0.0);
    diff += max(depth - getDepth2(1,  0), 0.0);
    diff += max(depth - getDepth2(-1, 0), 0.0);

    // Apply quantization logic after calculating depth differences
    // This is a conceptual replacement for your `texture2D( diff, ...)` approach
    // Adjust the smoothstep parameters to control the sensitivity of edge detection
    float quantizedDiff = floor(smoothstep(0.001, 0.01, diff) * 2.) / 2.;

    return quantizedDiff;
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
