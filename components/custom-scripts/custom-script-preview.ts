import type {
  CustomScriptPreviewState,
  CustomScriptResult
} from "./custom-script-types";

export const customScriptPreviewStates: CustomScriptPreviewState[] = [
  "empty",
  "processing",
  "success",
  "needs_profile",
  "error"
];

export const customScriptPreviewRequest = `【脚本工坊爆款选题】
sourceProjectId:preview-project
sourceType:top_pick
sourceObjective:trust
商家项目：小岛西点烘焙
选题标题：为什么一份不腻的下午茶，要反复调整每一层甜度
开篇：下午三点想吃甜，又怕第一口就腻？
核心钩子：带你看门店怎样平衡蛋糕、奶油和入口层次。
爆款元素：幕后、人群
爆款元素应用说明：用真实制作取舍建立信任，聚焦办公室下午茶场景。`;

const previewScript = `下午三点一到，你是不是就开始犯困？
明明午饭吃过了，嘴里还是想来点甜的。
可一想到太腻，又怕吃两口就放下。
我们做这份下午茶时，也在纠结这件事。
甜味不能抢，奶油也不能压住蛋糕香。
所以每一层都反复调整，少一点就寡淡。
多一点又会让人觉得负担太重。
现在这份切开很轻，入口却不是空的。
先是柔软的蛋糕，再是细腻的奶油。
最后留下淡淡香气，不会一直黏在嘴里。
一个人安静吃，刚好能给下午按下暂停。
和同事一起分，也不会弄得手忙脚乱。
有人说，甜品只是嘴馋时的一点安慰。
但忙了一整天，谁不想认真照顾自己？
不需要等生日，也不用找特别的理由。
普通的一天，同样值得有一点小期待。
你可以慢慢挑，也可以先问当天有什么。`;

export function getCustomScriptPreviewResult(
  state: CustomScriptPreviewState
): CustomScriptResult {
  switch (state) {
    case "processing":
      return { status: "processing" };
    case "success":
      return { status: "success", finalScript: previewScript };
    case "needs_profile":
      return {
        status: "needs_profile",
        missingFacts: ["core_selling_point", "consumption_scene"]
      };
    case "error":
      return { status: "failed", message: "静态示例：服务暂时不可用，请稍后重试。" };
    case "empty":
      return { status: "initial" };
  }
}

export function isCustomScriptPreviewEnabled(nodeEnv: string | undefined) {
  return nodeEnv !== "production";
}
