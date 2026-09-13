import * as THREE from "three";
import { expect, it } from "vitest";
import { PickupLighting } from "./PickupLighting";

it("keeps the visible light topology unchanged through every pickup and retry", () => {
  const scene = new THREE.Scene(),
    lighting = new PickupLighting(scene);
  const models = Array.from({ length: 4 }, (_, i) => {
    const model = new THREE.Group();
    model.position.set(i * 2, 0, 1);
    scene.add(model);
    lighting.attach(model, i === 3 ? 0x55bfff : 0x50ffc0);
    return model;
  });
  const activeLights = () => {
    const lights: THREE.PointLight[] = [];
    scene.traverseVisible((o) => {
      if (o instanceof THREE.PointLight) lights.push(o);
    });
    return lights;
  };
  const initial = activeLights();
  expect(initial).toHaveLength(4);
  for (const [index, model] of models.entries()) {
    lighting.show(model, false);
    expect(model.visible).toBe(false);
    // Three keys lit shaders by light count, even when a light has zero intensity.
    expect(activeLights()).toEqual(initial);
    expect(initial[index].parent).toBe(scene);
    expect(initial[index].intensity).toBe(0);
  }
  for (const model of models) lighting.show(model, true);
  expect(activeLights()).toEqual(initial);
  expect(initial.map((l) => l.intensity)).toEqual([3, 3, 3, 3]);
});
