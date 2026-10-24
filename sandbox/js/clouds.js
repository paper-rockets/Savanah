import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getWorldHeight } from './world.js';

// =========================================================================
// GHIBLI CLOUDS GENERATOR (Fluffy, Dense Anime Clouds & Superclouds)
// =========================================================================

export function setupToonCloudShader(mat, defaultBlur = 0.45, nearSolid = null, farHaze = null) {
        mat.fog = false; // Distant clouds handle their own atmospheric haze to blend seamlessly with horizon!
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uSunDir = { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() };
            shader.uniforms.uSunLitColor = { value: new THREE.Color(0xeff0ea) }; // Soft sunlit white, kept just under the god-ray brightness gate
            shader.uniforms.uSkyShadowColor = { value: new THREE.Color(0x9ab4d0) }; // Soft luminous sky-blue ambient (lifted: deep slate read as grey)
            shader.uniforms.uHorizonColor = { value: new THREE.Color(0xbcdcf2) }; // Seamless horizon mist tone
            shader.uniforms.uRimColor = { value: new THREE.Color(0xffffff) };
            shader.uniforms.uCloudTint = { value: new THREE.Color(0xffffff) };
            shader.uniforms.uCloudOpacity = { value: mat.opacity !== undefined ? mat.opacity : 0.98 };
            shader.uniforms.uBottomBlur = { value: defaultBlur };
            shader.uniforms.uNearSolid = { value: nearSolid !== null ? nearSolid : (params.cloudsNearSolid !== undefined ? params.cloudsNearSolid : 2000) };   // inside this distance clouds are solid fluff
            shader.uniforms.uFarHaze = { value: farHaze !== null ? farHaze : (params.cloudsFarHaze !== undefined ? params.cloudsFarHaze : 6000) };       // past this they melt into horizon haze
            shader.uniforms.uTime = { value: 0.0 };
            shader.uniforms.uBillowSpeed = { value: params.cloudsBillowSpeed || 0.35 };
            shader.uniforms.uBillowAmount = { value: params.cloudsBillowAmount || 1.0 };

            if (!window.cloudShaderUniformsList) window.cloudShaderUniformsList = [];
            window.cloudShaderUniformsList.push(shader.uniforms);
            mat.userData.shader = shader;

            shader.vertexShader = 'uniform float uTime;\nuniform float uBillowSpeed;\nuniform float uBillowAmount;\nattribute float aLocalY;\nvarying float vLocalY;\nvarying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'if (uBillowAmount > 0.001) {',
                    '    float bTime = uTime * uBillowSpeed;',
                    '    float b1 = sin(position.x * 0.012 + bTime) * cos(position.z * 0.012 + bTime * 0.73);',
                    '    float b2 = sin(position.y * 0.022 - bTime * 0.48 + position.x * 0.018);',
                    '    float b3 = cos(position.z * 0.028 + position.y * 0.015 + bTime * 0.25);',
                    '    float bSum = (b1 * 0.52 + b2 * 0.34 + b3 * 0.14);',
                    '    float heightScale = smoothstep(0.08, 0.90, aLocalY);',
                    '    float bDisp = bSum * (3.5 + aLocalY * 5.5) * heightScale * uBillowAmount;',
                    '    transformed += normal * bDisp;',
                    '}'
                ].join('\n')
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                [
                    '#include <worldpos_vertex>',
                    '#ifdef USE_INSTANCING',
                    '    mat4 _cloudM = modelMatrix * instanceMatrix;',
                    '#else',
                    '    mat4 _cloudM = modelMatrix;',
                    '#endif',
                    'vWorldPos = (_cloudM * vec4(transformed, 1.0)).xyz;',
                    'vWorldNormal = normalize(mat3(_cloudM) * normal);',
                    'vLocalY = aLocalY;'
                ].join('\n')
            );

            shader.fragmentShader = 'uniform vec3 uSunDir;\nuniform vec3 uSunLitColor;\nuniform vec3 uSkyShadowColor;\nuniform vec3 uHorizonColor;\nuniform vec3 uRimColor;\nuniform vec3 uCloudTint;\nuniform float uCloudOpacity;\nuniform float uBottomBlur;\nuniform float uNearSolid;\nuniform float uFarHaze;\nvarying float vLocalY;\nvarying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                [
                    'vec3 norm = normalize(vWorldNormal);',
                    'vec3 sunDir = normalize(uSunDir);',
                    'vec3 vDir = normalize(cameraPosition - vWorldPos);',
                    // Nearby clouds stay solid and white; only far banks fade into the horizon
                    'float camDist = length(cameraPosition - vWorldPos);',
                    'float nearness = 1.0 - smoothstep(uNearSolid, uFarHaze, camDist);',

                    // Soft wrapped diffuse: wide, gentle lighting gradient (not harsh cel-shaded cutoffs!)
                    'float NdotL = dot(norm, sunDir);',
                    'float lightWrap = clamp(NdotL * 0.46 + 0.56, 0.0, 1.0);',
                    'float diffuse = smoothstep(0.04, 0.82, lightWrap);',

                    // Ambient sky bounce for deep cloud shadows (Ghibli soft luminous ambient fill)
                    'float skyAmb = clamp(norm.y * 0.26 + 0.76, 0.70, 1.0);',

                    // Height gradient: base is soft atmospheric tone, crown is sunlit white
                    'vec3 deepShadow = mix(uSkyShadowColor * skyAmb, uSunLitColor, 0.40);',
                    'vec3 shadowTone = mix(uHorizonColor, deepShadow, smoothstep(0.02, 0.62, vLocalY));',
                    'vec3 litTone = uSunLitColor + vec3(smoothstep(0.55, 1.0, vLocalY) * 0.08);',
                    'vec3 col = mix(shadowTone, litTone, diffuse);',
                    // wash the whole base (lit side included) into horizon haze so the bank has no cut-off edge
                    'vec3 hazed = mix(uHorizonColor, col, smoothstep(0.0, 0.55, vLocalY));',
                    'col = mix(hazed, col, nearness);',
                    'col *= uCloudTint;',

                    // Organic Bottom Feathering & Horizon Wash (Soft blend into horizon with ZERO see-through lines!)
                    'float blurHeight = max(uBottomBlur, 0.02);',
                    'float bottomWave = sin(vWorldPos.x * 0.0016 + vWorldPos.z * 0.0013) * 0.06',
                    '                 + sin(vWorldPos.x * 0.0051 - vWorldPos.z * 0.0044) * 0.03;',
                    'float baseHaze = smoothstep(0.0, blurHeight, vLocalY + bottomWave);',
                    'col = mix(uHorizonColor, col, baseHaze);',

                    'col *= uCloudTint;',

                    'outgoingLight = col;',
                    '#ifdef OPAQUE',
                    'diffuseColor.a = 1.0;',
                    'gl_FragColor = vec4(outgoingLight, 1.0);',
                    '#else',
                    'float finalAlpha = clamp(uCloudOpacity, 0.0, 1.0);',
                    'if (finalAlpha < 0.01) discard;',
                    'gl_FragColor = vec4(outgoingLight, finalAlpha);',
                    '#endif'
                ].join('\n')
            );
        };
    }

