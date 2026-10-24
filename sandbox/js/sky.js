// Sky dome from the flight game (E:\X Flight\Surgery\Trees Terrains\js\sky.js): 3-stop gradient,
// sun corona, horizon glow, stars and the painted dome clouds. Two additions for the savanna:
// the sun disc size is a uniform (the sunset target has a huge sun), and three layers of
// distant hills are painted on top. It follows the camera, so it never gets closer.
import * as THREE from 'three';

export function createCloudNoiseTexture(size = 256) {
    const data = new Uint8Array(size * size * 4);
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = p[i]; p[i] = p[j]; p[j] = temp;
    }
    for (let i = 0; i < 256; i++) p[256 + i] = p[i];

    function hash2(x, y) {
        return p[p[x & 255] + (y & 255)] / 255.0;
    }

    function tileableNoise(x, y, period) {
        const px = ((x % period) + period) % period;
        const py = ((y % period) + period) % period;
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const x1 = (x0 + 1) % period;
        const y1 = (y0 + 1) % period;
        const fx = px - x0;
        const fy = py - y0;
        const u = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
        const v = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);
        const v00 = hash2(x0, y0);
        const v10 = hash2(x1, y0);
        const v01 = hash2(x0, y1);
        const v11 = hash2(x1, y1);
        return (v00 * (1.0 - u) + v10 * u) * (1.0 - v) + (v01 * (1.0 - u) + v11 * u) * v;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            const idx = (y * size + x) * 4;
            data[idx + 0] = Math.floor(tileableNoise(u * 4, v * 4, 4) * 255);
            data[idx + 1] = Math.floor(tileableNoise(u * 8, v * 8, 8) * 255);
            data[idx + 2] = Math.floor(tileableNoise(u * 16, v * 16, 16) * 255);
            data[idx + 3] = Math.floor(tileableNoise(u * 32, v * 32, 32) * 255);
        }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
}

// Colour uniforms hold linear values (set with toLinear) because the shader ends with
// colorspace_fragment, exactly as in the flight game.
export const skyUniforms = {
    uZenith: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uHorizonGlow: { value: 0.15 },
    uGradientPower: { value: 0.7 },
    uGradientMidOffset: { value: 0.08 },
    uGradientSkyEnabled: { value: 1.0 },

    uTime: { value: 0.0 },
    uSunPosition: { value: new THREE.Vector3(0.0, 0.5, -0.866).normalize() },
    uSunColor: { value: new THREE.Color(0xffaa00) },
    uNoiseTex: { value: null },
    uCloudColor: { value: new THREE.Color(0xfffaec) },
    uCloudShadowColor: { value: new THREE.Color(0x8ca4c8) },
    uCloudCoverage: { value: 0.45 },
    uCloudEdge: { value: 0.08 },
    uCloudSpeed: { value: 0.015 },
    uCloudOpacity: { value: 0.95 },
    uEnableProceduralClouds: { value: 1.0 },
    uDuskFactor: { value: 0.0 },
    uNightFactor: { value: 0.0 },

    // savanna additions
    uDiscDir: { value: new THREE.Vector3(0.0, 0.5, -0.866).normalize() },   // where the painted disc sits (can differ from the light)
    uDiscLo: { value: 0.9985 }, uDiscHi: { value: 0.9997 }, uDiscColor: { value: new THREE.Color(1, 1, 1) },
    uMtn0: { value: new THREE.Color() }, uMtn1: { value: new THREE.Color() }, uMtn2: { value: new THREE.Color() },
    uFogLin: { value: new THREE.Color() },
    uStreak: { value: 0 },     // 1 = dome clouds pulled into long thin streaks
    uPeaks: { value: 0 },      // 1 = far hills become low, rounded, overlapping painted hills
    uTreeLine: { value: 0 },   // 1 = band of tiny far-off trees and shrubs on the horizon
};

