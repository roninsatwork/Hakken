import * as THREE from "three";
import { surfaceDetail } from "./SurfaceDetail";
import { lanternPaper, nightEnvironment } from "./ArtLighting";
import { prepareGeometry } from "./PrepareGeometry";
import { groundContactMap, groundOcclusionUV, stoneRoughness, wovenStraw } from "./BakedSurfaces";
import { poseHands, posePatrol } from "./CharacterAnimation";
import { PatrolAppearance } from "./PatrolAppearance";
import { PickupLighting } from "./PickupLighting";
import { applySurface, loadCharacterMaterials, loadDistantTrees, loadFoliageMaterials, loadWorldMaterials } from "./WorldMaterials";
import { gate } from "./Architecture";
import {
  firstPersonHands,
  patrolModel,
  type PatrolModel,
} from "./CharacterAssets";
import { courtyardArt } from "./CourtyardArt";
import { districtArt } from "./DistrictArt";
import { LanternLighting } from "./LanternLighting";
import {
  FrameTiming,
  renderPixelRatio,
  type GraphicsQuality,
} from "./RenderBudget";
import { nightSky, RainSurfaces, spiritFlameMaterial } from "./NightAtmosphere";
import { batchScenery } from "./MeshBatch";
import type { LevelDefinition } from "../../ronins-run/engine/Levels";
import { type Point, type Polygon } from "../../ronins-run/engine/MapData";
import type { NightHeistSimulation } from "../../ronins-run/engine/NightHeistSimulation";
import { EYE_HEIGHT, toWorld, WORLD_SCALE } from "./WorldLayout";
import { ART, box, cylinder, globe, material, pavement } from "./SceneAssets";

function groundGeometry(polygon: Polygon) {
  const points = polygon.map(
    ([x, y]) => new THREE.Vector2(x * WORLD_SCALE, y * WORLD_SCALE),
  );
  const faces = THREE.ShapeUtils.triangulateShape(points, []);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p.x, 0, p.y]),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p.x / 1.35, p.y / 1.35]),
      2,
    ),
  );
  geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(points.flatMap((p) => groundOcclusionUV(p.x, p.y)), 2));
  geometry.setIndex(faces.flatMap(([a, b, c]) => [c, b, a]));
  geometry.computeVertexNormals();
  return geometry;
}

