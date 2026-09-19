# PROJECT MAGI — SPEC

## 1. 目的

ユーザーが自然言語で審議事項を入力し、3つの独立したFly-Brain-inspired Neural Coreが別々に判断し、2/3多数決で最終決議を返す。

中心UXは次の3段階に固定する。

```text
文字を入力
↓
審議開始
↓
3 Coreの判定 + 最終決議
```

研究用の情報は詳細画面へ分離し、通常操作を複雑にしない。

## 2. アーキテクチャ

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
MELCHIOR / BALTHASAR / CASPAR
  ↓
Consensus Engine
```

PerceptionとNeural Encodingを分離する。JEV導入時にSNN入力次元やMAGI Coreを変更しないことを目的とする。

## 3. Perception

現行Providerは`LocalTextPerceptionProvider`。

文章から、文字量・数値密度・不確実性表現・新規性表現・根拠表現・可逆性表現・資源表現・時間表現・コミットメント表現、および決定論的なsemantic hashを生成する。

これは高精度な意味理解ではない。最終判断をLocal Provider側で決めない。

JEV接続時は`JevPerceptionProvider`を追加し、同じ`CanonicalObservation`を返す。

## 4. Neural Encoder

`CanonicalObservation`から固定24次元の`NeuralStimulus`を生成する。

Providerの変更をこの境界で吸収する。

## 5. Fly Brain

現在はCELL-TYPEレベルのブラウザシミュレーション。

```text
NeuralStimulus
↓
Input / Projection
↓
KC-like sparse population
↓
positive / negative MBON-like readout
↓
Decision
```

Neuronは簡易Leaky Integrate-and-Fireとして扱う。72個のKC-like nodeを使い、実発火数をUIへ表示する。

実FlyWire connectomeそのものではない。

## 6. MAGI Core

### MELCHIOR // Analytical

- 低ノイズ
- 学習率低め
- Evidence Cueへの感度を高める
- 判断閾値をやや高める

### BALTHASAR // Survival

- aversive sideを強める
- Resource / Uncertainty / Commitment Cueに高感度
- failure時の補正を強める

### CASPAR // Adaptive

- plasticityを高める
- Novelty Cueへの感度を高める
- exploration noiseを増やす

3 Coreは共通base topologyを持ち、modulation parameterと学習状態を分ける。

## 7. Decision

Core出力は以下。

- APPROVE
- REJECT
- ABSTAIN

ABSTAINは活動量不足、margin不足、stability不足で発生する。

Decision Strengthは正解確率ではなく、margin / stability / activity sufficiencyから0–100に正規化した指標。

多数決とDecision Strengthは混ぜない。

## 8. Consensus

- APPROVE 2以上 → APPROVED
- REJECT 2以上 → REJECTED
- それ以外 → UNRESOLVED
- 3/3一致 → UNANIMOUS
- 2/1で割れた場合 → DISSENT Coreを表示

## 9. 学習

結果が後日判明した場合にのみ学習させる。

ユーザーは「決議どおり実行したか」と「成功 / 失敗」を登録する。

そこから、実際に成功した行動を支持したCoreに正、逆のCoreに負の学習信号を与える。

審議終了時点のeligibilityを各結果にsnapshotとして保存し、それをKC→MBON重み更新に使う。

学習状態はブラウザのlocalStorageへCore別に保存する。

## 10. UI

配色:

- Background: near black
- Primary: amber / orange
- Alert: red
- Secondary telemetry: desaturated cyan

ルール:

- 角丸カードは使わない
- 細罫線、斜線、巨大番号、高密度のシステム文字
- 3 Coreを三角形に配置
- 中央にConsensus node
- 通常画面は結果に集中
- Neural Activity / Observationは詳細画面へ置く
- ランダムな飾りを神経活動として表示しない

公式作品のロゴ・画像・映像・音声・フォントは使用しない。

## 11. GitHub Pages

React + TypeScript + Vite。

`main`へのpushでGitHub ActionsからPagesへ自動デプロイする。

公開URL:

https://hiromu2001.github.io/PROJECT-MAGI/

## 12. JEV移行条件

JEV統合で変更してよい主要箇所はPerception Provider。

```text
LOCAL ─┐
       ├→ CanonicalObservation → NeuralEncoder → MAGI
JEV ───┘
```

JEV導入によってMAGI Engine、Consensus、UIの大幅改修が必要になった場合は境界設計の失敗とする。

## 13. v1 Definition of Done

- URLだけで審議を開始できる
- clone後にもnpm install / npm run devで動く
- 3 Coreが独立した判断を返す
- 判断はSNN計算結果から作る
- UIのNeural Activityは実発火データと同期する
- 2/3 Consensusが動く
- Dissentを表示できる
- Outcome学習がCore別に保存される
- Local ProviderとNeural Encoderが分離されている
- JEV Provider stubが存在する
- モバイルで最低限操作できる
