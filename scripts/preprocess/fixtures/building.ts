/** Small hand-written PLATEAU-like building used by the preprocessing tests. */

const ring = (pts: number[][]) =>
  `<gml:LinearRing><gml:posList>${pts.map((p) => p.join(' ')).join(' ')}</gml:posList></gml:LinearRing>`;

const poly = (pts: number[][], holes: number[][][] = []) =>
  `<gml:surfaceMember><gml:Polygon gml:id="p"><gml:exterior>${ring(pts)}</gml:exterior>${holes
    .map((h) => `<gml:interior>${ring(h)}</gml:interior>`)
    .join('')}</gml:Polygon></gml:surfaceMember>`;

// ~10m x ~11m footprint near Tokyo Station, ground at 2.0 m T.P., roof at 12.0 m
const LAT0 = 35.6812;
const LNG0 = 139.767;
const DLAT = 0.0001; // ≈ 11.1 m
const DLNG = 0.00011; // ≈ 9.9 m
export const corners = [
  [LAT0, LNG0],
  [LAT0, LNG0 + DLNG],
  [LAT0 + DLAT, LNG0 + DLNG],
  [LAT0 + DLAT, LNG0],
];
const at = (i: number, h: number) => [corners[i % 4][0], corners[i % 4][1], h];

const ground = [at(0, 2), at(3, 2), at(2, 2), at(1, 2), at(0, 2)]; // CW seen from above -> faces down
const roof = [at(0, 12), at(1, 12), at(2, 12), at(3, 12), at(0, 12)]; // CCW -> faces up
const walls = [0, 1, 2, 3].map((i) => [at(i, 2), at(i + 1, 2), at(i + 1, 12), at(i, 12), at(i, 2)]);

const surface = (kind: string, polys: string) =>
  `<bldg:boundedBy><bldg:${kind} gml:id="s"><bldg:lod2MultiSurface><gml:MultiSurface>${polys}</gml:MultiSurface></bldg:lod2MultiSurface></bldg:${kind}></bldg:boundedBy>`;

export const LOD2_BUILDING = `<bldg:Building gml:id="bldg_test-1">
<gml:name>テストビル</gml:name>
<bldg:class codeSpace="x">3001</bldg:class>
<bldg:usage codeSpace="x">401</bldg:usage>
<bldg:measuredHeight uom="m">10.0</bldg:measuredHeight>
<bldg:storeysAboveGround>3</bldg:storeysAboveGround>
<bldg:yearOfConstruction>1999</bldg:yearOfConstruction>
<bldg:lod1Solid><gml:Solid><gml:exterior><gml:CompositeSurface>${poly(roof)}</gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod1Solid>
<bldg:lod2Solid><gml:Solid><gml:exterior><gml:CompositeSurface><gml:surfaceMember xlink:href="#p"/></gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod2Solid>
${surface('GroundSurface', poly(ground))}
${surface('RoofSurface', poly(roof))}
${surface('WallSurface', walls.map((w) => poly(w)).join(''))}
<bldg:address><core:Address><core:xalAddress><xAL:AddressDetails><xAL:Country><xAL:Locality><xAL:LocalityName Type="Town">東京都千代田区丸の内一丁目</xAL:LocalityName></xAL:Locality></xAL:Country></xAL:AddressDetails></core:xalAddress></core:Address></bldg:address>
<uro:buildingIDAttribute><uro:BuildingIDAttribute><uro:buildingID>13101-bldg-1</uro:buildingID></uro:BuildingIDAttribute></uro:buildingIDAttribute>
</bldg:Building>`;

export const LOD1_ONLY_BUILDING = `<bldg:Building gml:id="bldg_test-2">
<bldg:measuredHeight uom="m">-9999</bldg:measuredHeight>
<bldg:lod1Solid><gml:Solid><gml:exterior><gml:CompositeSurface>
${poly(ground)}${poly(roof)}${walls.map((w) => poly(w)).join('')}
</gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod1Solid>
</bldg:Building>`;

export const POLY_WITH_HOLE = poly(
  [[0, 0, 0], [0, 4, 0], [4, 4, 0], [4, 0, 0], [0, 0, 0]],
  [[[1, 1, 0], [3, 1, 0], [3, 3, 0], [1, 3, 0], [1, 1, 0]]],
);
