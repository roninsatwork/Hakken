import * as THREE from "three";
import { expect, it } from "vitest";
import { LanternLighting } from "./LanternLighting";

it("keeps a bounded light topology as the player moves between lamp clusters", () => {
  const scene = new THREE.Scene();
  for (let i = 0; i < 40; i++) {
    const lamp = new THREE.PointLight(0xffaa66, 6, 7);
    lamp.position.set(i * 3, 2, 0);
    scene.add(lamp);
  }
  const pool = new LanternLighting(scene);
  const slots = scene.children.filter(
    (o): o is THREE.PointLight => o instanceof THREE.PointLight,
  );
  expect(slots).toHaveLength(8);
  pool.update(new THREE.Vector3(1, 1, 0));
  expect(slots[0].position.x).toBe(0);
  pool.update(new THREE.Vector3(118, 1, 0));
  expect(slots[0].position.x).toBe(117);
  expect(scene.children).toEqual(slots);
  expect(slots.every((l) => l.visible)).toBe(true);
});
