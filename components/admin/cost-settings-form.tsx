"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Prices = {
  deepseekInputCnyPerMillion: number;
  deepseekOutputCnyPerMillion: number;
  asrCnyPerHour: number;
  tikhubCnyPerRequest: number;
};

export function CostSettingsForm({ prices }: { prices: Prices }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return <form className="max-w-2xl space-y-4 rounded-md border border-[#dfe4ea] bg-white p-5" onSubmit={async (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const body = Object.fromEntries(["deepseekInputCnyPerMillion", "deepseekOutputCnyPerMillion", "asrCnyPerHour", "tikhubCnyPerRequest"].map((key) => [key, Number(values.get(key))]));
    const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, totpCode: values.get("totpCode") }) });
    const payload = await response.json(); setMessage(response.ok ? "成本单价已更新，之后的调用按新价格估算" : payload?.error?.message || "保存失败"); if (response.ok) router.refresh();
  }}>
    <PriceField name="deepseekInputCnyPerMillion" label="DeepSeek 输入（元 / 百万 token）" value={prices.deepseekInputCnyPerMillion} />
    <PriceField name="deepseekOutputCnyPerMillion" label="DeepSeek 输出（元 / 百万 token）" value={prices.deepseekOutputCnyPerMillion} />
    <PriceField name="asrCnyPerHour" label="ASR（元 / 小时）" value={prices.asrCnyPerHour} />
    <PriceField name="tikhubCnyPerRequest" label="TikHub（元 / 次）" value={prices.tikhubCnyPerRequest} />
    <label className="block text-sm font-medium text-[#344054]">二次验证 TOTP<input required name="totpCode" inputMode="numeric" maxLength={6} className="focus-ring mt-1.5 h-10 w-full rounded-md border border-[#d0d5dd] px-3" /></label>
    {message ? <p className="text-sm text-[#475467]">{message}</p> : null}
    <button className="h-10 rounded-md bg-[#175cd3] px-4 text-sm text-white">保存单价</button>
  </form>;
}

function PriceField({ name, label, value }: { name: keyof Prices; label: string; value: number }) { return <label className="block text-sm font-medium text-[#344054]">{label}<input required name={name} type="number" min={0} max={1_000_000} step="0.000001" defaultValue={value} className="focus-ring mt-1.5 h-10 w-full rounded-md border border-[#d0d5dd] px-3" /></label>; }
