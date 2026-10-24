// God rays from the flight game (E:\X Flight\Surgery\Trees Terrains\js\postprocessing.js), shader copied
// unchanged: light streaks smeared from the sun's spot on screen, fed by the brightest pixels
// (sun disc, sunlit cloud edges). Runs as a pass after the scene, then OutputPass finishes the colours.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// the flight game's default settings
const params = { godRayIntensity: 0.60, godRayDensity: 0.15, godRayDecay: 0.80, godRayWeight: 0.85 };

export function makeGodRays(renderer, scene, camera, LOW_GFX) {
        const GodRaysShader = {
            uniforms: {
                tDiffuse: { value: null },
                uSunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
                uIntensity: { value: params.godRayIntensity !== undefined ? params.godRayIntensity : 0.60 },
                uDecay: { value: params.godRayDecay !== undefined ? params.godRayDecay : 0.80 },
                uDensity: { value: params.godRayDensity !== undefined ? params.godRayDensity : 0.15 },
                uWeight: { value: params.godRayWeight !== undefined ? params.godRayWeight : 0.85 },
                uLumMin: { value: params.lumMin !== undefined ? params.lumMin : 0.85 },
                uLumMax: { value: params.lumMax !== undefined ? params.lumMax : 0.98 },
                uRayColorInner: { value: new THREE.Color(params.rayColorInner || '#ffea9f') },
                uRayColorOuter: { value: new THREE.Color(params.rayColorOuter || '#ff9933') },
                uEdgeFadeDist: { value: 1.5 },
                uSunVisible: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 uSunScreenPos;
                uniform float uIntensity;
                uniform float uDecay;
                uniform float uDensity;
                uniform float uWeight;
                uniform float uLumMin;
                uniform float uLumMax;
                uniform vec3 uRayColorInner;
                uniform vec3 uRayColorOuter;
                uniform float uEdgeFadeDist;
                uniform float uSunVisible;
                varying vec2 vUv;
    
                float pseudoRand(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
                }
    
                void main() {
                    vec4 texel = texture2D(tDiffuse, vUv);
    
                    // Direction from this pixel toward the sun
                    vec2 deltaUV = (vUv - uSunScreenPos);
                    float dist = length(deltaUV);
                    deltaUV *= (1.0 / 14.0) * uDensity; // 14 dithered samples for crepuscular light shafts

                    // Screen-space dither offsets sample points to eliminate banding
                    float dither = pseudoRand(gl_FragCoord.xy);
                    vec2 sampleUV = vUv - (deltaUV * dither);

                    float illumination = 0.0;
                    float currentWeight = uWeight;

                    for(int i = 0; i < 14; i++) {
                        sampleUV -= deltaUV;
                        vec4 samp = texture2D(tDiffuse, clamp(sampleUV, 0.001, 0.999));
                        float lum = dot(samp.rgb, vec3(0.299, 0.587, 0.114));
                        // Luminance gate captures sun disk and rim highlights piercing past clouds
                        float bright = smoothstep(uLumMin, uLumMax, lum);
                        illumination += bright * currentWeight;
                        currentWeight *= uDecay;
                    }

                    // Intensity normalization for 14-sample step integration
                    illumination *= 2.31;

                    // Fade out rays near screen edges and when sun is off-screen
                    float edgeFade = 1.0 - smoothstep(0.4, uEdgeFadeDist, dist);
    
                    // Dual-tone sunset/daylight radial gradient from Wanderlust-II
                    vec3 rayTint = mix(uRayColorInner, uRayColorOuter, smoothstep(0.0, uEdgeFadeDist * 0.7, dist));
                    vec3 rayColor = rayTint * illumination * uIntensity * edgeFade * uSunVisible;
    
                    gl_FragColor = vec4(texel.rgb + rayColor, texel.a);
                }
            `
        };

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const godRaysPass = new ShaderPass(GodRaysShader);
    godRaysPass.enabled = !LOW_GFX;
    composer.addPass(godRaysPass);
    composer.addPass(new OutputPass());

    const sunPos = new THREE.Vector3();
    // same screen projection as the flight game's main loop; rays off at night
    function update(sunDir, night) {
        if (!godRaysPass.enabled) return;
        sunPos.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
        const sunScreenX = (sunPos.x + 1.0) * 0.5;
        const sunScreenY = (sunPos.y + 1.0) * 0.5;
        godRaysPass.uniforms.uSunScreenPos.value.set(sunScreenX, sunScreenY);
        const behindCamera = sunPos.z > 1.0 ? 0.0 : 1.0;
        const offScreen = Math.max(Math.abs(sunScreenX - 0.5), Math.abs(sunScreenY - 0.5));
        const screenFade = 1.0 - Math.min(1.0, Math.max(0.0, (offScreen - 0.5) * 1.5));
        const twilightFade = 1.0 - night;
        godRaysPass.uniforms.uSunVisible.value = behindCamera * screenFade * twilightFade;
    }
    return { composer, godRaysPass, update };
}