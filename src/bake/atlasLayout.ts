/**
 * Atlas layout for brick SDF samples (9³ per slot) in an r16float 3D texture.
 * slotsX is fixed at 128 so that a texel row (128*9*2 = 2304 bytes) is a multiple of 256,
 * as required by copyBufferToTexture.
 */
export const SAMPLES_PER_AXIS = 9;
export const SAMPLES_PER_BRICK = SAMPLES_PER_AXIS ** 3;
export const ATLAS_SLOTS_X = 128;

export type AtlasLayout = {
  readonly slotsX: number;
  readonly slotsY: number;
  readonly slotsZ: number;
  readonly size: [number, number, number];
};

export const computeAtlasLayout = (slotCount: number, maxDim = 2048): AtlasLayout => {
  const maxSlots = Math.floor(maxDim / SAMPLES_PER_AXIS);
  const slotsX = ATLAS_SLOTS_X;
  const slotsY = Math.max(1, Math.min(maxSlots, Math.ceil(slotCount / slotsX)));
  const slotsZ = Math.max(1, Math.ceil(slotCount / (slotsX * slotsY)));
  if (slotsZ > maxSlots) throw new Error(`too many bricks for one atlas: ${slotCount}`);
  return {
    slotsX,
    slotsY,
    slotsZ,
    size: [slotsX * SAMPLES_PER_AXIS, slotsY * SAMPLES_PER_AXIS, slotsZ * SAMPLES_PER_AXIS],
  };
};

/** Slot origin in samples (x-fastest), mirrors atlasSlotOrigin in brickGrid.wgsl. */
export const slotOrigin = (layout: AtlasLayout, slot: number): [number, number, number] => [
  (slot % layout.slotsX) * SAMPLES_PER_AXIS,
  (Math.floor(slot / layout.slotsX) % layout.slotsY) * SAMPLES_PER_AXIS,
  Math.floor(slot / (layout.slotsX * layout.slotsY)) * SAMPLES_PER_AXIS,
];

/** Bytes needed by the atlas texture (r16float). */
export const atlasBytes = (layout: AtlasLayout): number => layout.size[0] * layout.size[1] * layout.size[2] * 2;
