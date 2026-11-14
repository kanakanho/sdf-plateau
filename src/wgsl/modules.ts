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
import sceneTrisSrc from './sceneTris.wgsl?raw';
import sdBoxSrc from './sdBox.wgsl?raw';
import sdfCodecSrc from './sdfCodec.wgsl?raw';
import sdfRenderSrc from './sdfRender.wgsl?raw';
import sdfSceneSrc from './sdfScene.wgsl?raw';
import sdfSceneCommonSrc from './sdfSceneCommon.wgsl?raw';
import sdfTiledSceneSrc from './sdfTiledScene.wgsl?raw';
import sceneShapeSrc from './sceneShape.wgsl?raw';
import sceneShapeWavesSrc from './sceneShapeWaves.wgsl?raw';
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
export const sceneTris = defineModule('sceneTris', sceneTrisSrc);
export const sdfSceneCommon = defineModule('sdfSceneCommon', sdfSceneCommonSrc, [sceneTypes, brickGrid, sdfCodec]);
/** single baked grid (Tokyo Station LOD2) */
export const sdfScene = defineModule('sdfScene', sdfSceneSrc, [sdfSceneCommon, sceneTris, rayTriangle]);
/** streamed tiles (LOD1 areas) */
export const sdfTiledScene = defineModule('sdfTiledScene', sdfTiledSceneSrc, [sdfSceneCommon]);

/** Compute entry points (contain their own @binding declarations). */
export const bakeKernel = defineModule('bakeKernel', bakeSrc, [closestPointTriangle]);
export const packKernel = defineModule('packKernel', packSrc, [sdfCodec]);

export const frame = defineModule('frame', frameSrc);
export const shading = defineModule('shading', shadingSrc, [palette]);

/** Scene shape hooks read by the SDF renderer: plain buildings, or wave-cut shells (/waves/). */
export const sceneShape = defineModule('sceneShape', sceneShapeSrc);
export const sceneShapeWaves = defineModule('sceneShapeWaves', sceneShapeWavesSrc, [frame, shading]);

/** Render entry points (bindings are declared by the pipeline code). */
export const rasterShader = defineModule('rasterShader', rasterSrc, [frame, shading, sceneTris, rayFromNdc]);
export const sdfRenderShader = defineModule('sdfRenderShader', sdfRenderSrc, [frame, shading, sceneShape, sdfScene, rayBox, rayFromNdc]);
export const sdfWaveShellRenderShader = defineModule('sdfWaveShellRenderShader', sdfRenderSrc, [frame, shading, sceneShapeWaves, sdfScene, rayBox, rayFromNdc]);
export const sdfTiledRenderShader = defineModule('sdfTiledRenderShader', sdfRenderSrc, [frame, shading, sceneShape, sdfTiledScene, rayBox, rayFromNdc]);
export const sdfTiledWaveShellRenderShader = defineModule('sdfTiledWaveShellRenderShader', sdfRenderSrc, [frame, shading, sceneShapeWaves, sdfTiledScene, rayBox, rayFromNdc]);