export function initClouds(scene, params, LOW_GFX, spawnX, spawnZ, camera, instClouds, matCloud, matWispyCloud) {
        // =========================================================================
        // GHIBLI DISTANT CLOUDS GENERATOR (Fluffy, Dense but Light Anime Clouds)
        // =========================================================================
        // Small repeatable random number source, so the clouds look identical on every reload
        function cloudRand(seed) {
            let s = (seed | 0) >>> 0;
            return function () {
                s = (s + 0x6D2B79F5) >>> 0;
                let t = s;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
    
        // One puff. The surface is pushed in and out at three different sizes of bump, so the
        // outline never reads as a plain ball: big billows, cauliflower lumps, then a fine crinkle.
        function createFluffyLobe(radius, segW = 36, segH = 26, squashY = 0.85, noiseAmp = 0.13, seed = 1, sx = 1.0, sz = 1.0) {
            const geo = new THREE.SphereGeometry(radius, segW, segH);
            const pos = geo.attributes.position;
            const rnd = cloudRand(seed);
            const p1 = rnd() * 6.2832, p2 = rnd() * 6.2832, p3 = rnd() * 6.2832;
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i);
                let y = pos.getY(i);
                let z = pos.getZ(i);
                const len = Math.sqrt(x * x + y * y + z * z) || 1.0;
                const nx = x / len;
                const ny = y / len;
                const nz = z / len;
    
                const b1 = Math.sin(nx * 2.1 + p1) * Math.cos(ny * 1.7 + nz * 1.4 + p2);
                const b2 = Math.sin(nx * 4.6 + nz * 4.1 + p2) * Math.cos(ny * 4.3 + nx * 3.8 + p3) * 0.55;
                const b3 = Math.sin(nx * 6.1 + ny * 5.7 + p3) * Math.cos(nz * 6.3 + p1) * 0.11;
                let bump = (b1 + b2 + b3) * noiseAmp;
    
                // Real cumulus have a calm, flattish underside - keep the lumps on top and around the sides
                bump *= 0.32 + 0.68 * Math.max(0.0, ny * 0.5 + 0.5);
    
                const r = radius * (1.0 + bump);
                pos.setXYZ(i, nx * r * sx, ny * r * squashY, nz * r * sz);
            }
            geo.computeVertexNormals();
            return geo;
        }
    
        // Grows smaller puffs out of the sides and tops of bigger puffs. This is what turns a
        // stack of balls into a knobbly cloud. Two rounds: buds, then buds on the buds.
        function growPuffBuds(parents, seed, countMin, countMax, sizeMin, sizeMax) {
            const rnd = cloudRand(seed);
            const buds = [];
            for (let i = 0; i < parents.length; i++) {
                const p = parents[i];
                const n = countMin + Math.floor(rnd() * (countMax - countMin + 1));
                const psx = p.sx || 1.0;
                const psy = p.sy || 0.85;
                const psz = p.sz || 1.0;
                for (let k = 0; k < n; k++) {
                    const ang = rnd() * 6.2832;
                    const up = -0.15 + rnd() * 1.05;                       // mostly upper/lateral surface
                    const horiz = Math.sqrt(Math.max(0.0, 1.0 - up * up));
                    const cr = p.r * (sizeMin + rnd() * (sizeMax - sizeMin));
                    let d = p.r * (0.70 + rnd() * 0.22);                     // sit on the parent's shoulder
                    d = Math.max(d, p.r * 1.15 - cr);                        // poke clearly out
                    d = Math.min(d, p.r * 0.94);                             // stay attached
    
                    // Varied bud squash: rounded cauliflower billows, NOT tall vertical cylinders!
                    const budSy = 0.68 + rnd() * 0.28; // 0.68 to 0.96
                    const budSx = 0.92 + rnd() * 0.28; // 0.92 to 1.20
                    const budSz = 0.92 + rnd() * 0.24;
                    const rotZ = (p.rotZ || 0) * 0.6 + (rnd() - 0.5) * 0.3;
                    const rotX = (p.rotX || 0) * 0.6 + (rnd() - 0.5) * 0.2;
    
                    buds.push({
                        r: cr,
                        x: p.x + Math.cos(ang) * horiz * d * psx,
                        y: p.y + up * d * psy,
                        z: p.z + Math.sin(ang) * horiz * d * psz,
                        sx: budSx,
                        sy: budSy,
                        sz: budSz,
                        rotZ: rotZ,
                        rotX: rotX,
                        noise: 0.028
                    });
                }
            }
            return buds;
        }
    
        // Builds the main puffs plus both rounds of buds and drops them all into the lobe list.
        // Smaller puffs get fewer segments, which keeps the triangle count close to where it was.
        function addPuffLobes(puffs, lobes, seed, opts) {
            const o = opts || {};
            const segParent = o.segParent || [28, 20];
            const segBud = o.segBud || [12, 9];
            const segSub = o.segSub || [8, 6];
            const budMin = o.budMin !== undefined ? o.budMin : 2;
            const budMax = o.budMax !== undefined ? o.budMax : 4;
    
            let s = seed;
            puffs.forEach(p => {
                const sx = p.sx || 1.0;
                const sy = p.sy || 0.85;
                const sz = p.sz || 1.0;
                const g = createFluffyLobe(p.r, segParent[0], segParent[1], sy, (p.noise || 0.025) * 5.4, s++, sx, sz);
                if (p.rotZ) g.rotateZ(p.rotZ);
                if (p.rotX) g.rotateX(p.rotX);
                if (p.rotY) g.rotateY(p.rotY);
                g.translate(p.x, p.y, p.z);
                lobes.push(g);
            });
    
            const buds = growPuffBuds(puffs, seed + 101, budMin, budMax, 0.30, 0.54);
            buds.forEach(p => {
                const sx = p.sx || 1.0;
                const sy = p.sy || 0.85;
                const sz = p.sz || 1.0;
                const g = createFluffyLobe(p.r, segBud[0], segBud[1], sy, p.noise * 5.4, s++, sx, sz);
                if (p.rotZ) g.rotateZ(p.rotZ);
                if (p.rotX) g.rotateX(p.rotX);
                if (p.rotY) g.rotateY(p.rotY);
                g.translate(p.x, p.y, p.z);
                lobes.push(g);
            });
    
            // Only the chunkier buds are worth budding again - tiny ones add cost and no silhouette
            const bigBuds = buds.filter(b => b.r > 60);
            const subBuds = growPuffBuds(bigBuds, seed + 977, 1, 1, 0.34, 0.52);
            subBuds.forEach(p => {
                const sx = p.sx || 1.0;
                const sy = p.sy || 0.85;
                const sz = p.sz || 1.0;
                const g = createFluffyLobe(p.r, segSub[0], segSub[1], sy, p.noise * 5.4, s++, sx, sz);
                if (p.rotZ) g.rotateZ(p.rotZ);
                if (p.rotX) g.rotateX(p.rotX);
                if (p.rotY) g.rotateY(p.rotY);
                g.translate(p.x, p.y, p.z);
                lobes.push(g);
            });
        }
    
        // Small nearby cumulus. Same puff-and-bud build as the big clouds, but far fewer
        // segments because there are ~120 of these on screen at once.
        function buildLowCloud() {
            const lobes = [];
            const lowPuffs = [
                { r: 17, x: -23, y: 2,  z: 6,   sy: 0.60, noise: 0.028 },
                { r: 20, x: 0,   y: 4,  z: -5,  sy: 0.64, noise: 0.028 },
                { r: 16, x: 23,  y: 2,  z: 8,   sy: 0.60, noise: 0.028 },
                { r: 12, x: -40, y: -2, z: -6,  sy: 0.52, noise: 0.025 },
                { r: 11, x: 40,  y: -3, z: 5,   sy: 0.52, noise: 0.025 },
                { r: 14, x: -11, y: 14, z: 4,   sy: 0.78, noise: 0.030 },
                { r: 13, x: 12,  y: 15, z: -6,  sy: 0.78, noise: 0.030 },
                { r: 10, x: 0,   y: 24, z: 0,   sy: 0.86, noise: 0.030 }
            ];
            addPuffLobes(lowPuffs, lobes, 4242, {
                segParent: [14, 10],
                segBud: [8, 6],
                budMin: 2,
                budMax: 3
            });
            return finishCloudGeometry(lobes);
        }

        // Far LOD for the nearby cloud layer. It preserves the same soft silhouette with far
        // fewer faces; only geometry detail changes, never the cloud's world-space identity.
        function buildRearLowCloud() {
            const lobes = [];
            const rearPuffs = [
                { r: 19, x: -25, y: 1, z: 5, sy: 0.60, noise: 0.028 },
                { r: 22, x: 0, y: 4, z: -4, sy: 0.64, noise: 0.028 },
                { r: 18, x: 25, y: 2, z: 7, sy: 0.60, noise: 0.028 },
                { r: 14, x: -11, y: 15, z: 3, sy: 0.76, noise: 0.030 },
                { r: 13, x: 13, y: 15, z: -5, sy: 0.76, noise: 0.030 }
            ];
            addPuffLobes(rearPuffs, lobes, 8821, {
                segParent: [7, 5],
                budMin: 0,
                budMax: 0
            });
            return finishCloudGeometry(lobes);
        }

        const CLOUD_COUNT = 250;
        const BASE_CLOUD_COUNT = 150;
        const geoCloud = buildLowCloud();
        const geoRearCloud = buildRearLowCloud();
        let instRearClouds;
        if (!instClouds) {
            instClouds = new THREE.InstancedMesh(geoCloud, matCloud, CLOUD_COUNT);
            instClouds.count = BASE_CLOUD_COUNT;
            // Clouds are far bigger than the ~200m shadow area around Kiki, so a
            // cloud overhead darkened the whole area and ended in a hard square edge.
            instClouds.castShadow = false;
            instClouds.frustumCulled = false;
            instClouds.visible = params.cloudsLow;
            scene.add(instClouds);
        }
        instRearClouds = new THREE.InstancedMesh(geoRearCloud, matCloud, CLOUD_COUNT);
        instRearClouds.count = 0;
        instRearClouds.castShadow = false;
        instRearClouds.frustumCulled = false;
        instRearClouds.visible = params.cloudsLow;
        scene.add(instRearClouds);
    
        function cloudSeedFor(archetype) {
            const name = String(archetype);
            let h = 2166136261;
            for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
            return (h >>> 0) % 100000;
        }
    
        function buildProceduralCloud(archetype = 'tower') {
            const lobes = [];
    
            if (archetype === false || archetype === 'tower' || archetype === 'tower_sovereign') {
                // Archetype 1: Sovereign Cumulonimbus / Castle
                const towerPuffs = [
                    { r: 200, x: -160, y: 22,  z: 20,   sx: 1.25, sy: 0.58, sz: 1.05, noise: 0.02 },
                    { r: 215, x: 70,   y: 28,  z: -15,  sx: 1.30, sy: 0.62, sz: 1.10, noise: 0.02 },
                    { r: 155, x: -340, y: 5,   z: -10,  sx: 1.20, sy: 0.50, sz: 1.00, noise: 0.02 },
                    { r: 150, x: 290,  y: 8,   z: 25,   sx: 1.20, sy: 0.52, sz: 1.00, noise: 0.02 },
                    { r: 190, x: -110, y: 130, z: 20,   sx: 1.15, sy: 0.80, sz: 1.05, rotZ: 0.10, noise: 0.025 },
                    { r: 130, x: 35,   y: 110, z: -25,  sx: 1.25, sy: 0.65, sz: 0.95, noise: 0.02 },
                    { r: 165, x: 205,  y: 125, z: 15,   sx: 1.25, sy: 0.72, sz: 1.05, rotZ: -0.15, noise: 0.025 },
                    { r: 130, x: -250, y: 90,  z: -15,  sx: 1.15, sy: 0.68, sz: 1.00, noise: 0.02 },
                    { r: 185, x: -80,  y: 240, z: 10,   sx: 1.10, sy: 0.90, sz: 1.05, rotZ: 0.08, noise: 0.03 },
                    { r: 135, x: 180,  y: 210, z: 5,    sx: 1.20, sy: 0.75, sz: 1.00, rotZ: -0.10, noise: 0.025 },
                    { r: 115, x: -185, y: 185, z: -10,  sx: 1.05, sy: 0.80, sz: 0.95, rotZ: 0.18, noise: 0.025 },
                    { r: 150, x: -65,  y: 335, z: 0,    sx: 1.05, sy: 0.95, sz: 1.00, rotZ: 0.05, noise: 0.03 },
                    { r: 98,  x: -35,  y: 400, z: -8,   sx: 0.98, sy: 0.90, sz: 0.95, noise: 0.03 }
                ];
                addPuffLobes(towerPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'tower_twin') {
                // Archetype 1b: Twin Cathedral Peaks
                const twinPuffs = [
                    { r: 195, x: -170, y: 22,  z: 15,   sx: 1.30, sy: 0.55, sz: 1.05, noise: 0.02 },
                    { r: 205, x: 160,  y: 26,  z: -15,  sx: 1.30, sy: 0.55, sz: 1.05, noise: 0.02 },
                    { r: 150, x: -330, y: 8,   z: -10,  sx: 1.20, sy: 0.48, sz: 1.00, noise: 0.02 },
                    { r: 150, x: 330,  y: 6,   z: 15,   sx: 1.20, sy: 0.48, sz: 1.00, noise: 0.02 },
                    { r: 140, x: 0,    y: 12,  z: 0,    sx: 1.25, sy: 0.45, sz: 0.95, noise: 0.02 },
                    { r: 180, x: -160, y: 130, z: 15,   sx: 1.15, sy: 0.85, sz: 1.05, rotZ: 0.08, noise: 0.025 },
                    { r: 175, x: 165,  y: 135, z: -15,  sx: 1.15, sy: 0.82, sz: 1.05, rotZ: -0.08, noise: 0.025 },
                    { r: 110, x: 0,    y: 95,  z: 10,   sx: 1.20, sy: 0.55, sz: 0.90, noise: 0.02 },
                    { r: 165, x: -140, y: 245, z: 8,    sx: 1.10, sy: 0.92, sz: 1.00, rotZ: 0.06, noise: 0.03 },
                    { r: 155, x: 145,  y: 235, z: -8,   sx: 1.10, sy: 0.90, sz: 1.00, rotZ: -0.06, noise: 0.03 },
                    { r: 110, x: -220, y: 195, z: -10,  sx: 1.05, sy: 0.75, sz: 0.95, rotZ: 0.15, noise: 0.025 },
                    { r: 115, x: 225,  y: 185, z: 12,   sx: 1.05, sy: 0.75, sz: 0.95, rotZ: -0.15, noise: 0.025 },
                    { r: 135, x: -125, y: 340, z: 0,    sx: 1.00, sy: 0.95, sz: 1.00, noise: 0.03 },
                    { r: 85,  x: -110, y: 405, z: -5,   sx: 0.95, sy: 0.90, sz: 0.95, noise: 0.03 },
                    { r: 125, x: 135,  y: 320, z: 0,    sx: 1.00, sy: 0.92, sz: 1.00, noise: 0.03 },
                    { r: 78,  x: 125,  y: 375, z: 4,    sx: 0.92, sy: 0.88, sz: 0.95, noise: 0.03 }
                ];
                addPuffLobes(twinPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'tower_anvil') {
                // Archetype 1c: Wind-Sheared Anvil Tower
                const anvilPuffs = [
                    { r: 190, x: -120, y: 20,  z: 15,   sx: 1.30, sy: 0.54, sz: 1.05, noise: 0.02 },
                    { r: 180, x: 90,   y: 24,  z: -15,  sx: 1.25, sy: 0.52, sz: 1.05, noise: 0.02 },
                    { r: 140, x: -270, y: 6,   z: -10,  sx: 1.20, sy: 0.48, sz: 1.00, noise: 0.02 },
                    { r: 175, x: -70,  y: 120, z: 10,   sx: 1.15, sy: 0.82, sz: 1.05, rotZ: -0.18, noise: 0.025 },
                    { r: 155, x: 30,   y: 135, z: -10,  sx: 1.15, sy: 0.80, sz: 1.00, rotZ: -0.20, noise: 0.025 },
                    { r: 120, x: -180, y: 95,  z: 5,    sx: 1.10, sy: 0.70, sz: 0.95, rotZ: -0.12, noise: 0.025 },
                    { r: 185, x: 20,   y: 235, z: 5,    sx: 1.35, sy: 0.75, sz: 1.10, rotZ: -0.15, noise: 0.03 },
                    { r: 160, x: -90,  y: 215, z: -5,   sx: 1.20, sy: 0.75, sz: 1.00, rotZ: -0.12, noise: 0.025 },
                    { r: 170, x: 160,  y: 250, z: 12,   sx: 1.45, sy: 0.65, sz: 1.15, rotZ: -0.22, noise: 0.03 },
                    { r: 195, x: 75,   y: 325, z: 0,    sx: 1.70, sy: 0.58, sz: 1.25, noise: 0.03 },
                    { r: 160, x: 220,  y: 335, z: -8,   sx: 1.55, sy: 0.50, sz: 1.15, rotZ: -0.10, noise: 0.03 },
                    { r: 140, x: -80,  y: 310, z: 8,    sx: 1.40, sy: 0.55, sz: 1.10, rotZ: 0.05, noise: 0.03 },
                    { r: 95,  x: 95,   y: 370, z: 0,    sx: 1.35, sy: 0.52, sz: 1.10, noise: 0.03 }
                ];
                addPuffLobes(anvilPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'tower_spire') {
                // Archetype 1d: Columnar Cumulus Congestus Spire
                const spirePuffs = [
                    { r: 180, x: 0,    y: 20,  z: 0,    sx: 1.25, sy: 0.55, sz: 1.25, noise: 0.02 },
                    { r: 140, x: -140, y: 14,  z: 15,   sx: 1.15, sy: 0.50, sz: 1.05, noise: 0.02 },
                    { r: 135, x: 135,  y: 12,  z: -15,  sx: 1.15, sy: 0.50, sz: 1.05, noise: 0.02 },
                    { r: 170, x: 0,    y: 125, z: 5,    sx: 1.10, sy: 0.88, sz: 1.10, noise: 0.025 },
                    { r: 125, x: -95,  y: 110, z: -10,  sx: 1.05, sy: 0.75, sz: 0.95, rotZ: 0.12, noise: 0.025 },
                    { r: 120, x: 90,   y: 115, z: 10,   sx: 1.05, sy: 0.75, sz: 0.95, rotZ: -0.12, noise: 0.025 },
                    { r: 165, x: 5,    y: 235, z: 0,    sx: 1.05, sy: 0.92, sz: 1.05, noise: 0.03 },
                    { r: 110, x: -70,  y: 215, z: 10,   sx: 1.00, sy: 0.80, sz: 0.95, rotZ: 0.10, noise: 0.025 },
                    { r: 105, x: 75,   y: 220, z: -8,   sx: 1.00, sy: 0.80, sz: 0.95, rotZ: -0.10, noise: 0.025 },
                    { r: 150, x: 0,    y: 335, z: 0,    sx: 1.00, sy: 0.95, sz: 1.00, noise: 0.03 },
                    { r: 115, x: 0,    y: 415, z: 0,    sx: 0.95, sy: 0.95, sz: 0.95, noise: 0.03 },
                    { r: 70,  x: 0,    y: 470, z: 0,    sx: 0.90, sy: 0.90, sz: 0.90, noise: 0.03 }
                ];
                addPuffLobes(spirePuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'cirro_shelf') {
                // High altitude sprawling cirrocumulus shelf
                const cirroPuffs = [
                    { r: 240, x: -350, y: 15, z: 0,    sx: 1.80, sy: 0.32, sz: 1.10, noise: 0.02 },
                    { r: 260, x: 0,    y: 20, z: 10,   sx: 1.90, sy: 0.35, sz: 1.15, noise: 0.02 },
                    { r: 240, x: 350,  y: 18, z: -10,  sx: 1.80, sy: 0.32, sz: 1.10, noise: 0.02 },
                    { r: 180, x: -180, y: 55, z: 5,    sx: 1.60, sy: 0.40, sz: 1.05, noise: 0.025 },
                    { r: 190, x: 180,  y: 58, z: -5,   sx: 1.60, sy: 0.40, sz: 1.05, noise: 0.025 },
                    { r: 140, x: 0,    y: 85, z: 0,    sx: 1.50, sy: 0.42, sz: 1.00, noise: 0.025 }
                ];
                addPuffLobes(cirroPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'cirro_cluster') {
                // High altitude clustered billowing anvil feather
                const clusterPuffs = [
                    { r: 210, x: -200, y: 18, z: 20,   sx: 1.50, sy: 0.36, sz: 1.10, noise: 0.02 },
                    { r: 220, x: 150,  y: 22, z: -20,  sx: 1.55, sy: 0.36, sz: 1.10, noise: 0.02 },
                    { r: 170, x: -70,  y: 52, z: 0,    sx: 1.40, sy: 0.42, sz: 1.05, noise: 0.025 },
                    { r: 180, x: 80,   y: 56, z: 10,   sx: 1.40, sy: 0.42, sz: 1.05, noise: 0.025 },
                    { r: 130, x: 0,    y: 88, z: -5,   sx: 1.30, sy: 0.45, sz: 1.00, noise: 0.025 }
                ];
                addPuffLobes(clusterPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'fortress') {
                // Archetype 2: Grand Tiered Mountain Massif
                const fortressPuffs = [
                    { r: 190, x: -180, y: 22,  z: 15,   sx: 1.35, sy: 0.52, sz: 1.10, noise: 0.02 },
                    { r: 200, x: 80,   y: 26,  z: -10,  sx: 1.30, sy: 0.55, sz: 1.10, noise: 0.02 },
                    { r: 140, x: -350, y: 2,   z: -10,  sx: 1.25, sy: 0.46, sz: 1.00, noise: 0.02 },
                    { r: 135, x: 295,  y: 5,   z: 20,   sx: 1.20, sy: 0.48, sz: 1.00, noise: 0.02 },
                    { r: 170, x: -215, y: 95,  z: 10,   sx: 1.35, sy: 0.60, sz: 1.10, noise: 0.025 },
                    { r: 155, x: -80,  y: 110, z: -18,  sx: 1.20, sy: 0.65, sz: 1.00, noise: 0.025 },
                    { r: 185, x: 125,  y: 120, z: 15,   sx: 1.15, sy: 0.80, sz: 1.05, rotZ: -0.15, noise: 0.025 },
                    { r: 135, x: -185, y: 165, z: 5,    sx: 1.25, sy: 0.65, sz: 1.00, noise: 0.025 },
                    { r: 160, x: 40,   y: 195, z: -10,  sx: 1.10, sy: 0.85, sz: 1.00, rotZ: -0.12, noise: 0.03 },
                    { r: 170, x: 165,  y: 230, z: 12,   sx: 1.10, sy: 0.88, sz: 1.05, rotZ: -0.18, noise: 0.03 },
                    { r: 130, x: 145,  y: 315, z: 0,    sx: 1.05, sy: 0.92, sz: 1.00, rotZ: -0.10, noise: 0.03 },
                    { r: 90,  x: 170,  y: 375, z: -6,   sx: 0.95, sy: 0.88, sz: 0.95, noise: 0.03 }
                ];
                addPuffLobes(fortressPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'asymmetric') {
                // Archetype 3: Wind-Sheared Anvil / Slanted Prow
                const asymPuffs = [
                    { r: 130, x: -390, y: 10,  z: 5,    sx: 1.45, sy: 0.44, sz: 1.05, noise: 0.02 },
                    { r: 150, x: -270, y: 28,  z: -15,  sx: 1.40, sy: 0.48, sz: 1.05, noise: 0.02 },
                    { r: 145, x: -225, y: 88,  z: 12,   sx: 1.30, sy: 0.58, sz: 1.00, rotZ: -0.18, noise: 0.025 },
                    { r: 180, x: -95,  y: 60,  z: 0,    sx: 1.30, sy: 0.62, sz: 1.10, noise: 0.02 },
                    { r: 165, x: -65,  y: 145, z: -10,  sx: 1.20, sy: 0.72, sz: 1.05, rotZ: -0.22, noise: 0.025 },
                    { r: 160, x: 30,   y: 180, z: 15,   sx: 1.15, sy: 0.80, sz: 1.05, rotZ: -0.20, noise: 0.03 },
                    { r: 200, x: 145,  y: 75,  z: -5,   sx: 1.25, sy: 0.70, sz: 1.10, noise: 0.025 },
                    { r: 180, x: 160,  y: 220, z: 10,   sx: 1.10, sy: 0.88, sz: 1.05, rotZ: -0.15, noise: 0.03 },
                    { r: 145, x: 195,  y: 300, z: -8,   sx: 1.05, sy: 0.94, sz: 1.00, rotZ: -0.12, noise: 0.03 },
                    { r: 95,  x: 215,  y: 370, z: 4,    sx: 0.98, sy: 0.90, sz: 0.95, noise: 0.03 },
                    { r: 115, x: 285,  y: 125, z: 12,   sx: 1.15, sy: 0.60, sz: 0.95, rotZ: -0.30, noise: 0.025 }
                ];
                addPuffLobes(asymPuffs, lobes, cloudSeedFor(archetype));
            } else if (archetype === 'undulating') {
                // Archetype 4: Twin Giants with Deep Canyon Saddle
                const undPuffs = [
                    { r: 175, x: -205, y: 20,  z: 15,   sx: 1.30, sy: 0.54, sz: 1.05, noise: 0.02 },
                    { r: 185, x: 205,  y: 22,  z: -15,  sx: 1.30, sy: 0.54, sz: 1.05, noise: 0.02 },
                    { r: 145, x: 0,    y: 15,  z: 0,    sx: 1.35, sy: 0.48, sz: 1.00, noise: 0.02 },
                    { r: 130, x: -365, y: -2,  z: -10,  sx: 1.20, sy: 0.46, sz: 1.00, noise: 0.02 },
                    { r: 130, x: 365,  y: -4,  z: 10,   sx: 1.20, sy: 0.46, sz: 1.00, noise: 0.02 },
                    { r: 170, x: -180, y: 118, z: 20,   sx: 1.15, sy: 0.82, sz: 1.05, rotZ: 0.12, noise: 0.025 },
                    { r: 180, x: 190,  y: 124, z: -18,  sx: 1.25, sy: 0.75, sz: 1.05, rotZ: -0.10, noise: 0.025 },
                    { r: 105, x: 5,    y: 80,  z: 5,    sx: 1.25, sy: 0.55, sz: 0.90, noise: 0.02 },
                    { r: 150, x: -165, y: 230, z: 10,   sx: 1.05, sy: 0.90, sz: 1.00, rotZ: 0.10, noise: 0.03 },
                    { r: 115, x: -150, y: 315, z: -5,   sx: 0.98, sy: 0.92, sz: 0.95, rotZ: 0.06, noise: 0.03 },
                    { r: 170, x: 200,  y: 210, z: 0,    sx: 1.30, sy: 0.72, sz: 1.10, rotZ: -0.08, noise: 0.025 },
                    { r: 130, x: 220,  y: 285, z: 8,    sx: 1.20, sy: 0.74, sz: 1.00, noise: 0.03 }
                ];
                addPuffLobes(undPuffs, lobes, cloudSeedFor(archetype));
            } else {
                // Archetype 5: Expansive Rolling Horizon Terrace (Shelf)
                const megaPuffs = [
                    { r: 190, x: -165, y: 20,  z: 15,   sx: 1.40, sy: 0.50, sz: 1.10, noise: 0.02 },
                    { r: 195, x: 145,  y: 22,  z: -15,  sx: 1.40, sy: 0.50, sz: 1.10, noise: 0.02 },
                    { r: 145, x: -330, y: 8,   z: 10,   sx: 1.25, sy: 0.44, sz: 1.00, noise: 0.02 },
                    { r: 150, x: 320,  y: 6,   z: -10,  sx: 1.25, sy: 0.44, sz: 1.00, noise: 0.02 },
                    { r: 140, x: 0,    y: 16,  z: 0,    sx: 1.35, sy: 0.48, sz: 1.00, noise: 0.02 },
                    { r: 165, x: -130, y: 92,  z: 15,   sx: 1.25, sy: 0.75, sz: 1.05, rotZ: 0.08, noise: 0.025 },
                    { r: 170, x: 125,  y: 96,  z: -15,  sx: 1.25, sy: 0.75, sz: 1.05, rotZ: -0.08, noise: 0.025 },
                    { r: 125, x: -270, y: 65,  z: 5,    sx: 1.20, sy: 0.65, sz: 1.00, noise: 0.025 },
                    { r: 130, x: 265,  y: 68,  z: -5,   sx: 1.20, sy: 0.65, sz: 1.00, noise: 0.025 },
                    { r: 145, x: 0,    y: 110, z: 0,    sx: 1.30, sy: 0.70, sz: 1.00, noise: 0.025 },
                    { r: 135, x: -75,  y: 175, z: 10,   sx: 1.20, sy: 0.78, sz: 1.00, noise: 0.03 },
                    { r: 140, x: 70,   y: 180, z: -10,  sx: 1.20, sy: 0.78, sz: 1.00, noise: 0.03 },
                    { r: 110, x: 0,    y: 220, z: 0,    sx: 1.15, sy: 0.80, sz: 0.95, noise: 0.03 }
                ];
                addPuffLobes(megaPuffs, lobes, cloudSeedFor(archetype));
            }
    
            return finishCloudGeometry(lobes);
        }
    
        // Merges the puffs into one cloud and works out its shading. Shared by every cloud layer.
        function finishCloudGeometry(lobes) {
            const merged = BufferGeometryUtils.mergeGeometries(lobes);
            const pos = merged.attributes.position;
            let minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
    
            const heightSpan = Math.max(1, maxY - minY);
            const localYArr = new Float32Array(pos.count);
            for (let i = 0; i < pos.count; i++) {
                localYArr[i] = Math.max(0.0, Math.min(1.0, (pos.getY(i) - minY) / heightSpan));
            }
            merged.setAttribute('aLocalY', new THREE.BufferAttribute(localYArr, 1));
            merged.computeVertexNormals();
    
            // Normal blending: smoothly blend outward radial direction with smooth vertex normal
            // Softens internal crevice seams into one unified, pillowy, fluffy cloud!
            // The puffs overlap, so in places two skins sit at almost the same distance from the
            // camera and the renderer flickers between them - that was the sparkly grain.
            // Fix: work out the shading normal purely from WHERE a point is, never from which puff
            // it belongs to. Both skins in an overlap then get the exact same normal, shade the
            // same, and the flicker has nothing to show. It also gives the flat, painted toon look.
            const norm = merged.attributes.normal;
            const vPos = new THREE.Vector3();
            const vNorm = new THREE.Vector3();
            const vDir = new THREE.Vector3();
            const wob = 0.011;      // size of the soft billow shading
            for (let i = 0; i < pos.count; i++) {
                vPos.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    
                // outward from the cloud's own body, lifted so the underside still catches sky
                const dy = Math.max(0.0, vPos.y - minY) * 0.65 + heightSpan * 0.25;
                vDir.set(vPos.x, dy, vPos.z).normalize();
    
                // gentle position-driven billowing so it isn't one featureless blob
                const ax = Math.sin(vPos.z * wob * 1.7 + vPos.y * wob * 1.3);
                const ay = Math.sin(vPos.x * wob * 1.1 + vPos.z * wob * 0.9);
                const az = Math.sin(vPos.y * wob * 1.2 + vPos.x * wob * 0.8);
    
                vNorm.copy(vDir).addScaledVector(new THREE.Vector3(ax, ay, az), 0.30).normalize();
                vNorm.y = Math.max(vNorm.y, 0.20);
                vNorm.normalize();
                norm.setXYZ(i, vNorm.x, vNorm.y, vNorm.z);
            }
    
            return merged;
        }
    
    
    
        // Super High Cumulonimbus Clouds & Distant Mega Painted Clouds
        const HIGH_CLOUD_COUNT = 48;
        const BASE_HIGH_CLOUD_COUNT = 14;
        const towerGeos = [
            buildProceduralCloud('tower_sovereign'),
            buildProceduralCloud('tower_twin'),
            buildProceduralCloud('tower_anvil'),
            buildProceduralCloud('tower_spire')
        ];
        const TOWER_VARIANTS = towerGeos.length;
        const HIGH_PER_VARIANT = Math.ceil(HIGH_CLOUD_COUNT / TOWER_VARIANTS);
    
        const highCloudMat = new THREE.MeshToonMaterial({
            color: 0xffffff,
            transparent: false,
            opacity: params.cloudsHighOpacity,
            depthWrite: true,
            depthTest: true,
            side: THREE.FrontSide
        });
        setupToonCloudShader(highCloudMat, params.cloudsHighBottomBlur);
    
        const highMeshes = [];
        const instHighClouds = new THREE.Group();
        instHighClouds.name = 'DistantCumulusTowersGroup';
        instHighClouds.visible = params.cloudsHigh;
        scene.add(instHighClouds);
    
        towerGeos.forEach((geo, idx) => {
            const m = new THREE.InstancedMesh(geo, highCloudMat, HIGH_PER_VARIANT);
            m.frustumCulled = false;
            m.name = `HighCloudVariant_${idx}`;
            highMeshes.push(m);
            instHighClouds.add(m);
        });
    
        const WISPY_CLOUD_COUNT = 0;
        const instWispyClouds = new THREE.InstancedMesh(geoCloud, matWispyCloud, WISPY_CLOUD_COUNT);
        instWispyClouds.frustumCulled = false;
        scene.add(instWispyClouds);
    
        // Far-Distance Mega Painted Clouds (Horizon Cloud Banks)
        const MEGA_CLOUD_COUNT = 48;
        const BASE_MEGA_CLOUD_COUNT = 12;
        const megaCloudMat = new THREE.MeshToonMaterial({
            color: 0xffffff,
            transparent: false,
            opacity: params.cloudsGiantOpacity,
            depthWrite: true,
            depthTest: true,
            side: THREE.FrontSide
        });
        setupToonCloudShader(megaCloudMat, params.cloudsGiantBottomBlur);
    
        // 4 Distinct Procedural Cloud Archetypes for Horizon Banks:
        // 0: Wide Shelf, 1: Cumulus Fortress, 2: Asymmetric Wind-Swept, 3: Undulating Double-Dome
        const megaGeos = [
            buildProceduralCloud('shelf'),
            buildProceduralCloud('fortress'),
            buildProceduralCloud('asymmetric'),
            buildProceduralCloud('undulating')
        ];
        const MEGA_VARIANTS = megaGeos.length;
        const MEGA_PER_VARIANT = Math.ceil(MEGA_CLOUD_COUNT / MEGA_VARIANTS); // 7 per variant = 28
    
        const megaMeshes = [];
        const instMegaClouds = new THREE.Group();
        instMegaClouds.name = 'DistantHorizonBanksGroup';
        instMegaClouds.visible = params.cloudsGiant;
        scene.add(instMegaClouds);
    
        megaGeos.forEach((geo, idx) => {
            const m = new THREE.InstancedMesh(geo, megaCloudMat, MEGA_PER_VARIANT);
            m.frustumCulled = false;
            m.name = `MegaCloudVariant_${idx}`;
            megaMeshes.push(m);
            instMegaClouds.add(m);
        });
    
        // Low Horizon Towers (Towering cumulus at horizon waterline level)
        const LOW_TOWER_CLOUD_COUNT = 48;
        const BASE_LOW_TOWER_CLOUD_COUNT = 8;
        const LOW_TOWER_PER_VARIANT = Math.ceil(LOW_TOWER_CLOUD_COUNT / TOWER_VARIANTS);
        const lowTowerCloudMat = new THREE.MeshToonMaterial({
            color: 0xffffff,
            transparent: false,
            opacity: params.cloudsLowTowerOpacity !== undefined ? params.cloudsLowTowerOpacity : 1.0,
            depthWrite: true,
            depthTest: true,
            side: THREE.FrontSide
        });
        setupToonCloudShader(lowTowerCloudMat, params.cloudsLowTowerBottomBlur);
    
        const lowTowerMeshes = [];
        const instLowTowerClouds = new THREE.Group();
        instLowTowerClouds.name = 'LowHorizonTowersGroup';
        instLowTowerClouds.visible = params.cloudsLowTower;
        scene.add(instLowTowerClouds);
    
        towerGeos.forEach((geo, idx) => {
            const m = new THREE.InstancedMesh(geo, lowTowerCloudMat, LOW_TOWER_PER_VARIANT);
            m.frustumCulled = false;
            m.name = `LowTowerCloudVariant_${idx}`;
            lowTowerMeshes.push(m);
            instLowTowerClouds.add(m);
        });
    
        function setupTowerGroupAdapter(grp, meshes, totalCount, variants, paramCountKey, fallbackCount) {
            grp.maxCount = totalCount;
            grp.getMatrixAt = function(i, m) {
                const vIdx = i % variants;
                const sIdx = Math.floor(i / variants);
                if (meshes[vIdx]) meshes[vIdx].getMatrixAt(sIdx, m);
            };
            grp.setMatrixAt = function(i, m) {
                const vIdx = i % variants;
                const sIdx = Math.floor(i / variants);
                if (meshes[vIdx]) meshes[vIdx].setMatrixAt(sIdx, m);
            };
            grp.setColorAt = function(i, c) {
                const vIdx = i % variants;
                const sIdx = Math.floor(i / variants);
                if (meshes[vIdx]) meshes[vIdx].setColorAt(sIdx, c);
            };
            grp.instanceMatrix = {
                get count() { return totalCount; },
                set needsUpdate(v) { meshes.forEach(m => { if (m.instanceMatrix) m.instanceMatrix.needsUpdate = v; }); },
                get needsUpdate() { return true; }
            };
            grp.instanceColor = {
                set needsUpdate(v) { meshes.forEach(m => { if (m.instanceColor) m.instanceColor.needsUpdate = v; }); },
                get needsUpdate() { return true; }
            };
            Object.defineProperty(grp, 'count', {
                get() { return params[paramCountKey] !== undefined ? params[paramCountKey] : fallbackCount; },
                set(v) { setCloudCount(grp, v); }
            });
        }
        setupTowerGroupAdapter(instHighClouds, highMeshes, HIGH_CLOUD_COUNT, TOWER_VARIANTS, 'cloudsHighCount', BASE_HIGH_CLOUD_COUNT);
        setupTowerGroupAdapter(instLowTowerClouds, lowTowerMeshes, LOW_TOWER_CLOUD_COUNT, TOWER_VARIANTS, 'cloudsLowTowerCount', BASE_LOW_TOWER_CLOUD_COUNT);
    
        // Low Horizon Banks (Waterline cloud banks resting along horizon)
        const lowBankCloudMat = new THREE.MeshToonMaterial({
            color: 0xffffff,
            transparent: false,
            opacity: params.cloudsLowBankOpacity !== undefined ? params.cloudsLowBankOpacity : 1.0,
            depthWrite: true,
            depthTest: true,
            side: THREE.FrontSide
        });
        setupToonCloudShader(lowBankCloudMat, params.cloudsLowBankBottomBlur);

        const lowBankMeshes = [];
        const instLowBankClouds = new THREE.Group();
        instLowBankClouds.name = 'LowHorizonBanksGroup';
        instLowBankClouds.visible = params.cloudsLowBank !== false;
        scene.add(instLowBankClouds);

        megaGeos.forEach((geo, idx) => {
            const m = new THREE.InstancedMesh(geo, lowBankCloudMat, MEGA_PER_VARIANT);
            m.frustumCulled = false;
            m.name = `LowBankCloudVariant_${idx}`;
            lowBankMeshes.push(m);
            instLowBankClouds.add(m);
        });
    
        // Altitude offsets (in meters) for gentle horizon immersion (-12m to +5m around horizon waterline)
        const cloudAltitudeOffsets = [
            -5, 0, -10, 5, -8, 0, -12, 4,
            -6, 0, -10, 5, -8, 0, -12, 4,
            -5, 0, -10, 5, -8, 0, -12, 4,
            -6, 3, -8, 5
        ];
        const highAltitudeOffsets = [
            -8, 4, -12, 0, -6, 5, -10, 0,
            -8, 4, -12, 0, -6, 5, -10, 0,
            -8, 4, -12, 0, -6, 5, -10, 0,
            -7, 3, -11, 2
        ];
        const lowTowerAltitudeOffsets = [
            -4, 2, -6, 0, -3, 3, -5, 0,
            -4, 2, -6, 0, -3, 3, -5, 0,
            -4, 2, -6, 0, -3, 3, -5, 0,
            -4, 2, -5, 1
        ];
        const lowAltitudeOffsets = new Float32Array(CLOUD_COUNT);
        const lowCloudWindX = new Float32Array(CLOUD_COUNT);
        const lowCloudWindZ = new Float32Array(CLOUD_COUNT);
        for (let i = 0; i < CLOUD_COUNT; i++) {
            // A broad but coherent low-cloud layer rather than a tall volume of unrelated puffs.
            const altitudeNoise = ((i * 47) % 89) / 89;
            lowAltitudeOffsets[i] = 35 + altitudeNoise * 260 + (Math.random() - 0.5) * 40;

            // Each cloud follows the same prevailing wind with a small local variation.
            // This makes the weather visibly drift as a whole, never track the aircraft.
            const windSpeed = 2.2 + (((i * 29) % 37) / 37) * 2.2;
            const windAngle = 0.36 + (((i * 13) % 23) / 23 - 0.5) * 0.30;
            lowCloudWindX[i] = Math.cos(windAngle) * windSpeed;
            lowCloudWindZ[i] = Math.sin(windAngle) * windSpeed;
        }
    
        // Base scale tracking for instances to prevent decomposition drift and matrix flips
        const cloudBaseScale = new Float32Array(CLOUD_COUNT * 3);
        // Persistent world state is independent of LOD instance packing.
        const lowCloudPosX = new Float32Array(CLOUD_COUNT);
        const lowCloudPosY = new Float32Array(CLOUD_COUNT);
        const lowCloudPosZ = new Float32Array(CLOUD_COUNT);
        const lowCloudHeading = new Float32Array(CLOUD_COUNT);
        const lowCloudFarLod = new Uint8Array(CLOUD_COUNT);
        const highCloudBaseScale = new Float32Array(HIGH_CLOUD_COUNT * 3);
        const lowTowerCloudBaseScale = new Float32Array(LOW_TOWER_CLOUD_COUNT * 3);
        const highAvoidanceOffset = new Float32Array(HIGH_CLOUD_COUNT * 2);
        const lowTowerAvoidanceOffset = new Float32Array(LOW_TOWER_CLOUD_COUNT * 2);
        const megaAvoidanceOffset = new Float32Array(MEGA_CLOUD_COUNT * 2);
        const lowBankAvoidanceOffset = new Float32Array(MEGA_CLOUD_COUNT * 2);

        const highCloudCurrentGrowth = new Float32Array(HIGH_CLOUD_COUNT);
        const highCloudTargetGrowth = new Float32Array(HIGH_CLOUD_COUNT);
        highCloudCurrentGrowth.fill(1.0);
        highCloudTargetGrowth.fill(1.0);
        const megaCloudBaseScale = [];
        const lowBankCloudBaseScale = [];
        for (let v = 0; v < MEGA_VARIANTS; v++) {
            megaCloudBaseScale.push(new Float32Array(MEGA_PER_VARIANT * 3));
            lowBankCloudBaseScale.push(new Float32Array(MEGA_PER_VARIANT * 3));
        }
    
        // -------------------------------------------------------------
        // 6. Distant High Clouds (Non-Billboard 3D Procedural Meshes)
        // -------------------------------------------------------------
        const cirroGeos = [
            buildProceduralCloud('cirro_shelf'),
            buildProceduralCloud('cirro_cluster'),
            buildProceduralCloud('shelf')
        ];
        const CIRRO_VARIANTS = cirroGeos.length;
        const CIRRO_CLOUD_COUNT = 36;
        const CIRRO_PER_VARIANT = Math.ceil(CIRRO_CLOUD_COUNT / CIRRO_VARIANTS);
    
        const cirroCloudMat = new THREE.MeshToonMaterial({
            color: new THREE.Color(params.cloudsBillboardColor || 0xffffff),
            transparent: false,
            opacity: params.cloudsBillboardOpacity !== undefined ? params.cloudsBillboardOpacity : 1.0,
            depthWrite: true,
            depthTest: true,
            side: THREE.FrontSide
        });
        setupToonCloudShader(cirroCloudMat, params.cloudsBillboardBottomBlur !== undefined ? params.cloudsBillboardBottomBlur : 0.40);
    
        const cirroMeshes = [];
        const instBillboardClouds = new THREE.Group();
        instBillboardClouds.name = 'DistantHighCloudsGroup';
        instBillboardClouds.visible = params.cloudsBillboard !== false;
        scene.add(instBillboardClouds);
    
        cirroGeos.forEach((geo, idx) => {
            const m = new THREE.InstancedMesh(geo, cirroCloudMat, CIRRO_PER_VARIANT);
            m.frustumCulled = false;
            m.name = `CirroCloudVariant_${idx}`;
            cirroMeshes.push(m);
            instBillboardClouds.add(m);
        });
    
        const cirroBaseScale = [];
        const cirroAvoidanceOffset = new Float32Array(CIRRO_CLOUD_COUNT * 2);
        for (let v = 0; v < CIRRO_VARIANTS; v++) {
            cirroBaseScale.push(new Float32Array(CIRRO_PER_VARIANT * 3));
        }

        // Stable per-instance variation: changing a slider reshapes the same cloud family
        // rather than making clouds flicker or reshuffle between frames.
        function getCloudSizeVariation(index, amount = 0) {
            const seeded = Math.sin((index + 1) * 12.9898) * 43758.5453;
            const normalized = seeded - Math.floor(seeded);
            return 1 + (normalized * 2 - 1) * amount;
        }

        function getLowLayerSizeVariation(index, amount = 0) {
            // The editor still controls variation, but nearby clouds cannot collapse into dots
            // or grow into giant banks. This keeps the layer varied and consistently readable.
            return THREE.MathUtils.clamp(getCloudSizeVariation(index, amount), 0.55, 1.45);
        }

        function getLowLayerRadius(distance) {
            // Large enough to exist as a pre-built world layer, while retaining useful density
            // with the editor's intentionally short nearby-cloud distance values.
            return Math.max(1100, (Number(distance) || 450) * 2.5);
        }

        function getLowLayerVisualScale(scale) {
            // The nearby layer is intentionally composed of small clouds. Give that art layer
            // enough screen coverage at its low editor values without changing the slider's
            // linear response: 0.4 still remains exactly half of 0.8.
            return (Number(scale) || 0) * 2.25;
        }

        function smoothstep01(value) {
            const t = THREE.MathUtils.clamp(value, 0, 1);
            return t * t * (3 - 2 * t);
        }

        function getNearScale(distance) {
            return smoothstep01((distance - 15) / 45);
        }

        function getCloudVisibilityScale(position, playerX, playerY, playerZ) {
            const dx = position.x - playerX;
            const dz = position.z - playerZ;
            const horizontalDistance = Math.hypot(dx, dz);
            const cameraDistance = Math.hypot(horizontalDistance, position.y - playerY);
            // Preserve the exact editor size at normal viewing distances. Only the near-camera
            // safety dissolve may reduce scale, preventing geometry from slicing through the camera.
            return getNearScale(cameraDistance);
        }

        function getTerrainSafeAltitude(x, z, targetY, maritimeOnly = false) {
            const terrainY = getWorldHeight(x, z);
            if (maritimeOnly && terrainY > 0) return null;
            if (terrainY <= 0) return targetY;
            const terrainClearance = Math.max(0, params.cloudTerrainClearance ?? 120);
            return Math.max(targetY, terrainY + terrainClearance);
        }

        function getLowCloudTargetAltitude(index, x, z, baseAltitude) {
            const tier = index % 3;
            let targetY = baseAltitude + (lowAltitudeOffsets[index % CLOUD_COUNT] || 0);
            if (tier === 1) targetY += 140 + (index % 7) * 16;
            else if (tier === 2) targetY += 360 + (index % 5) * 32;
            return getTerrainSafeAltitude(x, z, targetY);
        }

        function updateLowCloudAltitude(baseAltitude) {
            if (!instClouds) return;
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const totalSlots = instClouds.instanceMatrix ? instClouds.instanceMatrix.count : instClouds.count;

            for (let i = 0; i < totalSlots; i++) {
                instClouds.getMatrixAt(i, matrix);
                matrix.decompose(position, rotation, scale);
                if (position.y <= -4000) continue;
                position.y = getLowCloudTargetAltitude(i, position.x, position.z, baseAltitude);
                matrix.compose(position, rotation, scale);
                instClouds.setMatrixAt(i, matrix);
            }
            instClouds.instanceMatrix.needsUpdate = true;
        }

        function findOceanCandidate(originX, originZ, radius, initialAngle, targetY) {
            for (let attempt = 0; attempt < 18; attempt++) {
                const angle = initialAngle + attempt * 2.399963;
                const r = radius * (0.88 + ((attempt * 7) % 19) / 100);
                const x = originX + Math.cos(angle) * r;
                const z = originZ + Math.sin(angle) * r;
                const y = getTerrainSafeAltitude(x, z, targetY, true);
                if (y !== null) return { x, y, z, angle };
            }
            return null;
        }

        function getLayerDrift(distance) {
            const base = Math.max(0, params.cloudWindBaseSpeed || 18);
            const reference = Math.max(1, params.cloudWindReferenceDistance || 1200);
            const gamma = THREE.MathUtils.clamp(params.cloudWindAttenuation ?? 0.60, 0.45, 0.75);
            return base * Math.pow(reference / Math.max(reference, distance), gamma);
        }

        function getParallaxFactor(distance, maximumDistance) {
            const strength = THREE.MathUtils.clamp(params.cloudParallaxStrength ?? 0.35, 0, 1);
            return Math.max(0, 1 - distance / Math.max(distance, maximumDistance)) * strength;
        }

        function applySoftDrift(offsets, index, position, influenceRadius, playerX, playerY, playerZ, velocityX, velocityZ, dt) {
            const slot = index * 2;
            const previousX = offsets[slot] || 0;
            const previousZ = offsets[slot + 1] || 0;
            position.x -= previousX;
            position.z -= previousZ;

            const dx = position.x - playerX;
            const dy = position.y - playerY;
            const dz = position.z - playerZ;
            const distance = Math.hypot(dx, dy, dz);
            const horizontalDistance = Math.hypot(dx, dz);
            const speed = Math.hypot(velocityX, velocityZ);
            let targetX = 0;
            let targetZ = 0;

            const stableInfluenceRadius = THREE.MathUtils.clamp(influenceRadius, 80, 2400);
            if (speed > 0.5 && distance < stableInfluenceRadius && horizontalDistance > 0.001) {
                const vx = velocityX / speed;
                const vz = velocityZ / speed;
                const headingCos = (vx * dx + vz * dz) / horizontalDistance;
                if (headingCos > (params.cloudAvoidanceHeadingThreshold ?? 0.65)) {
                    const cross = vx * dz - vz * dx;
                    const side = Math.abs(cross) > 0.001 ? Math.sign(cross) : ((index & 1) ? 1 : -1);
                    const nx = -vz * side;
                    const nz = vx * side;
                    const proximity = 1 - distance / stableInfluenceRadius;
                    const push = Math.min(
                        stableInfluenceRadius * 0.42,
                        proximity * proximity * stableInfluenceRadius * (params.cloudAvoidanceStrength ?? 0.90)
                    );
                    targetX = nx * push;
                    targetZ = nz * push;
                }
            }

            const isThreat = targetX !== 0 || targetZ !== 0;
            const tau = isThreat ? 0.35 : Math.max(0.1, params.cloudAvoidanceRestoreTau || 2.5);
            const response = 1 - Math.exp(-dt / tau);
            offsets[slot] = THREE.MathUtils.lerp(previousX, targetX, response);
            offsets[slot + 1] = THREE.MathUtils.lerp(previousZ, targetZ, response);
            position.x += offsets[slot];
            position.z += offsets[slot + 1];
        }

        function getMeshBoundingRadius(mesh) {
            if (!mesh?.geometry) return 100;
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            return mesh.geometry.boundingSphere?.radius || 100;
        }

        function getStableAvoidanceRadius(mesh, visualScale) {
            // Scale affects the collision envelope gently, but cannot turn a large art-direction
            // value into a multi-kilometre position shove that breaks the cloud's motion path.
            const scaleFactor = Math.sqrt(THREE.MathUtils.clamp(Math.abs(visualScale), 0.25, 6));
            return getMeshBoundingRadius(mesh) * scaleFactor;
        }

        function updateDistantCloudGroup(meshes, group, offsets, playerY, velocityX, velocityZ, dt, distanceSetting, layerSpeed, windAngle) {
            const groupScaleX = Math.max(0.001, Math.abs(group.scale.x));
            const groupScaleZ = Math.max(0.001, Math.abs(group.scale.z));
            const windX = Math.cos(windAngle);
            const windZ = Math.sin(windAngle);

            meshes.forEach((mesh, variantIndex) => {
                const totalSlots = mesh.count;
                for (let slot = 0; slot < totalSlots; slot++) {
                    mesh.getMatrixAt(slot, cloudDummy.matrix);
                    cloudDummy.matrix.decompose(cloudDummy.position, cloudDummy.quaternion, cloudDummy.scale);

                    const worldDistance = Math.hypot(
                        cloudDummy.position.x * groupScaleX,
                        cloudDummy.position.z * groupScaleZ
                    );
                    const drift = getLayerDrift(worldDistance) * layerSpeed;
                    cloudDummy.position.x += windX * drift * dt / groupScaleX;
                    cloudDummy.position.z += windZ * drift * dt / groupScaleZ;

                    const cloudIndex = slot * meshes.length + variantIndex;
                    const visualScale = Math.max(cloudDummy.scale.x, cloudDummy.scale.y, cloudDummy.scale.z);
                    const sizeRadius = getStableAvoidanceRadius(mesh, visualScale) * 1.35;
                    const influenceRadius = Math.min(
                        Math.max(300, (Number(distanceSetting) || 1) * 0.42),
                        Math.max(300, sizeRadius)
                    );
                    applySoftDrift(
                        offsets,
                        cloudIndex,
                        cloudDummy.position,
                        influenceRadius / Math.max(groupScaleX, groupScaleZ),
                        0,
                        playerY,
                        0,
                        velocityX / groupScaleX,
                        velocityZ / groupScaleZ,
                        dt
                    );

                    cloudDummy.updateMatrix();
                    mesh.setMatrixAt(slot, cloudDummy.matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
            });
        }

        function redistributeLowClouds(playerX, playerZ, previousDistance, nextDistance) {
            const oldDistance = getLowLayerRadius(previousDistance);
            const newDistance = getLowLayerRadius(nextDistance);
            const ratio = newDistance / oldDistance;
            for (let i = 0; i < CLOUD_COUNT; i++) {
                lowCloudPosX[i] = playerX + (lowCloudPosX[i] - playerX) * ratio;
                lowCloudPosZ[i] = playerZ + (lowCloudPosZ[i] - playerZ) * ratio;
            }

            if (!instClouds) return;
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const totalSlots = instClouds.instanceMatrix ? instClouds.instanceMatrix.count : instClouds.count;
            for (let i = 0; i < totalSlots; i++) {
                instClouds.getMatrixAt(i, matrix);
                matrix.decompose(position, rotation, scale);
                if (position.y <= -4000) continue;
                position.x = playerX + (position.x - playerX) * ratio;
                position.z = playerZ + (position.z - playerZ) * ratio;
                matrix.compose(position, rotation, scale);
                instClouds.setMatrixAt(i, matrix);
            }
            instClouds.instanceMatrix.needsUpdate = true;
        }
    
        function setCloudSize(target, v) {
            if (!target) return;
            const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
            if (target === instClouds) {
                const count = instClouds.instanceMatrix ? instClouds.instanceMatrix.count : instClouds.count;
                for (let i = 0; i < count; i++) {
                    instClouds.getMatrixAt(i, m);
                    m.decompose(p, q, sc);
                    sc.set(cloudBaseScale[i * 3], cloudBaseScale[i * 3 + 1], cloudBaseScale[i * 3 + 2]).multiplyScalar(getLowLayerVisualScale(v) * getLowLayerSizeVariation(i, params.cloudsLowSizeVariation));
                    m.compose(p, q, sc);
                    instClouds.setMatrixAt(i, m);
                }
                instClouds.instanceMatrix.needsUpdate = true;
            } else if (target === instHighClouds) {
                const count = instHighClouds.instanceMatrix ? instHighClouds.instanceMatrix.count : instHighClouds.count;
                for (let i = 0; i < count; i++) {
                    instHighClouds.getMatrixAt(i, m);
                    m.decompose(p, q, sc);
                    sc.set(highCloudBaseScale[i * 3], highCloudBaseScale[i * 3 + 1], highCloudBaseScale[i * 3 + 2]).multiplyScalar(v * getCloudSizeVariation(i, params.cloudsHighSizeVariation));
                    m.compose(p, q, sc);
                    instHighClouds.setMatrixAt(i, m);
                }
                instHighClouds.instanceMatrix.needsUpdate = true;
            } else if (target === instLowTowerClouds) {
                const count = instLowTowerClouds.instanceMatrix ? instLowTowerClouds.instanceMatrix.count : instLowTowerClouds.count;
                for (let i = 0; i < count; i++) {
                    instLowTowerClouds.getMatrixAt(i, m);
                    m.decompose(p, q, sc);
                    sc.set(lowTowerCloudBaseScale[i * 3], lowTowerCloudBaseScale[i * 3 + 1], lowTowerCloudBaseScale[i * 3 + 2]).multiplyScalar(v * getCloudSizeVariation(i, params.cloudsLowTowerSizeVariation));
                    m.compose(p, q, sc);
                    instLowTowerClouds.setMatrixAt(i, m);
                }
                instLowTowerClouds.instanceMatrix.needsUpdate = true;
            } else if (target === instMegaClouds) {
                megaMeshes.forEach((mesh, vIdx) => {
                    const arr = megaCloudBaseScale[vIdx];
                    const count = mesh.instanceMatrix ? mesh.instanceMatrix.count : mesh.count;
                    for (let i = 0; i < count; i++) {
                        mesh.getMatrixAt(i, m);
                        m.decompose(p, q, sc);
                        const cloudIndex = i * MEGA_VARIANTS + vIdx;
                        sc.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).multiplyScalar(v * getCloudSizeVariation(cloudIndex, params.cloudsGiantSizeVariation));
                        m.compose(p, q, sc);
                        mesh.setMatrixAt(i, m);
                    }
                    mesh.instanceMatrix.needsUpdate = true;
                });
            } else if (target === instBillboardClouds) {
                cirroMeshes.forEach((mesh, vIdx) => {
                    const arr = cirroBaseScale[vIdx];
                    const count = mesh.instanceMatrix ? mesh.instanceMatrix.count : mesh.count;
                    for (let i = 0; i < count; i++) {
                        mesh.getMatrixAt(i, m);
                        m.decompose(p, q, sc);
                        const cloudIndex = i * CIRRO_VARIANTS + vIdx;
                        sc.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).multiplyScalar(v * getCloudSizeVariation(cloudIndex, params.cloudsBillboardSizeVariation));
                        m.compose(p, q, sc);
                        mesh.setMatrixAt(i, m);
                    }
                    mesh.instanceMatrix.needsUpdate = true;
                });
            } else if (target === instLowBankClouds || target.isGroup) {
                lowBankMeshes.forEach((mesh, vIdx) => {
                    const arr = lowBankCloudBaseScale[vIdx];
                    const count = mesh.instanceMatrix ? mesh.instanceMatrix.count : mesh.count;
                    for (let i = 0; i < count; i++) {
                        mesh.getMatrixAt(i, m);
                        m.decompose(p, q, sc);
                        sc.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).multiplyScalar(v);
                        m.compose(p, q, sc);
                        mesh.setMatrixAt(i, m);
                    }
                    mesh.instanceMatrix.needsUpdate = true;
                });
            }
        }
    
        function setCloudCount(target, v) {
            if (!target) return;
            if (target.isGroup) {
                const total = Math.round(v);
                const numVariants = target.children.length;
                target.children.forEach((child, idx) => {
                    if (!child.instanceMatrix) return;
                    const max = child.instanceMatrix.count;
                    const countForThis = Math.floor(total / numVariants) + (idx < (total % numVariants) ? 1 : 0);
                    child.count = Math.min(countForThis, max);
                    child.visible = child.count > 0;
                    child.instanceMatrix.needsUpdate = true;
                });
            } else if (target.instanceMatrix) {
                target.count = Math.min(Math.round(v), target.instanceMatrix.count);
                target.instanceMatrix.needsUpdate = true;
            }
        }
    
        function setMaterialOpacity(mat, v) {
            if (!mat) return;
            mat.opacity = v;
            // Clustered 3D puff clouds must stay solid (opaque) to prevent internal overlapping sphere discs
            mat.transparent = false;
            mat.depthWrite = true;
            if (mat.userData && mat.userData.shader && mat.userData.shader.uniforms.uCloudOpacity) {
                mat.userData.shader.uniforms.uCloudOpacity.value = v;
            }
        }
    
        // Initialize cloud instances distributed in an authentic 360-degree horizon panorama
    const dummyInit = new THREE.Object3D();
    for (let i = 0; i < CLOUD_COUNT; i++) {
        const ang = i * 2.399963;
        const rNorm = Math.sqrt((i + 0.5) / CLOUD_COUNT);
        const r = 180 + rNorm * 2250;
        const initX = spawnX + Math.sin(ang) * r;
        const initZ = spawnZ + Math.cos(ang) * r;

        const alt = getLowCloudTargetAltitude(i, initX, initZ, params.cloudsLowAltitude !== undefined ? params.cloudsLowAltitude : 150);
        dummyInit.position.set(initX, alt, initZ);

        dummyInit.rotation.set(0, Math.random() * Math.PI * 2, 0);
        const s = (1.5 + (i % 5) * 0.45) * 1.5;
        cloudBaseScale[i * 3 + 0] = s * 1.3;
        cloudBaseScale[i * 3 + 1] = s * 0.8;
        cloudBaseScale[i * 3 + 2] = s * 1.2;
        dummyInit.scale.set(cloudBaseScale[i * 3], cloudBaseScale[i * 3 + 1], cloudBaseScale[i * 3 + 2]).multiplyScalar(params.cloudsLowSize);
        dummyInit.updateMatrix();
        instClouds.setMatrixAt(i, dummyInit.matrix);
    }
    for (let i = 0; i < HIGH_CLOUD_COUNT; i++) {
        // Golden angle distribution ensures any count (4, 6, 8, 12, 24) is evenly spaced 360 deg around horizon
        const ang = (i * 2.399963) + (Math.random() - 0.5) * 0.15;
        const r = (params.cloudsHighDistance || 2600) + (i % 3) * 200;
        const altOffset = highAltitudeOffsets[i % highAltitudeOffsets.length] || 0;
        dummyInit.position.set(spawnX + Math.cos(ang) * r, params.cloudsHighAltitude + altOffset, spawnZ + Math.sin(ang) * r);
        const tangentAng = ang + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
        dummyInit.rotation.set(0, tangentAng + (i % 2 === 0 ? 0 : Math.PI), 0);
        const s = 0.95 + (i % 4) * 0.1;
        highCloudBaseScale[i * 3 + 0] = s;
        highCloudBaseScale[i * 3 + 1] = s;
        highCloudBaseScale[i * 3 + 2] = s;
        dummyInit.scale.set(s, s, s).multiplyScalar(params.cloudsHighSize);
        dummyInit.updateMatrix();
        instHighClouds.setMatrixAt(i, dummyInit.matrix);
    }
    for (let i = 0; i < WISPY_CLOUD_COUNT; i++) {
        dummyInit.position.set(0, -9999, 0);
        dummyInit.scale.set(0, 0, 0);
        dummyInit.updateMatrix();
        instWispyClouds.setMatrixAt(i, dummyInit.matrix);
    }
    for (let i = 0; i < MEGA_CLOUD_COUNT; i++) {
        const variantIdx = i % MEGA_VARIANTS;
        const slotInVariant = Math.floor(i / MEGA_VARIANTS);
        const ang = (i * 2.399963 + 1.2) + (Math.random() - 0.5) * 0.20;
        const tierDist = (params.cloudsGiantDistance || 6000) + ((i % 3) - 1) * 350;
        const altOffset = cloudAltitudeOffsets[i % cloudAltitudeOffsets.length] || 0;
        dummyInit.position.set(Math.cos(ang) * tierDist, params.cloudsGiantAltitude + altOffset, Math.sin(ang) * tierDist);
        const tangentAng = ang + Math.PI * 0.5 + (Math.random() - 0.5) * 0.5;
        dummyInit.rotation.set(0, tangentAng + (i % 2 === 0 ? 0 : Math.PI), 0);
        const s = 0.95 + (i % 3) * 0.12;
        const sx = s * 1.15 * (0.88 + (i % 4) * 0.09);
        const sy = s * (0.90 + ((i + 1) % 4) * 0.08);
        const sz = s * (0.92 + ((i + 2) % 3) * 0.08);
        megaCloudBaseScale[variantIdx][slotInVariant * 3 + 0] = sx;
        megaCloudBaseScale[variantIdx][slotInVariant * 3 + 1] = sy;
        megaCloudBaseScale[variantIdx][slotInVariant * 3 + 2] = sz;
        dummyInit.scale.set(sx, sy, sz).multiplyScalar(params.cloudsGiantSize);
        dummyInit.updateMatrix();
        megaMeshes[variantIdx].setMatrixAt(slotInVariant, dummyInit.matrix);
    }
    instClouds.instanceMatrix.needsUpdate = true;
    instHighClouds.instanceMatrix.needsUpdate = true;
    instWispyClouds.instanceMatrix.needsUpdate = true;
    instMegaClouds.position.set(spawnX, 0, spawnZ);
    megaMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });

    for (let i = 0; i < LOW_TOWER_CLOUD_COUNT; i++) {
        // Full 360-degree golden angle distribution
        const ang = (i * 2.399963 + 0.8) + (Math.random() - 0.5) * 0.25;
        const r = (params.cloudsLowTowerDistance || 3200) + (i % 4) * 240;
        const initAlt = (params.cloudsLowTowerAltitude !== undefined ? params.cloudsLowTowerAltitude : -35) + (lowTowerAltitudeOffsets[i % lowTowerAltitudeOffsets.length] || 0) * 0.5;
        dummyInit.position.set(spawnX + Math.cos(ang) * r, initAlt, spawnZ + Math.sin(ang) * r);
        const tangentAng = ang + Math.PI * 0.5 + (Math.random() - 0.5) * 0.8;
        dummyInit.rotation.set(0, tangentAng + (Math.random() > 0.5 ? 0 : Math.PI), 0);
        const s = 0.95 + (i % 4) * 0.12;
        const sx = s * (0.85 + ((i * 7) % 5) * 0.10);
        const sy = s * (0.88 + ((i * 3) % 4) * 0.12);
        const sz = s * (0.90 + ((i * 5) % 3) * 0.12);
        lowTowerCloudBaseScale[i * 3 + 0] = sx;
        lowTowerCloudBaseScale[i * 3 + 1] = sy;
        lowTowerCloudBaseScale[i * 3 + 2] = sz;
        dummyInit.scale.set(sx, sy, sz).multiplyScalar(params.cloudsLowTowerSize);
        dummyInit.updateMatrix();
        instLowTowerClouds.setMatrixAt(i, dummyInit.matrix);
    }
    for (let i = 0; i < MEGA_CLOUD_COUNT; i++) {
        const variantIdx = i % MEGA_VARIANTS;
        const slotInVariant = Math.floor(i / MEGA_VARIANTS);
        const density = params.cloudsLowBankDensity || 1.0;
        const ang = (i * 2.399963 / Math.max(0.2, density) + 2.4) + (Math.random() - 0.5) * 0.15;
        const baseDist = params.cloudsLowBankDistance || 3400;
        const depthLayer = (i % 2 === 0) ? (baseDist - 250) : (baseDist + 250);
        const altOffset = cloudAltitudeOffsets[i % cloudAltitudeOffsets.length] || 0;
        dummyInit.position.set(Math.cos(ang) * depthLayer, params.cloudsLowBankAltitude + altOffset, Math.sin(ang) * depthLayer);
        const tangentAng = ang + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
        dummyInit.rotation.set(0, tangentAng + (i % 2 === 0 ? 0 : Math.PI), 0);
        const s = 0.95 + (i % 3) * 0.1;
        const widthBoost = Math.min(1.8, Math.max(0.7, 0.8 + density * 0.25));
        const sx = s * 1.15 * (0.88 + (i % 4) * 0.09) * widthBoost;
        const sy = s * (0.90 + ((i + 1) % 4) * 0.08);
        const sz = s * (0.92 + ((i + 2) % 3) * 0.08) * widthBoost;
        lowBankCloudBaseScale[variantIdx][slotInVariant * 3 + 0] = sx;
        lowBankCloudBaseScale[variantIdx][slotInVariant * 3 + 1] = sy;
        lowBankCloudBaseScale[variantIdx][slotInVariant * 3 + 2] = sz;
        dummyInit.scale.set(sx, sy, sz).multiplyScalar(params.cloudsLowBankSize);
        dummyInit.updateMatrix();
        lowBankMeshes[variantIdx].setMatrixAt(slotInVariant, dummyInit.matrix);
    }
    instLowTowerClouds.instanceMatrix.needsUpdate = true;
    instLowBankClouds.position.set(spawnX, 0, spawnZ);
    lowBankMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });

    // Initialize 3D Distant High Clouds (Layer 6)
    for (let i = 0; i < CIRRO_CLOUD_COUNT; i++) {
        const variantIdx = i % CIRRO_VARIANTS;
        const slotInVariant = Math.floor(i / CIRRO_VARIANTS);
        const ang = (i * 2.399963 + 0.5) + (Math.random() - 0.5) * 0.2;
        const distMult = 0.88 + (i % 3) * 0.14;
        const baseDist = (params.cloudsBillboardDistance || 5200) * distMult;
        const altOffset = (Math.random() - 0.5) * 350;
        const baseAlt = (params.cloudsBillboardAltitude || 1400) + altOffset;
        dummyInit.position.set(Math.sin(ang) * baseDist, baseAlt, Math.cos(ang) * baseDist);
        const tangentAng = ang + Math.PI * 0.5 + (Math.random() - 0.5) * 0.5;
        dummyInit.rotation.set(0, tangentAng + (i % 2 === 0 ? 0 : Math.PI), 0);
        const s = 1.0 + (i % 3) * 0.2;
        const sx = s * (1.3 + (i % 4) * 0.15);
        const sy = s * 0.75;
        const sz = s * (1.1 + ((i + 1) % 3) * 0.15);
        cirroBaseScale[variantIdx][slotInVariant * 3 + 0] = sx;
        cirroBaseScale[variantIdx][slotInVariant * 3 + 1] = sy;
        cirroBaseScale[variantIdx][slotInVariant * 3 + 2] = sz;
        dummyInit.scale.set(sx, sy, sz).multiplyScalar(params.cloudsBillboardSize || 1.0);
        dummyInit.updateMatrix();
        cirroMeshes[variantIdx].setMatrixAt(slotInVariant, dummyInit.matrix);
    }
    instBillboardClouds.position.set(spawnX, 0, spawnZ);
    cirroMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });

    // Pure harmonious white cloud color baseline
    const tempCloudColor = new THREE.Color(0xffffff);
    for (let i = 0; i < CLOUD_COUNT; i++) {
        instClouds.setColorAt(i, tempCloudColor);
    }
    for (let i = 0; i < HIGH_CLOUD_COUNT; i++) {
        instHighClouds.setColorAt(i, tempCloudColor);
    }
    for (let i = 0; i < LOW_TOWER_CLOUD_COUNT; i++) {
        instLowTowerClouds.setColorAt(i, tempCloudColor);
    }
    megaMeshes.forEach(mesh => {
        for (let i = 0; i < mesh.count; i++) {
            mesh.setColorAt(i, tempCloudColor);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    lowBankMeshes.forEach(mesh => {
        for (let i = 0; i < mesh.count; i++) {
            mesh.setColorAt(i, tempCloudColor);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    cirroMeshes.forEach(mesh => {
        for (let i = 0; i < mesh.count; i++) {
            mesh.setColorAt(i, tempCloudColor);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    if (instClouds.instanceColor) instClouds.instanceColor.needsUpdate = true;
    if (instHighClouds.instanceColor) instHighClouds.instanceColor.needsUpdate = true;
    if (instLowTowerClouds.instanceColor) instLowTowerClouds.instanceColor.needsUpdate = true;

    // Apply initial cloud count limits so horizon starts clean and majestic
    setCloudCount(instHighClouds, params.cloudsHighCount);
    setCloudCount(instMegaClouds, params.cloudsGiantCount);
    setCloudCount(instLowTowerClouds, params.cloudsLowTowerCount);
    setCloudCount(instLowBankClouds, params.cloudsLowBankCount);
    setCloudCount(instBillboardClouds, params.cloudsBillboardCount);

        // =========================================================================
        // CLOUD TYPE DEBUG MODE & 3D NAME OVERLAYS
        // =========================================================================
        const _cloudDebugM4 = new THREE.Matrix4();
        const _cloudDebugPos = new THREE.Vector3();
        const _cloudDebugProj = new THREE.Vector3();
        const _cloudDebugCamPos = new THREE.Vector3();
        const _cloudDebugCamDir = new THREE.Vector3();
        const MEGA_ARCHETYPE_NAMES = ['Shelf', 'Fortress', 'Asymmetric', 'Undulating'];
    
        function drawDebugRoundRect(c, x, y, w, h, radius) {
            if (c.roundRect) {
                c.beginPath();
                c.roundRect(x, y, w, h, radius);
                return;
            }
            c.beginPath();
            c.moveTo(x + radius, y);
            c.lineTo(x + w - radius, y);
            c.quadraticCurveTo(x + w, y, x + w, y + radius);
            c.lineTo(x + w, y + h - radius);
            c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            c.lineTo(x + radius, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - radius);
            c.lineTo(x, y + radius);
            c.quadraticCurveTo(x, y, x + radius, y);
            c.closePath();
        }
    
        function setCloudDebugMode(enabled) {
            params.showCloudDebug = !!enabled;
            const cvs = document.getElementById('cloud-debug-canvas');
            if (cvs) {
                cvs.style.display = params.showCloudDebug ? 'block' : 'none';
                if (params.showCloudDebug) {
                    cvs.width = window.innerWidth;
                    cvs.height = window.innerHeight;
                } else {
                    const ctx = cvs.getContext('2d');
                    if (ctx) ctx.clearRect(0, 0, cvs.width, cvs.height);
                }
            }
            updateCloudDebugTints();
            if (typeof gui !== 'undefined' && gui && typeof gui.controllersRecursive === 'function') {
                gui.controllersRecursive().forEach(c => {
                    if (c.property === 'showCloudDebug' || c.property === 'debugCloudTint') c.updateDisplay();
                });
            }
        }
        window.setCloudDebugMode = setCloudDebugMode;
    
        function updateCloudDebugTints() {
            const useTint = params.showCloudDebug && params.debugCloudTint;
            const l1Color = new THREE.Color(useTint ? '#4ade80' : (params.cloudsLowColor || '#ffffff'));
            const l2Color = new THREE.Color(useTint ? '#f472b6' : (params.cloudsHighColor || '#ffffff'));
            const l3Color = new THREE.Color(useTint ? '#facc15' : (params.cloudsLowTowerColor || '#ffffff'));
            const l4Color = new THREE.Color(useTint ? '#38bdf8' : (params.cloudsGiantColor || '#ffffff'));
            const l5Color = new THREE.Color(useTint ? '#fb923c' : (params.cloudsLowBankColor || '#ffffff'));
    
            if (matCloud && matCloud.userData && matCloud.userData.shader && matCloud.userData.shader.uniforms.uCloudTint) {
                matCloud.userData.shader.uniforms.uCloudTint.value.copy(l1Color);
            }
            if (highCloudMat && highCloudMat.userData && highCloudMat.userData.shader && highCloudMat.userData.shader.uniforms.uCloudTint) {
                highCloudMat.userData.shader.uniforms.uCloudTint.value.copy(l2Color);
            }
            if (lowTowerCloudMat && lowTowerCloudMat.userData && lowTowerCloudMat.userData.shader && lowTowerCloudMat.userData.shader.uniforms.uCloudTint) {
                lowTowerCloudMat.userData.shader.uniforms.uCloudTint.value.copy(l3Color);
            }
            if (megaCloudMat && megaCloudMat.userData && megaCloudMat.userData.shader && megaCloudMat.userData.shader.uniforms.uCloudTint) {
                megaCloudMat.userData.shader.uniforms.uCloudTint.value.copy(l4Color);
            }
            if (lowBankCloudMat && lowBankCloudMat.userData && lowBankCloudMat.userData.shader && lowBankCloudMat.userData.shader.uniforms.uCloudTint) {
                lowBankCloudMat.userData.shader.uniforms.uCloudTint.value.copy(l5Color);
            }
        }
        window.updateCloudDebugTints = updateCloudDebugTints;
    
        function renderCloudDebugOverlays() {
            const cvs = document.getElementById('cloud-debug-canvas');
            if (!cvs) return;
            const ctx = cvs.getContext('2d');
            if (!ctx) return;
    
            if (!params.showCloudDebug) {
                ctx.clearRect(0, 0, cvs.width, cvs.height);
                return;
            }
    
            const curCam = (params.godMode && window.godCamera) ? window.godCamera : camera;
            if (!curCam) return;
    
            curCam.getWorldPosition(_cloudDebugCamPos);
            curCam.getWorldDirection(_cloudDebugCamDir);
    
            const w = cvs.width;
            const h = cvs.height;
            ctx.clearRect(0, 0, w, h);
    
            const candidates = [];
    
            // 1. Layer 1: Low Clouds (Nearby)
            if (instClouds && instClouds.visible) {
                const count = instClouds.count;
                for (let i = 0; i < count; i++) {
                    instClouds.getMatrixAt(i, _cloudDebugM4);
                    _cloudDebugPos.setFromMatrixPosition(_cloudDebugM4);
                    if (_cloudDebugPos.y < -4000) continue;
    
                    const cdx = _cloudDebugPos.x - _cloudDebugCamPos.x;
                    const cdy = _cloudDebugPos.y - _cloudDebugCamPos.y;
                    const cdz = _cloudDebugPos.z - _cloudDebugCamPos.z;
                    const dot = cdx * _cloudDebugCamDir.x + cdy * _cloudDebugCamDir.y + cdz * _cloudDebugCamDir.z;
                    if (dot <= 5) continue;
    
                    const dist = Math.hypot(cdx, cdy, cdz);
                    if (dist > 3500) continue;
    
                    candidates.push({
                        layer: 1,
                        code: 'L1',
                        name: `Low Cloud #${i + 1}`,
                        x: _cloudDebugPos.x,
                        y: _cloudDebugPos.y,
                        z: _cloudDebugPos.z,
                        alt: Math.round(_cloudDebugPos.y),
                        dist: Math.round(dist),
                        crownH: 26,
                        radius: 55,
                        color: '#4ade80',
                        badgeBg: 'rgba(15, 23, 42, 0.92)',
                        border: '#4ade80'
                    });
                }
            }
    
            // 2. Layer 2: Distant Cumulus Towers
            if (instHighClouds && instHighClouds.visible) {
                const count = instHighClouds.count;
                for (let i = 0; i < count; i++) {
                    instHighClouds.getMatrixAt(i, _cloudDebugM4);
                    _cloudDebugPos.setFromMatrixPosition(_cloudDebugM4);
                    if (_cloudDebugPos.y < -4000) continue;
    
                    const cdx = _cloudDebugPos.x - _cloudDebugCamPos.x;
                    const cdy = _cloudDebugPos.y - _cloudDebugCamPos.y;
                    const cdz = _cloudDebugPos.z - _cloudDebugCamPos.z;
                    const dot = cdx * _cloudDebugCamDir.x + cdy * _cloudDebugCamDir.y + cdz * _cloudDebugCamDir.z;
                    if (dot <= 5) continue;
    
                    const dist = Math.hypot(cdx, cdy, cdz);
                    if (dist > 7500) continue;
    
                    candidates.push({
                        layer: 2,
                        code: 'L2',
                        name: `Cumulus Tower #${i + 1}`,
                        x: _cloudDebugPos.x,
                        y: _cloudDebugPos.y,
                        z: _cloudDebugPos.z,
                        alt: Math.round(_cloudDebugPos.y),
                        dist: Math.round(dist),
                        crownH: 140,
                        radius: 120,
                        color: '#f472b6',
                        badgeBg: 'rgba(15, 23, 42, 0.92)',
                        border: '#f472b6'
                    });
                }
            }
    
            // 3. Layer 3: Low Horizon Towers
            if (instLowTowerClouds && instLowTowerClouds.visible) {
                const count = instLowTowerClouds.count;
                for (let i = 0; i < count; i++) {
                    instLowTowerClouds.getMatrixAt(i, _cloudDebugM4);
                    _cloudDebugPos.setFromMatrixPosition(_cloudDebugM4);
                    if (_cloudDebugPos.y < -4000) continue;
    
                    const cdx = _cloudDebugPos.x - _cloudDebugCamPos.x;
                    const cdy = _cloudDebugPos.y - _cloudDebugCamPos.y;
                    const cdz = _cloudDebugPos.z - _cloudDebugCamPos.z;
                    const dot = cdx * _cloudDebugCamDir.x + cdy * _cloudDebugCamDir.y + cdz * _cloudDebugCamDir.z;
                    if (dot <= 5) continue;
    
                    const dist = Math.hypot(cdx, cdy, cdz);
                    if (dist > 8000) continue;
    
                    candidates.push({
                        layer: 3,
                        code: 'L3',
                        name: `Horizon Tower #${i + 1}`,
                        x: _cloudDebugPos.x,
                        y: _cloudDebugPos.y,
                        z: _cloudDebugPos.z,
                        alt: Math.round(_cloudDebugPos.y),
                        dist: Math.round(dist),
                        crownH: 120,
                        radius: 100,
                        color: '#facc15',
                        badgeBg: 'rgba(15, 23, 42, 0.92)',
                        border: '#facc15'
                    });
                }
            }
    
            // 4. Layer 4: Distant Horizon Banks
            if (instMegaClouds && instMegaClouds.visible && typeof megaMeshes !== 'undefined') {
                instMegaClouds.updateMatrixWorld();
                const totalMega = params.cloudsGiantCount !== undefined ? params.cloudsGiantCount : 14;
                for (let i = 0; i < totalMega; i++) {
                    const variantIdx = i % MEGA_VARIANTS;
                    const slotInVariant = Math.floor(i / MEGA_VARIANTS);
                    const mesh = megaMeshes[variantIdx];
                    if (!mesh || !mesh.visible) continue;
                    const arch = MEGA_ARCHETYPE_NAMES[variantIdx] || `Variant ${variantIdx + 1}`;
    
                    mesh.getMatrixAt(slotInVariant, _cloudDebugM4);
                    _cloudDebugPos.setFromMatrixPosition(_cloudDebugM4);
                    _cloudDebugPos.applyMatrix4(instMegaClouds.matrixWorld);
                    if (_cloudDebugPos.y < -4000) continue;
    
                    const cdx = _cloudDebugPos.x - _cloudDebugCamPos.x;
                    const cdy = _cloudDebugPos.y - _cloudDebugCamPos.y;
                    const cdz = _cloudDebugPos.z - _cloudDebugCamPos.z;
                    const dot = cdx * _cloudDebugCamDir.x + cdy * _cloudDebugCamDir.y + cdz * _cloudDebugCamDir.z;
                    if (dot <= 5) continue;
    
                    const dist = Math.hypot(cdx, cdy, cdz);
                    if (dist > 6500) continue;
    
                    candidates.push({
                        layer: 4,
                        code: 'L4',
                        name: `Horizon Bank (${arch})`,
                        x: _cloudDebugPos.x,
                        y: _cloudDebugPos.y,
                        z: _cloudDebugPos.z,
                        alt: Math.round(_cloudDebugPos.y),
                        dist: Math.round(dist),
                        crownH: 260,
                        radius: 280,
                        color: '#38bdf8',
                        badgeBg: 'rgba(15, 23, 42, 0.92)',
                        border: '#38bdf8'
                    });
                }
            }
    
            // 5. Layer 5: Low Horizon Banks
            if (instLowBankClouds && instLowBankClouds.visible && typeof lowBankMeshes !== 'undefined') {
                instLowBankClouds.updateMatrixWorld();
                const totalLowBank = params.cloudsLowBankCount !== undefined ? params.cloudsLowBankCount : 14;
                for (let i = 0; i < totalLowBank; i++) {
                    const variantIdx = i % MEGA_VARIANTS;
                    const slotInVariant = Math.floor(i / MEGA_VARIANTS);
                    const mesh = lowBankMeshes[variantIdx];
                    if (!mesh || !mesh.visible) continue;
                    const arch = MEGA_ARCHETYPE_NAMES[variantIdx] || `Variant ${variantIdx + 1}`;
    
                    mesh.getMatrixAt(slotInVariant, _cloudDebugM4);
                    _cloudDebugPos.setFromMatrixPosition(_cloudDebugM4);
                    _cloudDebugPos.applyMatrix4(instLowBankClouds.matrixWorld);
                    if (_cloudDebugPos.y < -4000) continue;
    
                    const cdx = _cloudDebugPos.x - _cloudDebugCamPos.x;
                    const cdy = _cloudDebugPos.y - _cloudDebugCamPos.y;
                    const cdz = _cloudDebugPos.z - _cloudDebugCamPos.z;
                    const dot = cdx * _cloudDebugCamDir.x + cdy * _cloudDebugCamDir.y + cdz * _cloudDebugCamDir.z;
                    if (dot <= 5) continue;
    
                    const dist = Math.hypot(cdx, cdy, cdz);
                    if (dist > 6500) continue;
    
                    candidates.push({
                        layer: 5,
                        code: 'L5',
                        name: `Low Bank (${arch})`,
                        x: _cloudDebugPos.x,
                        y: _cloudDebugPos.y,
                        z: _cloudDebugPos.z,
                        alt: Math.round(_cloudDebugPos.y),
                        dist: Math.round(dist),
                        crownH: 240,
                        radius: 240,
                        color: '#fb923c',
                        badgeBg: 'rgba(15, 23, 42, 0.92)',
                        border: '#fb923c'
                    });
                }
            }
    
            // 6. Layer 6: Distant High Clouds
            if (instBillboardClouds && instBillboardClouds.visible && typeof cirroMeshes !== 'undefined') {
                instBillboardClouds.updateMatrixWorld();
                const CIRRO_ARCH_NAMES = ['Cirro Shelf', 'Cirro Cluster', 'High Horizon Shelf'];
                const totalCirro = params.cloudsBillboardCount !== undefined ? params.cloudsBillboardCount : 26;
                for (let i = 0; i < totalCirro; i++) {
                    const variantIdx = i % CIRRO_VARIANTS;
                    const slotInVariant = Math.floor(i / CIRRO_VARIANTS);
                    const mesh = cirroMeshes[variantIdx];
                    if (!mesh || !mesh.visible) continue;
                    const arch = CIRRO_ARCH_NAMES[variantIdx] || `Variant ${variantIdx + 1}`;
    
                    mesh.getMatrixAt(slotInVariant, _cloudDebugM4);
                    _cloudDebugPos.setFromMatrixPosition(_cloudDebugM4);
                    _cloudDebugPos.applyMatrix4(instBillboardClouds.matrixWorld);
                    if (_cloudDebugPos.y < -4000) continue;
    
                    const cdx = _cloudDebugPos.x - _cloudDebugCamPos.x;
                    const cdy = _cloudDebugPos.y - _cloudDebugCamPos.y;
                    const cdz = _cloudDebugPos.z - _cloudDebugCamPos.z;
                    const dot = cdx * _cloudDebugCamDir.x + cdy * _cloudDebugCamDir.y + cdz * _cloudDebugCamDir.z;
                    if (dot <= 5) continue;
    
                    const dist = Math.hypot(cdx, cdy, cdz);
                    if (dist > 12000) continue;
    
                    candidates.push({
                        layer: 6,
                        code: 'L6',
                        name: `Distant Cloud (${arch})`,
                        x: _cloudDebugPos.x,
                        y: _cloudDebugPos.y,
                        z: _cloudDebugPos.z,
                        alt: Math.round(_cloudDebugPos.y),
                        dist: Math.round(dist),
                        crownH: 180,
                        radius: 350,
                        color: '#c084fc',
                        badgeBg: 'rgba(15, 23, 42, 0.92)',
                        border: '#c084fc'
                    });
                }
            }
    
            // Project candidates onto screen coordinates
            const onScreen = [];
            const fovRad = ((curCam.fov || 60) * Math.PI) / 180;
            const tanHalfFov = Math.tan(fovRad * 0.5);
    
            for (let i = 0; i < candidates.length; i++) {
                const c = candidates[i];
                if (c.y < -20 && c.dist > 1800) continue;
    
                _cloudDebugProj.set(c.x, c.y + c.crownH * 0.7, c.z);
                _cloudDebugProj.project(curCam);
    
                if (_cloudDebugProj.z >= 1.0 || _cloudDebugProj.z <= -1.0) continue;
                if (_cloudDebugProj.x < -0.95 || _cloudDebugProj.x > 0.95 || _cloudDebugProj.y < -0.95 || _cloudDebugProj.y > 0.95) continue;
    
                const sx = (_cloudDebugProj.x * 0.5 + 0.5) * w;
                const sy = (-_cloudDebugProj.y * 0.5 + 0.5) * h;
                const centerDist = Math.hypot(_cloudDebugProj.x, _cloudDebugProj.y);
                const screenRadius = Math.max(16, Math.min(320, (c.radius / (c.dist * tanHalfFov)) * (h * 0.5)));
    
                onScreen.push({
                    ...c,
                    subtext: `Alt: ${c.alt}m  •  Dist: ${c.dist}m`,
                    centerDist,
                    screenRadius,
                    sx,
                    sy
                });
            }
    
            onScreen.sort((a, b) => a.dist - b.dist);
    
            const visibleClouds = [];
            for (let i = 0; i < onScreen.length; i++) {
                const cand = onScreen[i];
                let isOccluded = false;
    
                for (let j = 0; j < visibleClouds.length; j++) {
                    const closer = visibleClouds[j];
                    if (cand.dist > closer.dist * 1.3) {
                        const dx = cand.sx - closer.sx;
                        const dy = cand.sy - closer.sy;
                        const dist2D = Math.hypot(dx, dy);
                        if (dist2D < closer.screenRadius * 0.75) {
                            isOccluded = true;
                            break;
                        }
                    }
                }
    
                if (!isOccluded) {
                    visibleClouds.push(cand);
                }
            }
    
            let centerTarget = null;
            let minCenterDist = Infinity;
            for (let i = 0; i < visibleClouds.length; i++) {
                if (visibleClouds[i].centerDist < minCenterDist) {
                    minCenterDist = visibleClouds[i].centerDist;
                    centerTarget = visibleClouds[i];
                }
            }
            if (centerTarget && centerTarget.centerDist < 0.65) {
                centerTarget.isCenterTarget = true;
            }
    
            const mode = params.cloudDebugTargetMode || 'visible';
            let toRender = [];
            if (mode === 'single') {
                toRender = centerTarget ? [centerTarget] : (visibleClouds.slice(0, 1));
            } else if (mode === 'nearest3') {
                toRender = visibleClouds.slice(0, 3);
            } else {
                toRender = visibleClouds;
            }
    
            const badgeW = 148;
            const badgeH = 32;
            for (let i = 0; i < toRender.length; i++) {
                const item = toRender[i];
                item.bx = Math.max(12, Math.min(w - badgeW - 12, item.sx - badgeW / 2));
                item.by = item.sy - 44;
                if (item.by < 75) item.by = item.sy + 22;
            }
    
            for (let pass = 0; pass < 6; pass++) {
                let collided = false;
                for (let i = 0; i < toRender.length; i++) {
                    for (let j = 0; j < toRender.length; j++) {
                        if (i === j) continue;
                        const a = toRender[i];
                        const b = toRender[j];
                        const overlapX = (badgeW + 6) - Math.abs(a.bx - b.bx);
                        const overlapY = (badgeH + 6) - Math.abs(a.by - b.by);
                        if (overlapX > 0 && overlapY > 0) {
                            collided = true;
                            const shift = overlapY * 0.5 + 2;
                            if (a.by < b.by) {
                                a.by = Math.max(75, a.by - shift);
                                b.by = Math.min(h - badgeH - 40, b.by + shift);
                            } else {
                                a.by = Math.min(h - badgeH - 40, a.by + shift);
                                b.by = Math.max(75, b.by - shift);
                            }
                        }
                    }
                }
                if (!collided) break;
            }
    
            ctx.save();
            for (let i = 0; i < toRender.length; i++) {
                const item = toRender[i];
                const isAim = !!item.isCenterTarget;
    
                ctx.save();
                ctx.strokeStyle = item.color;
                if (isAim) {
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(item.sx, item.sy, 13, 0, Math.PI * 2);
                    ctx.stroke();
    
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(item.sx - 18, item.sy); ctx.lineTo(item.sx - 13, item.sy);
                    ctx.moveTo(item.sx + 13, item.sy); ctx.lineTo(item.sx + 18, item.sy);
                    ctx.moveTo(item.sx, item.sy - 18); ctx.lineTo(item.sx, item.sy - 13);
                    ctx.moveTo(item.sx, item.sy + 13); ctx.lineTo(item.sx, item.sy + 18);
                    ctx.stroke();
    
                    ctx.fillStyle = item.color;
                    ctx.beginPath();
                    ctx.arc(item.sx, item.sy, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(item.sx, item.sy, 6, 0, Math.PI * 2);
                    ctx.stroke();
    
                    ctx.fillStyle = item.color;
                    ctx.beginPath();
                    ctx.arc(item.sx, item.sy, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
    
                ctx.strokeStyle = item.border;
                ctx.lineWidth = isAim ? 1.8 : 1.2;
                ctx.setLineDash([3, 3]);
                ctx.globalAlpha = isAim ? 0.85 : 0.60;
                ctx.beginPath();
                ctx.moveTo(item.sx, item.by > item.sy ? item.sy + 6 : item.sy - 6);
                ctx.lineTo(item.bx + badgeW / 2, item.by > item.sy ? item.by : item.by + badgeH);
                ctx.stroke();
                ctx.setLineDash([]);
    
                ctx.globalAlpha = 0.94;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
                ctx.strokeStyle = item.border;
                ctx.lineWidth = isAim ? 2.5 : 1.5;
                if (isAim) {
                    ctx.shadowColor = item.color;
                    ctx.shadowBlur = 8;
                } else {
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }
                drawDebugRoundRect(ctx, item.bx, item.by, badgeW, badgeH, 6);
                ctx.fill();
                ctx.stroke();
                ctx.shadowBlur = 0;
    
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = item.color;
                ctx.beginPath();
                ctx.arc(item.bx + 12, item.by + 11, 3.5, 0, Math.PI * 2);
                ctx.fill();
    
                ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(item.name, item.bx + 21, item.by + 14);
    
                ctx.font = '10px monospace, sans-serif';
                ctx.fillStyle = item.color;
                ctx.fillText(item.subtext, item.bx + 12, item.by + 26);
            }
    
            const legW = 250;
            const legH = 176;
            const lx = 20;
            const ly = 75;
    
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            drawDebugRoundRect(ctx, lx, ly, legW, legH, 8);
            ctx.fill();
            ctx.stroke();
    
            ctx.globalAlpha = 1.0;
            ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 3;
            ctx.fillText('CLOUD TYPE INSPECTOR', lx + 12, ly + 20);
    
            ctx.font = 'bold 10px system-ui, sans-serif';
            if (centerTarget && centerTarget.isCenterTarget) {
                ctx.fillStyle = centerTarget.color;
                ctx.fillText(`Aim: ${centerTarget.name} (${toRender.length} in view)`, lx + 12, ly + 36);
            } else {
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(`Visible Clouds in View: ${toRender.length}`, lx + 12, ly + 36);
            }
    
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.moveTo(lx + 10, ly + 43);
            ctx.lineTo(lx + legW - 10, ly + 43);
            ctx.stroke();
    
            ctx.font = '10px system-ui, -apple-system, sans-serif';
            const l1Count = instClouds && instClouds.visible ? instClouds.count : 0;
            const l2Count = instHighClouds && instHighClouds.visible ? instHighClouds.count : 0;
            const l3Count = instLowTowerClouds && instLowTowerClouds.visible ? instLowTowerClouds.count : 0;
            const l4Count = instMegaClouds && instMegaClouds.visible ? (params.cloudsGiantCount || 14) : 0;
            const l5Count = instLowBankClouds && instLowBankClouds.visible ? (params.cloudsLowBankCount || 14) : 0;
            const l6Count = instBillboardClouds && instBillboardClouds.visible ? (params.cloudsBillboardCount || 10) : 0;

            const legendItems = [
                { color: '#4ade80', text: `Layer 1: Low Clouds (Nearby) [${l1Count}]` },
                { color: '#f472b6', text: `Layer 2: Distant Towers [${l2Count}]` },
                { color: '#facc15', text: `Layer 3: Low Horizon Towers [${l3Count}]` },
                { color: '#38bdf8', text: `Layer 4: Distant Horizon Banks [${l4Count}]` },
                { color: '#fb923c', text: `Layer 5: Low Horizon Banks [${l5Count}]` },
                { color: '#c084fc', text: `Layer 6: Distant High Clouds [${l6Count}]` }
            ];
    
            legendItems.forEach((it, idx) => {
                const rowY = ly + 58 + idx * 16;
                ctx.fillStyle = it.color;
                ctx.beginPath();
                ctx.arc(lx + 16, rowY - 3, 3.5, 0, Math.PI * 2);
                ctx.fill();
    
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(it.text, lx + 26, rowY);
            });
    
            ctx.font = 'italic 9px system-ui, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText("Mode: Every Visible Cloud  •  Press 'U' to toggle", lx + 12, ly + legH - 9);
            ctx.restore();
        }

        const cloudDummy = new THREE.Object3D();
        let lastCloudPlayerX = spawnX;
        let lastCloudPlayerZ = spawnZ;

        function updateClouds(playerX, playerY, playerZ, dt, playerYaw = 0) {
            const dummy = cloudDummy;
            const safeDt = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
            const playerStepX = playerX - lastCloudPlayerX;
            const playerStepZ = playerZ - lastCloudPlayerZ;
            const playerStep = Math.hypot(playerStepX, playerStepZ);
            let playerVelocityX = safeDt > 0 && playerStep < 350 ? playerStepX / safeDt : 0;
            let playerVelocityZ = safeDt > 0 && playerStep < 350 ? playerStepZ / safeDt : 0;
            const measuredSpeed = Math.hypot(playerVelocityX, playerVelocityZ);
            if (measuredSpeed > 220) {
                const velocityScale = 220 / measuredSpeed;
                playerVelocityX *= velocityScale;
                playerVelocityZ *= velocityScale;
            }
            lastCloudPlayerX = playerX;
            lastCloudPlayerZ = playerZ;
            // Calculate player forward horizontal flight heading and direction vector
            const _fwdX = -Math.sin(playerYaw);
            const _fwdZ = -Math.cos(playerYaw);
            const _fwdAngle = Math.atan2(_fwdX, _fwdZ);

            // Clouds - Endless Forward Generation & Recycling
            // The editor count is authoritative; automatic altitude scaling must not override it.
            const targetLowCount = params.cloudsLowCount !== undefined ? params.cloudsLowCount : (LOW_GFX ? 40 : BASE_CLOUD_COUNT);
            instClouds.count = Math.max(0, Math.min(CLOUD_COUNT, Math.round(targetLowCount)));
            const cloudScale = 1.0 + Math.min(1.0, Math.max(0.0, (playerY - 300.0) / 11700.0)) * 4.0;
            const cloudDist = (params.cloudsLowDistance || 2200) * cloudScale;
            const maxCloudRange = cloudDist * 1.55;

            for (let i = 0; i < instClouds.count; i++) {
                instClouds.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                const dx = dummy.position.x - playerX;
                const dz = dummy.position.z - playerZ;
                const dist = Math.hypot(dx, dz);
                const dotFwd = dx * _fwdX + dz * _fwdZ;

                const isBehind = dotFwd < -500;
                const isOutOfRange = dist > maxCloudRange;
                const isSunken = dummy.position.y < -4000;

                if (isBehind || isOutOfRange || isSunken) {
                    const fanSpread = (Math.random() - 0.5) * (Math.PI * 0.90);
                    const spawnAngle = _fwdAngle + fanSpread;
                    const spawnDist = 250 + Math.random() * 2150;

                    const cloudSpawnY = getLowCloudTargetAltitude(
                        i,
                        playerX + Math.sin(spawnAngle) * spawnDist,
                        playerZ + Math.cos(spawnAngle) * spawnDist,
                        params.cloudsLowAltitude !== undefined ? params.cloudsLowAltitude : 150
                    );

                    dummy.position.set(
                        playerX + Math.sin(spawnAngle) * spawnDist,
                        cloudSpawnY,
                        playerZ + Math.cos(spawnAngle) * spawnDist
                    );
                    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
                    dummy.scale.set(
                        cloudBaseScale[i * 3 + 0],
                        cloudBaseScale[i * 3 + 1],
                        cloudBaseScale[i * 3 + 2]
                    ).multiplyScalar(params.cloudsLowSize);
                }
                dummy.position.y = getTerrainSafeAltitude(dummy.position.x, dummy.position.z, dummy.position.y);
                const lowDistanceScale = getLayerDrift(Math.max(1, dist)) / Math.max(1, params.cloudWindBaseSpeed || 18);
                dummy.position.x += lowCloudWindX[i] * lowDistanceScale * safeDt;
                dummy.position.z += lowCloudWindZ[i] * lowDistanceScale * safeDt;
                dummy.updateMatrix();
                instClouds.setMatrixAt(i, dummy.matrix);
            }
            instClouds.instanceMatrix.needsUpdate = true;

            // High altitude distance expansion for large clouds:
            // When flying above 300m, the visual horizon expands outward.
            // Pushing large clouds further out prevents empty sky while keeping clouds grand.
            const playerAlt = Math.max(0, playerY);
            const highAltFracLarge = Math.min(2.5, Math.max(0.0, (playerAlt - 300.0) / 900.0));
            const largeCloudDistMult = 1.0 + highAltFracLarge * 0.85;

            // Distant Ghibli Towering Cumulus Clouds
            const highAltFrac = Math.min(1, Math.max(0, (playerY - 200) / 600));
            instHighClouds.count = Math.round(BASE_HIGH_CLOUD_COUNT + (HIGH_CLOUD_COUNT - BASE_HIGH_CLOUD_COUNT) * highAltFrac);
            if (matCloud.userData && matCloud.userData.shader) {
                matCloud.userData.shader.uniforms.uCloudOpacity.value = params.cloudsLowOpacity;
            }
            if (highCloudMat.userData && highCloudMat.userData.shader) {
                highCloudMat.userData.shader.uniforms.uCloudOpacity.value = params.cloudsHighOpacity;
            }
            const highCloudDist = Math.max(3500, (params.cloudsHighDistance || 8000) * (1.0 + highAltFracLarge * 0.65));
            const targetHighCount = (params.cloudsHighCount !== undefined) ? params.cloudsHighCount : (LOW_GFX ? 0 : 14);
            setCloudCount(instHighClouds, targetHighCount);
            if (highCloudMat.userData && highCloudMat.userData.shader) {
                highCloudMat.userData.shader.uniforms.uCloudOpacity.value = params.cloudsHighOpacity;
            }

            for (let i = 0; i < targetHighCount; i++) {
                instHighClouds.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                const hdx = dummy.position.x - playerX;
                const hdz = dummy.position.z - playerZ;
                const hDist = Math.hypot(hdx, hdz);
                const hdotFwd = hdx * _fwdX + hdz * _fwdZ;

                if (hdotFwd < -2000 || hDist > highCloudDist * 1.45 || dummy.position.y < -500) {
                    highAvoidanceOffset[i * 2] = 0;
                    highAvoidanceOffset[i * 2 + 1] = 0;
                    const fanSpread = (Math.random() - 0.5) * (Math.PI * 0.90);
                    const spawnAngle = _fwdAngle + fanSpread;
                    const r = highCloudDist * (0.85 + Math.random() * 0.45);
                    const altOffset = (highAltitudeOffsets[i % highAltitudeOffsets.length] !== undefined) ? highAltitudeOffsets[i % highAltitudeOffsets.length] : 0;
                    dummy.position.set(
                        playerX + Math.sin(spawnAngle) * r,
                        params.cloudsHighAltitude + altOffset,
                        playerZ + Math.cos(spawnAngle) * r
                    );
                    const tangentAngle = spawnAngle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.6;
                    dummy.rotation.set(0, tangentAngle + (Math.random() > 0.5 ? 0 : Math.PI), 0);
                    dummy.scale.set(
                        highCloudBaseScale[i * 3 + 0],
                        highCloudBaseScale[i * 3 + 1],
                        highCloudBaseScale[i * 3 + 2]
                    ).multiplyScalar(params.cloudsHighSize);
                }
                const highDrift = getLayerDrift(Math.max(1, hDist)) * 0.55;
                dummy.position.x += Math.cos(0.30) * highDrift * safeDt;
                dummy.position.z += Math.sin(0.30) * highDrift * safeDt;
                applySoftDrift(
                    highAvoidanceOffset,
                    i,
                    dummy.position,
                    Math.min(highCloudDist * 0.42, Math.max(300, 520 * Math.max(0.5, params.cloudsHighSize || 1))),
                    playerX, playerY, playerZ,
                    playerVelocityX, playerVelocityZ,
                    safeDt
                );
                dummy.updateMatrix();
                instHighClouds.setMatrixAt(i, dummy.matrix);
            }
            instHighClouds.instanceMatrix.needsUpdate = true;

            // Low Horizon Towers
            const targetLowTowerCount = (params.cloudsLowTowerCount !== undefined) ? params.cloudsLowTowerCount : (LOW_GFX ? 0 : 12);
            setCloudCount(instLowTowerClouds, targetLowTowerCount);
            if (lowTowerCloudMat.userData && lowTowerCloudMat.userData.shader) {
                lowTowerCloudMat.userData.shader.uniforms.uCloudOpacity.value = params.cloudsLowTowerOpacity;
            }
            const lowTowerCloudDist = Math.max(3200, (params.cloudsLowTowerDistance || 3200) * (1.0 + highAltFracLarge * 0.50));

            for (let i = 0; i < targetLowTowerCount; i++) {
                instLowTowerClouds.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                const tdx = dummy.position.x - playerX;
                const tdz = dummy.position.z - playerZ;
                const hDist = Math.hypot(tdx, tdz);
                const tdotFwd = tdx * _fwdX + tdz * _fwdZ;

                if (tdotFwd < -1800 || hDist > lowTowerCloudDist * 1.45 || dummy.position.y < -500) {
                    lowTowerAvoidanceOffset[i * 2] = 0;
                    lowTowerAvoidanceOffset[i * 2 + 1] = 0;
                    const spawnFan = (Math.random() - 0.5) * (Math.PI * 0.90);
                    const spawnAngle = _fwdAngle + spawnFan;
                    const r = lowTowerCloudDist * (0.85 + Math.random() * 0.40);
                    const sX = playerX + Math.sin(spawnAngle) * r;
                    const sZ = playerZ + Math.cos(spawnAngle) * r;

                    const baseLowTowerAlt = params.cloudsLowTowerAltitude !== undefined ? params.cloudsLowTowerAltitude : -35;
                    const altOffset = (lowTowerAltitudeOffsets[i % lowTowerAltitudeOffsets.length] || 0) * 0.5;
                    const sY = Math.max(-40, Math.min(-10, baseLowTowerAlt + altOffset));

                    dummy.position.set(sX, sY, sZ);
                    const tangentAngle = spawnAngle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.8;
                    dummy.rotation.set(0, tangentAngle + (Math.random() > 0.5 ? 0 : Math.PI), 0);
                    dummy.scale.set(
                        lowTowerCloudBaseScale[i * 3 + 0],
                        lowTowerCloudBaseScale[i * 3 + 1],
                        lowTowerCloudBaseScale[i * 3 + 2]
                    ).multiplyScalar(params.cloudsLowTowerSize);
                }
                const towerDrift = getLayerDrift(Math.max(1, hDist)) * 0.45;
                dummy.position.x += Math.cos(0.42) * towerDrift * safeDt;
                dummy.position.z += Math.sin(0.42) * towerDrift * safeDt;
                applySoftDrift(
                    lowTowerAvoidanceOffset,
                    i,
                    dummy.position,
                    Math.min(lowTowerCloudDist * 0.42, Math.max(280, 440 * Math.max(0.5, params.cloudsLowTowerSize || 1))),
                    playerX, playerY, playerZ,
                    playerVelocityX, playerVelocityZ,
                    safeDt
                );
                dummy.updateMatrix();
                instLowTowerClouds.setMatrixAt(i, dummy.matrix);
            }
            instLowTowerClouds.instanceMatrix.needsUpdate = true;

            // See-Through Wispy Clouds
            const wispyDist = ((params.cloudsLowDistance || 2200) * 1.16) * cloudScale;
            const wispyTeleport = wispyDist * 1.15;
            for (let i = 0; i < WISPY_CLOUD_COUNT; i++) {
                instWispyClouds.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                const wdx = dummy.position.x - playerX;
                const wdz = dummy.position.z - playerZ;
                const wdotFwd = wdx * _fwdX + wdz * _fwdZ;
                if (wdotFwd < -800 || (wdx * wdx + wdz * wdz > wispyTeleport * wispyTeleport) || dummy.position.y < -4000) {
                    const fan = (Math.random() - 0.5) * (Math.PI * 0.85);
                    const spawnAngle = _fwdAngle + fan;
                    const r = wispyDist * (0.75 + Math.random() * 0.45);
                    dummy.position.set(
                        playerX + Math.sin(spawnAngle) * r,
                        (params.cloudsLowAltitude - 40) + Math.random() * 120,
                        playerZ + Math.cos(spawnAngle) * r
                    );
                    dummy.rotation.set(0, Math.random() * Math.PI, 0);
                    dummy.scale.set(2.0 + Math.random() * 1.5, 0.4 + Math.random() * 0.4, 1.8 + Math.random() * 1.5);
                }
                const wispyDistance = Math.hypot(wdx, wdz);
                const wispyDrift = getLayerDrift(Math.max(1, wispyDistance)) * 0.52;
                dummy.position.x += Math.cos(0.24) * wispyDrift * safeDt;
                dummy.position.z += Math.sin(0.24) * wispyDrift * safeDt;
                dummy.updateMatrix();
                instWispyClouds.setMatrixAt(i, dummy.matrix);
            }
            instWispyClouds.instanceMatrix.needsUpdate = true;

            // 3. Distant Ghibli Horizon Cloud Banks
            if (megaCloudMat.userData && megaCloudMat.userData.shader) {
                megaCloudMat.userData.shader.uniforms.uCloudOpacity.value = params.cloudsGiantOpacity;
            }
            instMegaClouds.position.set(playerX, 0, playerZ);
            instMegaClouds.scale.set(largeCloudDistMult, 1.0 + highAltFracLarge * 0.25, largeCloudDistMult);
            instMegaClouds.rotation.y += 0.0008 * safeDt;
            updateDistantCloudGroup(
                megaMeshes, instMegaClouds, megaAvoidanceOffset,
                playerY, playerVelocityX, playerVelocityZ, safeDt,
                params.cloudsGiantDistance, 0.35, 0.36
            );

            // 3b. Low Horizon Banks
            if (lowBankCloudMat.userData && lowBankCloudMat.userData.shader) {
                lowBankCloudMat.userData.shader.uniforms.uCloudOpacity.value = params.cloudsLowBankOpacity;
            }
            instLowBankClouds.position.set(playerX, 0, playerZ);
            instLowBankClouds.scale.set(largeCloudDistMult, 1.0 + highAltFracLarge * 0.20, largeCloudDistMult);
            instLowBankClouds.rotation.y += 0.0006 * safeDt;
            updateDistantCloudGroup(
                lowBankMeshes, instLowBankClouds, lowBankAvoidanceOffset,
                playerY, playerVelocityX, playerVelocityZ, safeDt,
                params.cloudsLowBankDistance, 0.40, 0.43
            );

            // 3c. Distant High Clouds
            if (typeof instBillboardClouds !== 'undefined') {
                if (cirroCloudMat.userData && cirroCloudMat.userData.shader) {
                    cirroCloudMat.userData.shader.uniforms.uCloudOpacity.value = params.cloudsBillboardOpacity !== undefined ? params.cloudsBillboardOpacity : 1.0;
                }
                instBillboardClouds.position.set(playerX, 0, playerZ);
                instBillboardClouds.scale.set(largeCloudDistMult, 1.0 + highAltFracLarge * 0.15, largeCloudDistMult);
                instBillboardClouds.rotation.y += 0.0005 * safeDt;
                updateDistantCloudGroup(
                    cirroMeshes, instBillboardClouds, cirroAvoidanceOffset,
                    playerY, playerVelocityX, playerVelocityZ, safeDt,
                    params.cloudsBillboardDistance, 0.25, 0.28
                );
            }

            // Dynamic atmospheric haze distances so distant expanded clouds don't dissolve
            const dynamicFarHaze = (params.cloudsFarHaze || 14000) * Math.max(1.0, largeCloudDistMult * 0.90);
            const dynamicNearSolid = (params.cloudsNearSolid || 2000) * Math.max(1.0, largeCloudDistMult * 0.75);
            [highCloudMat, lowTowerCloudMat, megaCloudMat, lowBankCloudMat, cirroCloudMat].forEach(mat => {
                if (mat && mat.userData && mat.userData.shader && mat.userData.shader.uniforms) {
                    if (mat.userData.shader.uniforms.uFarHaze) mat.userData.shader.uniforms.uFarHaze.value = dynamicFarHaze;
                    if (mat.userData.shader.uniforms.uNearSolid) mat.userData.shader.uniforms.uNearSolid.value = dynamicNearSolid;
                }
            });
        }

    return {
        instClouds,
        instHighClouds,
        instMegaClouds,
        instLowTowerClouds,
        instLowBankClouds,
        instBillboardClouds,
        instWispyClouds,
        highMeshes,
        megaMeshes,
        lowTowerMeshes,
        lowBankMeshes,
        cirroMeshes,
        highCloudMat,
        megaCloudMat,
        lowTowerCloudMat,
        cirroCloudMat,
        lowBankCloudMat,
        lowBankCloudBaseScale,
        MEGA_CLOUD_COUNT,
        MEGA_VARIANTS,
        cloudAltitudeOffsets,
        highAltitudeOffsets,
        lowTowerAltitudeOffsets,
        redistributeLowClouds,
        updateLowCloudAltitude,
        setCloudSize,
        setCloudCount,
        setMaterialOpacity,
        setCloudDebugMode,
        updateCloudDebugTints,
        renderCloudDebugOverlays,
        updateClouds
    };
}
