# SDF PLATEAU（東京駅周辺）

PLATEAU の建築物モデル（LOD2、無い建物は LOD1）を、WebGPU 上で疎なブリック SDF に焼き込み、レイマーチで描画して MapLibre の地図に重ねます。

- 対象範囲: 3 次メッシュ 53394610 / 611 / 620 / 621（約 2.3km × 2.0km、建物 2,548 棟、三角形 72 万）
- 背景地図: 地理院タイル（淡色・標準・航空写真）

加工済みデータ（`public/data/`）を同梱しているので、`npm install && npm run dev` だけで表示できます。

## 使い方

```bash
npm install
# データを作り直す場合のみ: CityGML (EPSG:6697) を data/raw/ に置いてから
npm run preprocess      # -> public/data/city.bin, city.json
npm run dev             # http://localhost:5173
npm test                # Vitest（WGSL の関数は Dawn = npm `webgpu` で GPU 実行して検証）
```

WebGPU に対応したブラウザ（Chrome / Edge / Safari 26 以降）が必要です。

## 処理の流れ

1. **前処理（Node）** `scripts/preprocess/`
   CityGML を建物ごとにストリームで読みます。LOD2 は `bldg:boundedBy` の各面と `lod2Geometry`、LOD2 が無い建物は LOD1 を三角形に分割します。座標は緯度経度をローカル座標（東京駅を原点、メルカトル尺度のメートル）に変換し、建物ごとに地盤高を引きます。
2. **ビン分け（Web Worker）** `src/bake/prepare.ts`
   1m ボクセル × 8³ のブリックで、表面から 1m 以内のブリックを「占有」とします。各ブリックには 4m（打ち切り幅）以内の三角形リストを持たせます。空のブリックには、最寄りの占有ブリックまでのチェビシェフ距離を入れます。
3. **GPU ベイク** `src/wgsl/bake.wgsl`, `pack.wgsl`
   9³ のサンプルごとに最近接三角形までの距離を求め、その面の法線で符号を決めます。結果は r8unorm の 3D アトラスに格納します（約 127MB）。
4. **描画** `src/wgsl/sdfRender.wgsl`
   全画面のフラグメントシェーダでレイを飛ばし、空ブリックは飛ばしながらスフィアトレースします。当たったら、そのブリックの三角形で交点を補正します（切り替え可）。シェーディングは太陽（日時から計算）、SDF ソフトシャドウ、AO、地面の影です。色分けは面の種類・高さ・用途・建築年の 4 種類から選べます。
5. **地図との同期** `src/map/syncLayer.ts`
   何もしない custom layer の `render()` から MapLibre の行列を受け取ります。それに「ローカル → メルカトル」の行列を float64 で掛けてから WebGPU の canvas を描きます。

比較用のラスタ描画（`raster.wgsl`）も用意してあり、SDF の結果とピクセル単位で照合するテスト（`src/render/renderDiff.test.ts`）があります。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `src/geo` | 行列・メルカトル・ローカル座標・太陽位置 |
| `src/geom` | 三角形クエリ、三角形と箱の交差判定、多角形の三角形分割 |
| `src/data` | バイナリのメッシュ形式、建物属性、読み込み |
| `src/bake` | グリッド、ビン分け、距離変換、アトラス配置、GPU ベイク |
| `src/wgsl` | 1 ファイル 1 関数群の WGSL と、小さなリンカ |
| `src/render` | フレーム uniform、シーンリソース、ラスタ / SDF パイプライン |
| `src/gpu` | バッファ、明示的な bind group layout、WGSL テストハーネス |
| `src/app` | 画面の状態（純粋関数）と DOM・地図の配線 |

方針として、関数は小さく疎結合に保ち、ライブラリが要求する箇所（`new maplibregl.Map` など）以外ではクラスを使いません。

## データの出典とライセンス

`public/data/` のデータは、次のデータを加工して作成したものです。詳細は [public/data/ATTRIBUTION.md](public/data/ATTRIBUTION.md) を参照してください。

> 出典：3D都市モデル（Project PLATEAU）建築物モデル（千代田区）2025年度（国土交通省 / 著作権 千代田区）
> <https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025>
> 上記データを加工して作成（三角形化、ローカル座標への変換、地盤高の補正、属性の抽出）

- 利用条件は [PLATEAU サイトポリシー](https://www.mlit.go.jp/plateau/site-policy/)（公共データ利用規約 第1.0版、CC BY 4.0 互換）に従います。
- このリポジトリのデータは、国土交通省や千代田区が作成・公表したものではありません。
- 元の CityGML（1 ファイル最大 250MB）は同梱していません。上記の配布ページから入手できます。
- 背景地図は閲覧時に [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html) を読み込んでおり、再配布はしていません。
