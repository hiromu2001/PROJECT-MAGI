import { describe, expect, it } from "vitest";
import {
  LocalTextPerceptionProvider,
  simulateWithoutPersistence,
} from "./engine";

function valueOf(
  observation: Awaited<ReturnType<LocalTextPerceptionProvider["analyze"]>>,
  label: string,
) {
  const index = observation.labels.indexOf(label);
  if (index < 0) throw new Error(`missing observation: ${label}`);
  return observation.values[index];
}

describe("Local semantic perception", () => {
  it("distinguishes risky self-funded research from protected funded research", async () => {
    const provider = new LocalTextPerceptionProvider();

    const risky = await provider.analyze(
      "貯金30万円しかない。根拠もデータもなく、失敗すると生活費がなくなる未知の研究に20万円を一括投資すべき？",
    );
    const protectedCase = await provider.analyze(
      "会社から研究費20万円が支給され返済不要。検証データもあり、いつでも中止できる小さな試験として新しい研究を始めるべき？",
    );

    expect(valueOf(risky, "COST MAGNITUDE")).toBeGreaterThan(
      valueOf(protectedCase, "COST MAGNITUDE"),
    );
    expect(valueOf(risky, "UNCERTAINTY")).toBeGreaterThan(
      valueOf(protectedCase, "UNCERTAINTY"),
    );
    expect(valueOf(risky, "DOWNSIDE SCOPE")).toBeGreaterThan(
      valueOf(protectedCase, "DOWNSIDE SCOPE"),
    );
    expect(valueOf(protectedCase, "EVIDENCE STRENGTH")).toBeGreaterThan(
      valueOf(risky, "EVIDENCE STRENGTH"),
    );
    expect(valueOf(protectedCase, "REVERSIBILITY")).toBeGreaterThan(
      valueOf(risky, "REVERSIBILITY"),
    );
  });

  it("recognizes a high-commitment uncertain career decision", async () => {
    const provider = new LocalTextPerceptionProvider();
    const observation = await provider.analyze(
      "次の仕事も決まっておらず貯金も少ない。よくわからないけど今日中に会社を退職して転職すべき？",
    );

    expect(observation.meta.actionType).toBe("CAREER");
    expect(valueOf(observation, "COMMITMENT LEVEL")).toBeGreaterThan(0.65);
    expect(valueOf(observation, "UNCERTAINTY")).toBeGreaterThan(0.4);
    expect(valueOf(observation, "TIME PRESSURE")).toBeGreaterThan(0.2);
  });
});

describe("Neural valuation", () => {
  it("moves the survival core toward rejection as downside increases", async () => {
    const risky = await simulateWithoutPersistence(
      "貯金30万円しかない。根拠もデータもなく、失敗すると生活費がなくなる未知の研究に20万円を一括投資すべき？",
    );
    const protectedCase = await simulateWithoutPersistence(
      "会社から研究費20万円が支給され返済不要。検証データもあり、いつでも中止できる小さな試験として新しい研究を始めるべき？",
    );

    const riskyBalthasar = risky.results.find((r) => r.core === "BALTHASAR")!;
    const protectedBalthasar = protectedCase.results.find((r) => r.core === "BALTHASAR")!;

    expect(riskyBalthasar.margin).toBeLessThan(protectedBalthasar.margin);

    const improvedCores = protectedCase.results.filter((result) => {
      const riskyResult = risky.results.find((r) => r.core === result.core)!;
      return result.margin > riskyResult.margin;
    });
    expect(improvedCores.length).toBeGreaterThanOrEqual(2);
  });

  it("gives different neural outputs to materially different questions", async () => {
    const a = await simulateWithoutPersistence(
      "検証済みデータがあり、段階的に戻せる新機能を小規模に導入すべき？",
    );
    const b = await simulateWithoutPersistence(
      "根拠がなく撤回できない高額な契約を今すぐ結ぶべき？",
    );

    const marginsA = a.results.map((r) => r.margin.toFixed(4));
    const marginsB = b.results.map((r) => r.margin.toFixed(4));
    expect(marginsA).not.toEqual(marginsB);
  });
});
