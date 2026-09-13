import * as THREE from "three";
import { GRAPHICS, type GraphicsQuality } from "./RenderBudget";
import { Reflector } from "three/addons/objects/Reflector.js";

const noise = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise2(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p) { float n=0., a=.5; for(int i=0;i<5;i++){n+=noise2(p)*a; p=p*2.03+7.1;a*=.5;} return n; }
`;

export function nightSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      varying vec3 direction; ${noise}
      void main(){
        vec3 d=normalize(direction); float h=max(d.y,0.);
        vec3 col=mix(vec3(.085,.14,.21),vec3(.009,.023,.057),pow(h,.45));
        vec2 p=d.xz/max(.12,d.y+.15)*1.7;
        float cloud=smoothstep(.4,.7,fbm(p));
        vec3 moonDir=normalize(vec3(.45,.38,-.8)); float moon=dot(d,moonDir);
        float halo=pow(max(moon,0.),36.);
        col+=vec3(.17,.22,.28)*halo;
        col=mix(col,vec3(.09,.13,.19)+halo*.25,cloud*.8);
        if(moon>.99925){
          vec3 right=normalize(vec3(.8,0.,.45));
          vec2 moonUv=vec2(dot(d,right),dot(d,cross(moonDir,right)))*140.;
          float craters=.52+.48*fbm(moonUv);
          col+=vec3(2.5,2.7,3.1)*craters*smoothstep(.99925,.9997,moon)*(1.-cloud*.8);
        }
        gl_FragColor=vec4(col*.38,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), mat);
  sky.position.set(26, 0, 17);
  sky.renderOrder = -10;
  return sky;
}

/** One planar reflection capture is shared by the canal and shallow path puddles. */
export class RainSurfaces {
  readonly water: Reflector;
  readonly puddleMaterial: THREE.ShaderMaterial;
  readonly puddles = new THREE.Group();
  readonly rain: THREE.LineSegments;
  private reflectionInterval = 1 / 30;
  private lastReflection = -Infinity;
  private time = 0;
  private inverseWater = new THREE.Matrix4();
  constructor(scene: THREE.Scene, hands: THREE.Object3D) {
    this.water = new Reflector(new THREE.PlaneGeometry(220, 220), {
      textureWidth: 512,
      textureHeight: 512,
      multisample: 0,
      clipBias: 0.003,
      shader: {
        name: "CanalReflection",
        uniforms: {
          color: { value: new THREE.Color(0x214b50) },
          tDiffuse: { value: null },
          textureMatrix: { value: new THREE.Matrix4() },
          time: { value: 0 },
        },
        vertexShader: /* glsl */ `uniform mat4 textureMatrix; varying vec4 reflected; varying vec3 world; void main(){reflected=textureMatrix*vec4(position,1.); world=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse; uniform float time; varying vec4 reflected; varying vec3 world;
          void main(){
            vec2 wave=vec2(sin(world.z*4.2+time*1.5)+sin(world.x*6.3-time),cos(world.x*5.1+time*.8))*.0017;
            vec3 mirror=texture2D(tDiffuse,reflected.xy/reflected.w+wave).rgb;
            float angle=1.-abs(normalize(cameraPosition-world).y);
            vec3 water=mix(vec3(.012,.037,.045),mirror,.38+pow(angle,3.)*.5);
            gl_FragColor=vec4(water,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      },
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(25, -0.14, 17);
    this.water.renderOrder = -2;
    this.water.updateMatrixWorld();
    this.inverseWater.copy(this.water.matrixWorld).invert();
    const waterMaterial = this.water.material as THREE.ShaderMaterial;
    this.puddleMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      uniforms: {
        tDiffuse: { value: this.water.getRenderTarget().texture },
        textureMatrix: waterMaterial.uniforms.textureMatrix,
        waterInverse: { value: this.inverseWater },
        time: waterMaterial.uniforms.time,
      },
      vertexShader: /* glsl */ `uniform mat4 textureMatrix; uniform mat4 waterInverse; varying vec4 reflected; varying vec3 world; void main(){vec4 w=modelMatrix*vec4(position,1.); world=w.xyz; reflected=textureMatrix*waterInverse*w; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float time; varying vec4 reflected; varying vec3 world; ${noise}
        void main(){
          float wet=smoothstep(.49,.65,fbm(world.xz*2.3));
          vec2 ripple=vec2(sin(world.z*53.+time*3.),cos(world.x*41.-time*2.))*.0006;
          vec3 reflection=texture2D(tDiffuse,reflected.xy/reflected.w+ripple).rgb;
          float fresnel=pow(1.-abs(normalize(cameraPosition-world).y),2.);
          gl_FragColor=vec4(reflection,wet*(.2+fresnel*.52));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const reflect = this.water.onBeforeRender.bind(this.water);
    this.water.onBeforeRender = (...args) => {
      if (
        this.time >= this.lastReflection &&
        this.time - this.lastReflection < this.reflectionInterval - 0.001
      )
        return;
      this.lastReflection = this.time;
      const handsVisible = hands.visible;
      this.puddles.visible = false;
      hands.visible = false;
      this.rain.visible = false;
      try {
        reflect(...args);
      } finally {
        this.puddles.visible = true;
        hands.visible = handsVisible;
        this.rain.visible = true;
      }
    };
    const positions: number[] = [];
    for (let i = 0; i < 1300; i++) {
      const x = ((i * 17.31) % 76) - 10,
        y = (i * 3.79) % 20,
        z = ((i * 9.17) % 60) - 12;
      positions.push(x, y, z, x - 0.025, y + 0.3, z + 0.01);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x9ab8cc,
        transparent: true,
        opacity: 0.19,
        depthWrite: false,
      }),
    );
    scene.add(this.water, this.puddles, this.rain);
  }
  addPuddles(geometry: THREE.BufferGeometry) {
    const puddle = new THREE.Mesh(geometry.clone(), this.puddleMaterial);
    puddle.position.y = 0.012;
    this.puddles.add(puddle);
  }
  setQuality(quality: GraphicsQuality) {
    const budget = GRAPHICS[quality];
    this.water.getRenderTarget().setSize(budget.reflection, budget.reflection);
    this.reflectionInterval = 1 / budget.reflectionHz;
    this.lastReflection = -Infinity;
  }
  invalidateReflection() {
    this.lastReflection = -Infinity;
  }
  update(time: number) {
    this.time = time;
    (this.water.material as THREE.ShaderMaterial).uniforms.time.value = time;
    this.rain.position.y = -((time * 6) % 10);
  }
  dispose() {
    this.water.dispose();
  }
}

/** A translucent, moving flame rather than an opaque blue pickup cone. */
export function spiritFlameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float time; varying vec2 flameUv; varying vec3 normalView; varying vec3 viewDir;
      void main(){
        flameUv=uv; vec3 p=position;
        float height=max(0.,position.y+.23);
        p.x+=sin(height*9.+time*4.2)*height*.1;
        p.z+=cos(height*12.-time*3.7)*height*.08;
        vec4 view=modelViewMatrix*vec4(p,1.); normalView=normalize(normalMatrix*normal); viewDir=normalize(-view.xyz);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time; varying vec2 flameUv; varying vec3 normalView; varying vec3 viewDir;
      ${noise}
      void main(){
        float veins=fbm(vec2(flameUv.x*9.,flameUv.y*5.-time*1.8));
        float edge=pow(abs(dot(normalize(normalView),normalize(viewDir))),1.3);
        float alpha=(.22+edge*.48)*smoothstep(.16,.6,veins)*(1.-smoothstep(.8,1.,flameUv.y));
        vec3 col=mix(vec3(.015,.18,.8),vec3(.45,.85,1.),edge*veins);
        gl_FragColor=vec4(col*1.6,alpha);
      }`,
  });
}
