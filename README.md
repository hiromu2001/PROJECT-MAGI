# PROJECT MAGI

ハエ脳由来の発想を取り入れた3つの独立した神経コアが、同じ入力を別々に審議し、多数決で最終決議を出すブラウザアプリです。

- **01 // MELCHIOR** — ANALYTICAL CORE
- **02 // BALTHASAR** — SURVIVAL CORE
- **03 // CASPAR** — ADAPTIVE CORE

## Demo

GitHub Pages: https://hiromu2001.github.io/PROJECT-MAGI/

入力欄に審議したい内容を書き、**「審議開始」**を押すだけで動きます。現在は外部APIを使わず、ブラウザ内のLocal Perception Providerが文章からコスト、可逆性、不確実性、根拠、時間圧、コミットメント、新規性、下振れ/上振れ範囲、個人/社会への影響などをCanonical Observationとして抽出し、Neural Encoderを経由して3つの独立したFly-Brain-inspired SNNへ送ります。

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

UIに出る神経活動は、ブラウザ内で実際に走らせた簡易LIFシミュレーションの発火イベントを使っています。最終的な承認/否決をPerception側の固定if文で決めるのではなく、Canonical Observationが神経刺激になり、各Core固有のMBON感度と学習済み重みを通った結果として判断が出ます。

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

公開URL:

https://hiromu2001.github.io/PROJECT-MAGI/

このリポジトリではGitHub Pagesを有効化済みで、GitHub Actionsによる自動デプロイを設定しています。

新規リポジトリ作成直後など、GitHub Pages自体がまだ有効になっていない場合だけ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更してください。

https://github.com/hiromu2001/PROJECT-MAGI/settings/pages

一度有効化すれば、その後は`main`へのpushでビルドとデプロイが自動実行されます。

## データ

学習状態と審議履歴はブラウザの`localStorage`へ保存します。端末・ブラウザを変えると状態は共有されません。

## 開発方針

- 通常操作は「文字入力 → 審議開始 → 3コアの判定 → 最終決議」に絞る
- MELCHIOR / BALTHASAR / CASPARは独立した学習状態を持つ
- UI上の活動表示は内部シミュレーション状態と同期させる
- JEVや将来のコネクトーム実装は交換可能な層として追加する
- 公式作品の画像・ロゴ・音声・フォント等は使用せず、独自の工業端末 / 生体計算機風UIとして作る

詳細は [SPEC.md](./SPEC.md) を参照してください。


## 回答品質について

Local Providerは単なる文字数・semantic hash中心の方式から、意味特徴ベースの解析へ変更しています。例えば同じ「研究に20万円使うべきか？」でも、自己資金・根拠不足・高い不可逆性があるケースと、会社支給・返済不要・検証済み・中止可能なケースでは異なるCanonical Observationを生成します。

自動テストでは、意味特徴の差だけでなく、条件が改善した場合にBALTHASARを含むNeural CoreのMBON marginが実際に変化することも確認しています。

```bash
npm test
```
