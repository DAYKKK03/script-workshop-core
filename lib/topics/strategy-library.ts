import { VIRAL_ELEMENTS, type ViralElement } from "@/lib/topics/types";

/**
 * Curated from the content strategy handbook. Keeping this compact and typed
 * makes the runtime prompt deterministic without reading user-provided files.
 */
export type TopicStrategy = {
  element: ViralElement;
  principle: string;
  titleFormula: string;
  openingFormula: string;
  hookFormula: string;
  pairing: string;
  evidenceRule: string;
};

export const TOPIC_STRATEGY_LIBRARY: readonly TopicStrategy[] = [
  { element: "人群", principle: "让具体人群在标题和场景中认出自己", titleFormula: "具体人群+典型场景+共同痛点", openingFormula: "先点名人群，再说出此刻正在发生的具体问题", hookFormula: "用一个可验证的选择或细节让人继续看", pairing: "可与成本、怀旧、共鸣式表达组合", evidenceRule: "人群和痛点必须来自商家资料或用户确认场景" },
  { element: "成本", principle: "降低金钱、时间或精力的决策门槛", titleFormula: "真实价值锚点+实际成本对比", openingFormula: "先给出真实的时间、步骤或选择成本，再切入解决方式", hookFormula: "承诺解释如何省下成本，不能虚构价格或优惠", pairing: "可与人群、反差、转化目标组合", evidenceRule: "数字、价格、时长只能使用商家资料明确提供的事实" },
  { element: "借势", principle: "借公开节日或大众话题建立当下关联", titleFormula: "公开节日/大众话题+门店真实使用场景", openingFormula: "从公开话题落到商家真实产品或服务，不暗示合作", hookFormula: "说明这个话题与当前消费决策的具体关系", pairing: "可与人群、怀旧、转化目标组合", evidenceRule: "不得声称品牌合作、官方背书或未证实热点" },
  { element: "对立", principle: "用选择、观点或前后效果对比制造张力", titleFormula: "选择A与选择B+具体消费场景", openingFormula: "先提出用户正在纠结的两种选择，再给出判断标准", hookFormula: "用真实过程或效果对比兑现冲突", pairing: "可与成本、解释、反差组合", evidenceRule: "只讨论观点、选择或效果，不攻击群体和竞品" },
  { element: "幕后", principle: "展示真实制作过程和可见细节", titleFormula: "产品结果+一个真实制作细节", openingFormula: "从镜头前看不到的真实步骤或标准切入", hookFormula: "预告一个能在视频中拍到的过程证据", pairing: "可与猎奇、信任目标组合", evidenceRule: "只写商家资料明确支持的流程，不编造黑幕" },
  { element: "反差", principle: "用预期与真实结果的落差吸引注意", titleFormula: "常见预期 vs 商家真实做法/效果", openingFormula: "先说用户通常以为的情况，再立刻给出真实反差", hookFormula: "承诺展示造成反差的具体证据", pairing: "可与成本、幕后、猎奇组合", evidenceRule: "反差必须可拍摄、可解释、可由商家资料兑现" },
  { element: "猎奇", principle: "展示真实但少见或反常识的细节", titleFormula: "真实少见细节+悬念", openingFormula: "从一个资料中确实存在的反常细节提出疑问", hookFormula: "明确会在内容中解释或展示答案", pairing: "可与解释、幕后组合", evidenceRule: "不得虚构反常事实、资质、销量或效果" },
  { element: "怀旧", principle: "用真实时代符号唤起共同记忆", titleFormula: "具体年代符号+当下消费场景", openingFormula: "先唤起一个具体记忆，再连接到商家当前体验", hookFormula: "用可见的产品、味道或仪式细节收束", pairing: "可与人群、借势组合", evidenceRule: "时代细节和产品关联必须真实，不强行煽情" },
  { element: "糟糕", principle: "用翻车、避坑或错误示范帮助用户少走弯路", titleFormula: "常见错误+真实避坑场景", openingFormula: "直接呈现一个可避免的错误或翻车瞬间", hookFormula: "给出可执行的检查点，不攻击可识别竞品", pairing: "可与成本、对立、解释组合", evidenceRule: "只做错误示范或避坑，不指控具体商家" },
  { element: "性感", principle: "表达产品视觉吸引力、氛围感和审美", titleFormula: "视觉细节+具体消费氛围", openingFormula: "从真实可拍的色泽、质感、动作或空间氛围切入", hookFormula: "引导观众等待一个视觉呈现，不使用性暗示", pairing: "可与人群、怀旧、反差组合", evidenceRule: "仅表达产品和环境审美，禁止低俗、性暗示及未成年人内容" }
] as const;

const strategyByElement = new Map(TOPIC_STRATEGY_LIBRARY.map((item) => [item.element, item]));

export function getTopicStrategy(element: ViralElement) {
  return strategyByElement.get(element)!;
}

export function buildTopicStrategyRules() {
  return TOPIC_STRATEGY_LIBRARY.map((item) => `${item.element}：原理=${item.principle}；标题=${item.titleFormula}；开篇=${item.openingFormula}；钩子=${item.hookFormula}；组合=${item.pairing}；依据=${item.evidenceRule}`).join("\n");
}

export const TOPIC_QUALITY_RULES = `质量要求：标题必须包含具体人群、场景、动作、选择、细节或结果中的至少两项，避免“推荐几个、带你了解、分享一下、值得一看、如何做好”这类空泛模板。开篇前两句必须落到当前消费场景和一个真实问题、反差或细节；核心钩子必须说明接下来会展示/解释的证据，不能只写“看到最后”。25条要覆盖不同切入角度（选择、避坑、过程、对比、解释、故事、视觉等），不能只替换关键词或人群。每条选1个主元素，必要时再配1个辅元素；元素说明要写出具体落点。所有承诺必须能用商家资料和可拍素材兑现，不虚构价格、库存、销量、资质、热点合作或效果。`;

export const TOPIC_STRATEGY_RULES = `固定策略库（由内容策略手册提炼，运行时不读取外部Markdown）：\n${buildTopicStrategyRules()}\n${TOPIC_QUALITY_RULES}`;

export function isOrdinaryTopicTitle(title: string) {
  return /^(推荐几个|带你了解|分享一下|值得一看|如何做好|教你怎么|关于.+的分享)/.test(title.trim());
}

export { VIRAL_ELEMENTS };
