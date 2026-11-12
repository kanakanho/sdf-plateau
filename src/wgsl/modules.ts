/** Registry of reusable WGSL modules (one function family per file). */
import bakeSrc from './bake.wgsl?raw';
import brickGridSrc from './brickGrid.wgsl?raw';
import closestPointTriangleSrc from './closestPointTriangle.wgsl?raw';
import frameSrc from './frame.wgsl?raw';
import packSrc from './pack.wgsl?raw';
import paletteSrc from './palette.wgsl?raw';
import rayBoxSrc from './rayBox.wgsl?raw';
import rayFromNdcSrc from './rayFromNdc.wgsl?raw';
import rasterSrc from './raster.wgsl?raw';
import rayTriangleSrc from './rayTriangle.wgsl?raw';
import sceneTypesSrc from './sceneTypes.wgsl?raw';
import sdBoxSrc from './sdBox.wgsl?raw';
import sdfCodecSrc from './sdfCodec.wgsl?raw';
import sdfRenderSrc from './sdfRender.wgsl?raw';
import sdfSceneSrc from './sdfScene.wgsl?raw';
import shadingSrc from './shading.wgsl?raw';
import { defineModule } from './link';

export const sdBox = defineModule('sdBox', sdBoxSrc);
export const rayBox = defineModule('rayBox', rayBoxSrc);
export const rayFromNdc = defineModule('rayFromNdc', rayFromNdcSrc);
export const closestPointTriangle = defineModule('closestPointTriangle', closestPointTriangleSrc);
export const rayTriangle = defineModule('rayTriangle', rayTriangleSrc);
export const brickGrid = defineModule('brickGrid', brickGridSrc);
export const palette = defineModule('palette', paletteSrc);
export const sdfCodec = defineModule('sdfCodec', sdfCodecSrc);
export const sceneTypes = defineModule('sceneTypes', sceneTypesSrc);
export const sdfScene = defineModule('sdfScene', sdfSceneSrc, [sceneTypes, brickGrid, sdfCodec, rayTriangle]);

/** Compute entry points (contain their own @binding declarations). */
export const bakeKernel = defineModule('bakeKernel', bakeSrc, [closestPointTriangle]);
export const packKernel = defineModule('packKernel', packSrc, [sdfCodec]);

export const frame = defineModule('frame', frameSrc);
export const shading = defineModule('shading', shadingSrc, [palette]);

/** Render entry points (bindings are declared by the pipeline code). */
export const rasterShader = defineModule('rasterShader', rasterSrc, [frame, shading, sceneTypes]);
export const sdfRenderShader = defineModule('sdfRenderShader', sdfRenderSrc, [frame, shading, sdfScene, rayBox, rayFromNdc]);
