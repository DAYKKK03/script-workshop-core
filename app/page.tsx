import Link from "next/link";
import { ColorBends } from "@/components/visual/color-bends";

const steps = ["粘贴抖音链接", "自动拆解结构", "生成商家新脚本"];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070812] px-5 py-5 text-white">
      <ColorBends
        colors={["#02030a", "#061026", "#0b2b72", "#1658f9", "#ffffff", "#ff7a1a"]}
        frequency={1.34}
        intensity={2.05}
        iterations={2}
        mouseInfluence={0.38}
        noise={0.12}
        parallax={0.24}
        rotation={36}
        scale={0.52}
        speed={0.28}
        warpStrength={1.42}
      />
      <div className="home-flow-band left-[-22%] top-[18%] h-24 w-[158%] rotate-[-18deg]" />
      <div className="home-flow-band home-flow-band-secondary bottom-[21%] left-[-24%] h-28 w-[166%] rotate-[-16deg]" />
      <div className="home-flow-band home-flow-band-warm bottom-[38%] left-[-12%] h-16 w-[132%] rotate-[-18deg]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(22,88,249,0.1),transparent_26%),linear-gradient(180deg,rgba(7,8,18,0.04),rgba(7,8,18,0.92))]" />
      <div className="absolute inset-2 rounded-[30px] border border-white/10" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col">
        <section className="grid flex-1 place-items-center py-10">
          <div className="mx-auto w-full max-w-5xl text-center">
            <h1 className="text-6xl font-bold leading-none tracking-normal text-white sm:text-8xl">
              Vibe Writing
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-[#cbd5e1] sm:text-xl">
              把抖音参考视频拆成结构，再结合商家资料生成可直接复制的新口播脚本。
            </p>

            <div className="home-steps-glass mx-auto mt-10 flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              {steps.map((step, index) => (
                <div className="flex items-center gap-3" key={step}>
                  <div className="home-step-card flex min-w-[170px] items-center gap-3 rounded-xl px-4 py-3 text-left">
                    <span className="home-step-number grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-[#f8fafc]">
                      {step}
                    </span>
                  </div>
                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="hidden h-px w-8 border-t border-dashed border-white/30 sm:block"
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <p className="mx-auto mt-7 max-w-3xl text-sm leading-7 text-[#dbe4f0]">
              适合本地生活商家、门店老板、探店运营和短视频代运营。
            </p>
            <div className="mt-9">
              <Link
                className="home-cta-button inline-flex items-center justify-center gap-3 text-base font-semibold"
                href="/login"
              >
                <span>开始使用</span>
                <span className="home-cta-icon" aria-hidden="true">
                  <svg
                    fill="none"
                    height="18"
                    viewBox="0 0 18 18"
                    width="18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 9h9.2m0 0L9.5 5.3M13.2 9l-3.7 3.7"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </span>
              </Link>
              <p className="mt-3 text-xs text-[#94a3b8]">
                没有账号？登录页可使用邀请码注册。
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