export function makeSky() {
    skyUniforms.uNoiseTex.value = createCloudNoiseTexture(256);
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = position;
                vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
                gl_Position = vec4(p.xy, p.w * 0.9999, p.w);
            }`,
        fragmentShader: `
            uniform vec3 uZenith, uMid, uHorizon;
            uniform float uHorizonGlow, uGradientPower, uGradientMidOffset, uGradientSkyEnabled;
            uniform float uTime;
            uniform vec3 uSunPosition, uDiscDir;
            uniform vec3 uSunColor;
            uniform sampler2D uNoiseTex;
            uniform vec3 uCloudColor;
            uniform vec3 uCloudShadowColor;
            uniform float uCloudCoverage;
            uniform float uCloudEdge;
            uniform float uCloudSpeed;
            uniform float uCloudOpacity;
            uniform float uEnableProceduralClouds;
            uniform float uDuskFactor;
            uniform float uNightFactor;
            uniform float uDiscLo, uDiscHi;
            uniform vec3 uDiscColor, uMtn0, uMtn1, uMtn2, uFogLin;
            uniform float uStreak, uPeaks, uTreeLine;

            varying vec3 vDir;

            float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
            float vnoise(vec2 p) {
                vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            float fbm3o(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }
            float ridge(float az, float f, float seed) {
                vec2 c = vec2(cos(az), sin(az)) * f + seed;
                float n = fbm3o(c);
                float peaks = 1.0 - abs(vnoise(c * 0.6 + 3.0) * 2.0 - 1.0);
                float r = smoothstep(0.3, 0.75, mix(n, peaks, 0.45));
                return r * r * (1.4 - 0.4 * r);
            }
            // rounded painted hills: soft domes with random heights and widths, two staggered rows,
            // n per full turn so they wrap cleanly
            float dome(float u, float n, float seed) {
                float x = u * n, c = mod(floor(x), n);
                float f = (fract(x) - 0.5) * 2.0 / (0.75 + 0.5 * hash(vec2(c, seed + 5.0)));
                float t = sqrt(max(0.0, 1.0 - f * f));
                t = t * t * (3.0 - 2.0 * t);
                float hgt = 0.35 + 0.65 * hash(vec2(c, seed));
                return t * hgt;
            }
            float peaksAt(float az, float n, float seed) {
                float u = az / 6.2832 + 0.5;
                return max(dome(u, n, seed), 0.8 * dome(u + 0.5 / n, n, seed + 9.0));
            }

            void main() {
                vec3 dir = normalize(vDir);
                vec3 sunDir = normalize(uSunPosition);
                float sunDot = dot(dir, sunDir);

                // Vertical altitude angle: 0.0 at horizon, 1.0 overhead
                float alt = clamp((dir.y - 0.05) / 0.95, 0.0, 1.0);

                // 3-stop gradient: horizon -> mid (up to Mid-Height Offset) -> zenith
                float tLower = clamp(alt / max(uGradientMidOffset, 0.01), 0.0, 1.0);
                float tUpper = clamp((alt - uGradientMidOffset) / max(1.0 - uGradientMidOffset, 0.01), 0.0, 1.0);
                vec3 lowerSky = mix(uHorizon, uMid, pow(tLower, uGradientPower));
                vec3 gradientSky = mix(lowerSky, uZenith, pow(tUpper, uGradientPower));

                // Simple 2-stop fallback when the gradient curve is disabled
                vec3 twoStopSky = mix(uHorizon, uZenith, pow(clamp(alt * 1.5, 0.0, 1.0), 0.6));
                vec3 baseAtmosphere = mix(twoStopSky, gradientSky, uGradientSkyEnabled);

                // Sun disc and forward atmospheric corona glow (from Wanderlust proceduralSky.js)
                float discDot = dot(dir, normalize(uDiscDir));
                vec3 sunDisc = uDiscColor * 1.5;
                vec3 sunCorona = pow(clamp(sunDot, 0.0, 1.0), 96.0) * uSunColor * 0.35;
                vec3 sunHaze = pow(clamp(sunDot, 0.0, 1.0), 32.0) * uHorizon * 0.04;

                // Horizon warm rim glow
                float horizonBand = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 3.0) * smoothstep(0.03, 0.12, dir.y);
                vec3 duskGlow = horizonBand * uHorizon * uHorizonGlow * mix(1.0, 1.8, uDuskFactor);

                // Night stars (lightweight, zero-cost during day)
                vec3 nightSky = vec3(0.0);
                if (uNightFactor > 0.01) {
                    vec3 pStar = dir * 180.0;
                    vec4 sNoise = texture2D(uNoiseTex, pStar.xz * 0.02 + pStar.y * 0.01);
                    float starVal = step(0.97, sNoise.r) * pow(sNoise.g, 2.0);
                    float starTwinkle = sin(uTime * 2.0 + sNoise.b * 6.28) * 0.35 + 0.65;
                    float starFade = smoothstep(0.05, 0.30, dir.y);
                    nightSky = vec3(starVal * starTwinkle * starFade * 1.4);
                }

                // Composite atmospheric sky (the disc replaces the sky under it, so it stays a clean flat disc)
                vec3 sky = baseAtmosphere + sunCorona + sunHaze + duskGlow + nightSky * uNightFactor;
                sky = mix(sky, sunDisc, smoothstep(uDiscLo, uDiscHi, discDot));

                // PROCEDURAL CLOUDS LAYER (Level 2 Noise Texture WebGL Optimized)
                if (uEnableProceduralClouds > 0.01 && dir.y > -0.05) {
                    // Upper hemisphere dome projection (from Wanderlust proceduralSky.js)
                    float skyDomeDist = 1.0 / max(dir.y + 0.15, 0.08);
                    vec2 cloudUV = dir.xz * skyDomeDist * 0.45;
                    cloudUV *= vec2(mix(1.0, 0.18, uStreak), mix(1.0, 1.6, uStreak));

                    // Wind drift & movement + initial offset
                    vec2 windOffset = vec2(uTime * uCloudSpeed * 0.15, uTime * uCloudSpeed * 0.08);
                    vec2 uvSample = cloudUV + windOffset + vec2(14.8, 32.4);

                    // Sample Level 2 noise texture (calibrated to Wanderlust unit scale)
                    vec4 t0 = texture2D(uNoiseTex, uvSample * 0.25);
                    vec4 t1 = texture2D(uNoiseTex, (uvSample + vec2(5.2, 1.3)) * 0.25);

                    float f0 = t0.r * 0.50 + t0.g * 0.25 + t0.b * 0.15 + t0.a * 0.10;
                    float f1 = t1.r * 0.50 + t1.g * 0.25 + t1.b * 0.15 + t1.a * 0.10;
                    vec2 q = vec2(f0 - 0.5, f1 - 0.5) * 1.6;

                    // Domain warping produces billowy anime cloud formations
                    vec2 warpedUV = uvSample * 0.25 + q * 0.35;
                    vec4 tWarp = texture2D(uNoiseTex, warpedUV);
                    float cloudNoise = tWarp.r * 0.50 + tWarp.g * 0.25 + tWarp.b * 0.15 + tWarp.a * 0.10;

                    // Coverage & Soft Edge Thresholding
                    float lowThreshold = 1.0 - uCloudCoverage;
                    float highThreshold = lowThreshold + max(uCloudEdge, 0.02);
                    float cloudAlpha = smoothstep(lowThreshold, highThreshold, cloudNoise);

                    // Solar Clearance Corridor: subtle clearing right at the sun center
                    float sunProximity = clamp(sunDot, 0.0, 1.0);
                    float sunClearMask = 1.0 - smoothstep(0.96, 0.998, sunProximity) * 0.70;

                    // Horizon fade so clouds blend cleanly above the horizon
                    float horizonFade = smoothstep(0.02, 0.22, dir.y);
                    float finalAlpha = cloudAlpha * horizonFade * sunClearMask * uCloudOpacity;

                    // Cloud Lighting & Rim / Silver Lining
                    float sunDiffuse = clamp(sunDot * 0.5 + 0.5, 0.0, 1.0);
                    float silverLining = pow(clamp(sunDot, 0.0, 1.0), 4.0) * 0.4;

                    // Base cloud color with directional shading
                    vec3 dayCloudCol = mix(uCloudShadowColor, uCloudColor, sunDiffuse + silverLining);

                    // Sunset & Dusk tinting (warm golden peach on lit edges, soft violet on shadow)
                    vec3 sunsetCloudCol = mix(dayCloudCol, vec3(1.0, 0.70, 0.55), uDuskFactor * 0.75);
                    sunsetCloudCol = mix(sunsetCloudCol, uCloudShadowColor, (1.0 - sunDiffuse) * 0.45);

                    // Night sky darkening
                    vec3 nightCloudCol = mix(sunsetCloudCol, vec3(0.04, 0.05, 0.10), uNightFactor * 0.85);

                    // Composite procedural clouds over sky
                    sky = mix(sky, nightCloudCol, finalAlpha * uEnableProceduralClouds);
                }

                // Savanna: three layers of distant hills, far to near, a touch lighter at their feet
                float e = dir.y;
                float az = atan(dir.x, dir.z);
                float l0 = 0.060 + 0.110 * ridge(az, 1.7, 1.0);
                float l1 = 0.036 + 0.095 * ridge(az, 1.3, 7.0);
                l0 = mix(l0, 0.026 + 0.100 * peaksAt(az, 9.0, 1.0), uPeaks);
                l1 = mix(l1, 0.018 + 0.062 * peaksAt(az + 0.21, 14.0, 7.0), uPeaks);
                float l2 = 0.014 + 0.065 * ridge(az, 2.3, 13.0);
                float sm = 0.0022;
                vec3 m0 = mix(uMtn0, uHorizon, 0.35 * smoothstep(0.05, 0.0, e));
                vec3 m1 = mix(uMtn1, uHorizon, 0.30 * smoothstep(0.04, 0.0, e));
                vec3 m2 = mix(uMtn2, uHorizon, 0.25 * smoothstep(0.03, 0.0, e));
                sky = mix(sky, m0, smoothstep(l0 + sm, l0 - sm, e));
                sky = mix(sky, m1, smoothstep(l1 + sm, l1 - sm, e));
                sky = mix(sky, m2, smoothstep(l2 + sm, l2 - sm, e));
                sky = mix(sky, uFogLin, smoothstep(0.006, -0.01, e));

                // Savanna: far tree line, tiny flat-topped trees in clumps over a low shrub band
                if (uTreeLine > 0.01) {
                    float u = az / 6.2832 + 0.5;
                    float x = u * 900.0, ci = mod(floor(x), 900.0), fx = fract(x);
                    float grp = smoothstep(0.30, 0.70, vnoise(vec2(u * 70.0, 5.0)));
                    float r1 = hash(vec2(ci, 3.1)), r2 = hash(vec2(ci, 7.7));
                    float present = step(0.75 - 0.55 * grp, r1);
                    float crown = smoothstep(0.5, 0.18 + 0.2 * r2, abs(fx - 0.5));
                    float tree = present * (0.0040 + 0.0060 * r2) * crown;
                    float shrub = (0.0010 + 0.0022 * vnoise(vec2(x * 0.3, 1.0))) * (0.5 + 0.5 * grp);
                    float top = max(tree, shrub);
                    vec3 tc = mix(uFogLin, uMtn2 * vec3(0.38, 0.58, 0.30), 0.68);
                    sky = mix(sky, tc, uTreeLine * smoothstep(top + 0.0007, top - 0.0007, e));
                }

                gl_FragColor = vec4(sky, 1.0);
                #include <colorspace_fragment>
            }`,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
    });

    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), skyMaterial);
    skyDome.renderOrder = -1000;
    skyDome.frustumCulled = false;
    return skyDome;
}
