# PROJECT MAGI

ハエ脳由来の発想を取り入れた3つの独立した神経コアが、同じ入力を別々に審議し、多数決で最終決議を出すブラウザアプリです。

- **01 // MELCHIOR** — ANALYTICAL CORE
- **02 // BALTHASAR** — SURVIVAL CORE
- **03 // CASPAR** — ADAPTIVE CORE

## Demo

GitHub Pages: https://hiromu2001.github.io/PROJECT-MAGI/

入力欄に審議したい内容を書き、**「審議開始」**を押すだけで動きます。現在は外部APIを使わず、ブラウザ内のLocal Perception Providerで入力をCanonical Observationへ変換し、Neural Encoderを経由して3つの独立したFly-Brain-inspired SNNへ送ります。

> 現在のCONNECTOME MODEは **CELL-TYPE / Browser Simulation** です。実FlyWireコネクトームそのものを再現しているわけではありません。

## 仕組み

```text
User Text
   ↓
PerceptionProvider
   ↓
CanonicalObservation
   ↓
NeuralEncoder
   ↓
NeuralStimulus
   ↓
┌─────────────┬─────────────┬─────────────┐
│ MELCHIOR    │ BALTHASAR   │ CASPAR      │
│ Fly Brain   │ Fly Brain   │ Fly Brain   │
└──────┬──────┴──────┬──────┴──────┬──────┘
       ↓             ↓             ↓
    Decision      Decision      Decision
       └──────────────┬──────────────┘
                      ↓
               Consensus Engine
```

UIに出る神経活動は、ブラウザ内で実際に走らせた簡易LIFシミュレーションの発火イベントを使っています。結果だけを乱数で決める構成にはしていません。

## JEVを後から接続する方針

MAGI本体をJEVに依存させないため、入力処理を次の境界で分離しています。

```text
LOCAL ─┐
       ├─> CanonicalObservation ─> NeuralEncoder ─> MAGI
JEV ───┘
```

将来JEV APIを利用できるようになった場合は、`PerceptionProvider`の実装として`JevPerceptionProvider`を追加します。SNN、3コア、合議、UIは原則変更しません。

## ローカルで使う

Node.js 20以上を推奨します。

```bash
git clone https://github.com/hiromu2001/PROJECT-MAGI.git
cd PROJECT-MAGI
npm install
npm run dev
```

ブラウザでViteが表示するローカルURLを開いてください。

本番ビルド:

```bash
npm run build
npm run preview
```

## GitHub Pages

`main`へpushするとGitHub ActionsがViteをビルドし、GitHub Pagesへ自動デプロイします。

## データ

学習状態と審議履歴はブラウザの`localStorage`へ保存します。端末・ブラウザを変えると状態は共有されません。

## 開発方針

- 通常操作は「文字入力 → 審議開始 → 3コアの判定 → 最終決議」に絞る
- MELCHIOR / BALTHASAR / CASPARは独立した学習状態を持つ
- UI上の活動表示は内部シミュレーション状態と同期させる
- JEVや将来のコネクトーム実装は交換可能な層として追加する
- 公式作品の画像・ロゴ・音声・フォント等は使用せず、独自の工業端末 / 生体計算機風UIとして作る

詳細は [SPEC.md](./SPEC.md) を参照してください。
