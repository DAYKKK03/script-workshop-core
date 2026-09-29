/** Client-safe canonical missing-fact codes and display labels. */
export const CUSTOM_SCRIPT_MISSING_FACTS = [
  { code: "main_product", label: "主营产品" },
  { code: "core_selling_point", label: "核心卖点" },
  { code: "target_audience", label: "目标人群" },
  { code: "consumption_scene", label: "消费场景" },
  { code: "price", label: "价格" },
  { code: "promotion", label: "活动" },
  { code: "address_or_service_area", label: "地址或服务区域" },
  { code: "service_process", label: "服务流程" },
  { code: "qualification", label: "资质" },
  { code: "proof_or_case", label: "证据或案例" },
  { code: "effect_claim", label: "效果依据" },
  { code: "production_process", label: "生产或制作流程" },
  { code: "materials_or_ingredients", label: "材料、原料或成分" },
  { code: "service_action", label: "服务动作" },
  { code: "business_hours", label: "营业时间" },
  { code: "contact_method", label: "联系方式" },
  { code: "business_data", label: "经营数据" },
  { code: "warranty_or_after_sales", label: "质保或售后" }
] as const;

export type MissingFactCode = (typeof CUSTOM_SCRIPT_MISSING_FACTS)[number]["code"];

export const MISSING_FACT_CODES: ReadonlyArray<MissingFactCode> = Object.freeze(
  CUSTOM_SCRIPT_MISSING_FACTS.map(({ code }) => code)
);

export const MISSING_FACT_LABELS = Object.freeze(Object.fromEntries(
  CUSTOM_SCRIPT_MISSING_FACTS.map(({ code, label }) => [code, label])
)) as Readonly<Record<MissingFactCode, string>>;