export class HeistScene {
  readonly scene = new THREE.Scene();
  private pickupLighting = new PickupLighting(this.scene);
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.06, 180);
  readonly renderer: THREE.WebGLRenderer;
  private staticWorld = new THREE.Group();
  private mats = {
    stone: material(ART.stone),
    wood: material(ART.wood),
    roof: material(ART.roof),
    plaster: material(ART.plaster),
    red: material(ART.red),
    gold: material(ART.gold),
    cloth: material(ART.cloth),
    skin: material(ART.skin),
    wrap: material(0x9d372d),
    straw: material(0x89764b),
    lit: material(0xda7d32, 0xff9c47, 1.05),
    paper: material(0xffddb0, 0xffbe77, 0.85),
    window: material(0x805025, ART.amber, 0.28),
    jade: material(ART.jade, ART.jade, 0.4),
    spirit: material(ART.spirit, ART.spirit, 0.5),
    leaf: material(ART.leaf),
    distantTree: material(0xa0aaa1),
    foliage: material(0xffffff),
    fern: material(0xffffff),
    maple: material(0x812b21),
    autumn: material(0xad4925),
    copperLeaf: material(0x603c22),
    moss: material(0x49623b),
    earth: material(0x282b24),
    fruit: material(0xa6582a),
    ceramic: new THREE.MeshPhysicalMaterial({
      color: 0x46535a,
      roughness: 0.27,
      metalness: 0.16,
      clearcoat: 0.6,
    }),
    leather: new THREE.MeshPhysicalMaterial({
      color: 0x171e25,
      roughness: 0.78,
      clearcoat: 0.035,
    }),
  };
  private patrols: PatrolModel[] = [];
  private patrolAppearance: PatrolAppearance;
  private sealModels: THREE.Group[] = [];
  private spirit = new THREE.Group();
  private treasure = new THREE.Group();
  private exit = new THREE.Group();
  private decoy: PatrolModel;
  private hands = new THREE.Group();
  private surfaces: RainSurfaces;
  private flameMaterial = spiritFlameMaterial();
  private light: THREE.PointLight;
  private lanterns: LanternLighting;
  private quality: GraphicsQuality = "balanced";
  private width = 1;
  private height = 1;
  private timing = new FrameTiming();
  private lastDiagnostics = 0;
  private textures: THREE.Texture[] = [];
  private environment: THREE.WebGLRenderTarget;
  private disposed = false;
  private renderingReady = false;
  private renderFrames = 0;
  private maxRenderMs = 0;
  private lastPlaying = false;
  readonly materialsReady: Promise<void>;

  constructor(
    canvas: HTMLCanvasElement,
    readonly level: LevelDefinition,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "default",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(ART.night);
    this.environment = nightEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.52;
    const paper = lanternPaper();
    this.textures.push(paper);
    this.mats.paper.map = this.mats.paper.emissiveMap = paper;
    const straw = wovenStraw();
    this.textures.push(straw);
    this.mats.straw.map = this.mats.straw.bumpMap = straw;
    this.mats.straw.color.set(0xc8bc99);
    this.mats.straw.bumpScale = 0.002;
    for (const name of [
      "roof",
      "wood",
      "cloth",
      "wrap",
      "leaf",
      "foliage",
      "fern",
      "maple",
      "autumn",
      "copperLeaf",
      "moss",
    ] as const)
      this.mats[name].side = THREE.DoubleSide;
    const clothDetail = surfaceDetail("cloth"),
      leatherDetail = surfaceDetail("leather");
    this.textures.push(clothDetail, leatherDetail);
    this.mats.cloth.bumpMap = clothDetail;
    this.mats.cloth.bumpScale = 0.0015;
    this.mats.leather.bumpMap = leatherDetail;
    this.mats.leather.bumpScale = 0.00015;
    this.mats.leather.roughness = 0.64;
    this.mats.skin.roughness = 0.68;
    this.mats.red.bumpMap = clothDetail;
    this.mats.red.bumpScale = 0.01;
    this.mats.gold.metalness = 0.72;
    this.mats.gold.roughness = 0.43;
    this.mats.jade.toneMapped = false;
    this.mats.spirit.toneMapped = false;
    this.mats.lit.toneMapped = false;
    this.scene.fog = new THREE.FogExp2(ART.night, 0.015);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera, this.staticWorld);
    this.scene.add(new THREE.HemisphereLight(0xb4ceee, 0x393b3a, 1.05));
    const moon = new THREE.DirectionalLight(0xc0d4ed, 1.45);
    moon.position.set(-15, 35, -12);
    moon.target.position.set(25, 0, 17);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, {
      left: -42,
      right: 42,
      top: 42,
      bottom: -42,
      near: 1,
      far: 100,
    });
    moon.shadow.bias = -0.001;
    this.scene.add(moon, moon.target);
    this.scene.add(nightSky());
    this.surfaces = new RainSurfaces(this.scene, this.hands);
    const texture = pavement();
    this.textures.push(texture);
    const paving = new THREE.MeshPhysicalMaterial({
      color: 0xb8c5cc,
      map: texture,
      roughness: 0.36,
      clearcoat: 0.5,
      clearcoatRoughness: 0.21,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    level.walkable.forEach((polygon) => {
      const mesh = new THREE.Mesh(groundGeometry(polygon), paving);
      mesh.receiveShadow = true;
      this.staticWorld.add(mesh);
      this.surfaces.addPuddles(mesh.geometry);
    });
    this.buildEnvironment();
    this.lanterns = new LanternLighting(this.scene);
    level.seals.forEach((p) => {
      const g = this.objective(p, this.mats.jade);
      this.sealModels.push(g);
    });
    this.spirit = this.objective(level.spirit, this.mats.spirit);
    const flame = this.spirit.children[1] as THREE.Mesh;
    flame.geometry.dispose();
    flame.geometry = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -0.25),
        new THREE.Vector2(0.16, -0.15),
        new THREE.Vector2(0.19, 0),
        new THREE.Vector2(0.08, 0.2),
        new THREE.Vector2(0.06, 0.36),
        new THREE.Vector2(0, 0.59),
      ],
      24,
    );
    flame.material = this.flameMaterial;
    flame.scale.setScalar(0.68);
    this.spirit.children[2].visible = false;
    // A stone lantern houses the flame; its position and pickup radius are unchanged.
    box(this.spirit, this.mats.stone, 0, 0.12, 0, 0.76, 0.24, 0.76);
    box(this.spirit, this.mats.stone, 0, 0.7, 0, 0.74, 0.12, 0.74);
    for (const x of [-0.3, 0.3])
      for (const z of [-0.3, 0.3])
        box(this.spirit, this.mats.stone, x, 1.05, z, 0.1, 0.62, 0.1);
    box(this.spirit, this.mats.stone, 0, 1.42, 0, 0.84, 0.13, 0.84);
    const canopy = cylinder(
      this.spirit,
      this.mats.roof,
      0,
      1.58,
      0,
      0.16,
      0.64,
      0.23,
      4,
    );
    canopy.rotation.y = Math.PI / 4;
    globe(this.spirit, this.mats.stone, 0, 1.8, 0, 0.09);
    const tp = toWorld(level.treasure);
    this.treasure.position.set(tp.x, 0, tp.z);
    box(this.treasure, this.mats.wood, 0, 0.3, 0, 0.68, 0.54, 0.47);
    for (const x of [-0.25, 0.25])
      box(this.treasure, this.mats.gold, x, 0.32, 0, 0.07, 0.58, 0.5);
    box(this.treasure, this.mats.lit, 0, 0.4, -0.25, 0.12, 0.16, 0.05);
    this.scene.add(this.treasure);
    const ep = toWorld(level.exit);
    this.exit.position.set(ep.x, 0, ep.z);
    this.exit.add(gate(2.5, this.mats));
    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.5),
      new THREE.MeshBasicMaterial({
        color: ART.jade,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    portal.position.y = 1.3;
    this.exit.add(portal);
    this.scene.add(this.exit);
    this.patrolAppearance = new PatrolAppearance(this.mats);
    this.patrols = level.patrols.map((p) => {
      const model = patrolModel(p.kind, this.patrolAppearance.materials);
      model.group.traverse((o) => {
        o.castShadow = false;
      });
      const contact = new THREE.Mesh(
        new THREE.CircleGeometry(p.kind === "hound" ? 0.4 : 0.3, 24),
        new THREE.MeshBasicMaterial({
          color: 0x090e16,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      );
      contact.rotation.x = -Math.PI / 2;
      contact.position.y = 0.018;
      contact.scale.y = p.kind === "hound" ? 1.7 : 1.2;
      model.group.add(contact);
      const aura = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.03, 6, 28),
        this.mats.spirit,
      );
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.06;
      aura.name = "spirit-target";
      aura.visible = false;
      model.group.add(aura);
      this.scene.add(model.group);
      return model;
    });
    const ghostMat = new THREE.MeshBasicMaterial({
      color: ART.red,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.decoy = patrolModel(
      "guard",
      Object.fromEntries(Object.keys(this.mats).map((k) => [k, ghostMat])),
    );
    this.decoy.group.traverse((o) => {
      o.castShadow = false;
    });
    this.scene.add(this.decoy.group);
    this.makeHands();
    this.hands.traverse((o) => {
      o.castShadow = false;
    });
    this.camera.add(this.hands);
    this.light = new THREE.PointLight(0xffc38a, 3.8, 8, 2);
    this.light.position.set(0, 1, 0);
    this.scene.add(this.light);
    const contact = groundContactMap(this.staticWorld);
    this.textures.push(contact);
    paving.aoMap = contact;
    paving.aoMapIntensity = 1;
    batchScenery(this.staticWorld);
    this.materialsReady = loadWorldMaterials().then(async (maps) => {
      if (this.disposed) {
        Object.values(maps).forEach((t) => t.dispose());
        return;
      }
      this.textures.push(...Object.values(maps));
      applySurface(paving, maps.stone, 0xa5afae, 0.022);
      const roughness = stoneRoughness(maps.stone);
      this.textures.push(roughness);
      paving.roughnessMap = roughness;
      paving.roughness = 1;
      applySurface(this.mats.stone, maps.stone, 0x89939c, 0.06);
      applySurface(this.mats.wood, maps.wood, 0xa99a85, 0.012);
      applySurface(this.mats.red, maps.wood, 0xae6654, 0.025);
      applySurface(this.mats.plaster, maps.plaster, 0xb1aaa0, 0.012);
      applySurface(this.mats.roof, maps.roof, 0x9faebc, 0.06);
      const character = await loadCharacterMaterials();
      this.textures.push(...Object.values(character));
      if (this.disposed) return;
      this.mats.leather.map = character.leather;
      this.mats.leather.color.set(0x666f7d);
      character.leather.repeat.set(2, 2);
      this.mats.cloth.map = character.cloth;
      this.mats.cloth.color.set(0x7a8b9d);
      character.cloth.repeat.set(2, 3);
      this.mats.gold.map = character.gold;
      this.mats.gold.color.set(0xe0c39a);
      this.mats.wrap.map = character.wrap;
      this.mats.wrap.color.set(0xad9288);
      character.wrap.repeat.set(2, 3);
      this.mats.wrap.bumpMap = clothDetail;
      this.mats.wrap.bumpScale = 0.001;
      const foliage = await loadFoliageMaterials();
      this.textures.push(...Object.values(foliage));
      if (this.disposed) return;
      for (const key of ["maple", "autumn", "foliage", "fern", "copperLeaf"] as const) {
        const mat = this.mats[key];
        mat.map = foliage[key === "copperLeaf" ? "autumn" : key];
        mat.color.set(key === "copperLeaf" ? 0xa6a090 : 0xc5c8b7);
        mat.alphaTest = 0.42;
        mat.alphaToCoverage = true;
        mat.roughness = 0.83;
      }
      const trees = await loadDistantTrees();
      this.textures.push(trees);
      if (this.disposed) return;
      Object.assign(this.mats.distantTree, {
        map: trees, side: THREE.DoubleSide, alphaTest: 0.42,
        alphaToCoverage: true, roughness: 1,
      });
      this.mats.distantTree.needsUpdate = true;
      this.patrolAppearance.prepare();
      // Compile even currently hidden materials (Spirit rings, decoy and exit)
      // for both render targets before allowing a live run to start.
      const previousTarget = this.renderer.getRenderTarget();
      const reflection = this.surfaces.water.getRenderTarget();
      this.renderer.setRenderTarget(reflection);
      const reflectionReady = this.renderer.compileAsync(
        this.scene,
        this.camera,
      );
      this.renderer.setRenderTarget(previousTarget);
      await reflectionReady;
      if (this.disposed) return;
      await this.renderer.compileAsync(this.scene, this.camera);
      if (!this.disposed) {
        prepareGeometry(this.renderer, this.scene, this.camera, new Set([this.surfaces.water]));
        this.surfaces.invalidateReflection();
        this.renderingReady = true;
      }
    });
  }

  private objective(point: Point, mat: THREE.Material) {
    const g = new THREE.Group(),
      p = toWorld(point);
    g.position.set(p.x, 0, p.z);
    cylinder(g, this.mats.stone, 0, 0.22, 0, 0.27, 0.33, 0.44, 6);
    const collectible: THREE.Mesh = globe(g, mat, 0, 1.03, 0, 0.23);
    if (mat === this.mats.jade) {
      collectible.geometry.dispose();
      collectible.geometry = new THREE.OctahedronGeometry(0.27);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.027, 6, 28),
      mat,
    );
    ring.position.y = 1.03;
    g.add(ring);
    this.pickupLighting.attach(
      g,
      mat === this.mats.jade ? ART.jade : ART.spirit,
    );
    this.scene.add(g);
    return g;
  }
  private makeHands() {
    this.hands.add(firstPersonHands(this.mats));
  }
  private buildEnvironment() {
    if (this.level.id === "courtyard") {
      courtyardArt(this.level, this.mats, this.staticWorld, this.scene);
      return;
    }
    districtArt(this.level, this.mats, this.staticWorld, this.scene);
  }

  resize(width: number, height: number) {
    this.surfaces.invalidateReflection();
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(
      renderPixelRatio(this.quality, width, height, window.devicePixelRatio),
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  setQuality(quality: GraphicsQuality) {
    this.quality = quality;
    this.surfaces.setQuality(quality);
    this.resize(this.width, this.height);
    this.timing.reset();
  }
  render(
    game: NightHeistSimulation,
    yaw: number,
    pitch: number,
    reducedMotion: boolean,
  ) {
    if (!this.renderingReady || this.disposed) return;
    const started = performance.now();
    const p = toWorld(game.player.pos),
      stride = game.player.stride / 8;
    const bob =
      !reducedMotion && game.player.moving ? Math.sin(stride) * 0.027 : 0;
    this.camera.position.set(p.x, EYE_HEIGHT + bob, p.z);
    this.camera.rotation.set(pitch, yaw, 0, "YXZ");
    this.hands.position.y = bob * 1.4;
    const handPair = this.hands.children[0];
    if (handPair instanceof THREE.Group)
      poseHands(handPair, stride, game.player.moving, reducedMotion, game.dashTime);
    this.hands.rotation.z = reducedMotion
      ? 0
      : Math.sin(stride / 2) * (game.player.moving ? 0.035 : 0);
    this.light.position.set(p.x - Math.sin(yaw) * 1.3, 1.65, p.z - Math.cos(yaw) * 1.3);
    this.lanterns.update(this.light.position);
    this.light.color.set(game.spiritTime > 0 ? ART.spirit : 0xffc38a);
    this.light.intensity = game.spiritTime > 0 ? 14 : 3.2;
    this.sealModels.forEach((g, i) => {
      this.pickupLighting.show(g, !game.seals.has(i));
      g.children[1].position.y = 1.03 + Math.sin(game.elapsed * 2 + i) * 0.09;
      g.children[2].rotation.y = game.elapsed;
    });
    this.flameMaterial.uniforms.time.value = game.elapsed;
    this.pickupLighting.show(this.spirit, !game.spiritCollected);
    this.spirit.children[1].rotation.y = game.elapsed;
    this.treasure.visible = !game.treasure;
    this.exit.children[this.exit.children.length - 1].visible =
      game.seals.size === 3;
    this.patrolAppearance.update(game.spiritTime > 0);
    game.enemies.forEach((e, i) => {
      const model = this.patrols[i],
        at = toWorld(e.pos);
      model.group.position.set(at.x, e.mode === "disabled" ? 0.2 : e.kind === "guard" ? -0.095 : 0, at.z);
      model.group.rotation.set(
        0,
        Math.atan2(-e.facing.x, -e.facing.y),
        e.mode === "disabled" ? Math.PI / 2 : 0,
      );
      model.group.getObjectByName("spirit-target")!.visible =
        game.spiritTime > 0 && e.mode !== "disabled";
      posePatrol(model, e.kind, e.stride, e.moving && e.mode !== "disabled");
    });
    this.decoy.group.visible =
      !!game.decoy &&
      Math.hypot(
        game.decoy.pos.x - game.player.pos.x,
        game.decoy.pos.y - game.player.pos.y,
      ) > 32;
    if (game.decoy) {
      const d = toWorld(game.decoy.pos);
      this.decoy.group.position.set(d.x, 0, d.z);
    }
    this.surfaces.update(game.elapsed);
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    if (process.env.NODE_ENV !== "production") {
      // Read-only local diagnostics: separate live work from loading and paused frames.
      const playing = game.status === "playing";
      if (playing && !this.lastPlaying) {
        this.maxRenderMs = 0;
        this.timing.reset();
      }
      if (playing) this.timing.record(started);
      if (playing)
        this.maxRenderMs = Math.max(
          this.maxRenderMs,
          performance.now() - started,
        );
      this.lastPlaying = playing;
      const data = this.renderer.domElement.dataset;
      data.renderFrames = String(++this.renderFrames);
      data.shaderPrograms = String(this.renderer.info.programs?.length ?? 0);
      data.maxLiveRenderMs = this.maxRenderMs.toFixed(1);
      if (started - this.lastDiagnostics > 1000 || !playing) {
        const timing = this.timing.snapshot();
        data.fps = timing.fps.toFixed(1);
        data.frameP95Ms = timing.p95.toFixed(1);
        data.worstFrameMs = timing.worst.toFixed(1);
        data.frameSamples = String(timing.samples);
        data.drawCalls = String(this.renderer.info.render.calls);
        data.triangles = String(this.renderer.info.render.triangles);
        data.geometries = String(this.renderer.info.memory.geometries);
        data.textures = String(this.renderer.info.memory.textures);
        data.quality = this.quality;
        this.lastDiagnostics = started;
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // compileAsync polls material programs. Retain resources until it settles.
    void this.materialsReady.catch(() => {}).then(() => this.releaseGraphics());
  }
  private releaseGraphics() {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments
      ) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((m) => materials.add(m));
      }
      if (object instanceof THREE.Light && "shadow" in object)
        (object as THREE.DirectionalLight).shadow?.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.environment.dispose();
    this.surfaces.dispose();
    this.patrolAppearance.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
