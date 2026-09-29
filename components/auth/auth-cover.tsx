import Link from "next/link";
import { ColorBends } from "@/components/visual/color-bends";

type AuthCoverProps = {
  active: "login" | "register";
  children: React.ReactNode;
  panelTitle: string;
  panelDescription: string;
  switchText: string;
  switchHref: string;
  switchLabel: string;
};

export function AuthCover({
  active,
  children,
  panelTitle,
  panelDescription,
  switchText,
  switchHref,
  switchLabel
}: AuthCoverProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080712] px-5 py-5">
      <ColorBends
        colors={["#02030a", "#061026", "#102d7a", "#1658f9", "#1d6dff"]}
        frequency={1.05}
        intensity={1.9}
        iterations={2}
        mouseInfluence={0.22}
        noise={0.12}
        parallax={0.18}
        rotation={38}
        scale={0.58}
        speed={0.2}
        warpStrength={1.35}
      />
      <div className="absolute left-[-12%] top-[18%] h-16 w-[138%] rotate-[-13deg] bg-[linear-gradient(90deg,transparent,rgba(22,88,249,0.08),rgba(29,109,255,0.78),rgba(22,88,249,0.16),transparent)] blur-[10px]" />
      <div className="absolute bottom-[22%] left-[-18%] h-20 w-[146%] rotate-[-12deg] bg-[linear-gradient(90deg,transparent,rgba(22,88,249,0.08),rgba(29,109,255,0.7),rgba(22,88,249,0.13),transparent)] blur-[12px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(22,88,249,0.18),transparent_24%),linear-gradient(180deg,rgba(8,7,18,0.12),rgba(8,7,18,0.9))]" />
      <div className="absolute inset-2 rounded-[30px] border border-white/10" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col">
        <header className="glass-panel mx-auto flex w-full max-w-5xl items-center justify-between rounded-2xl px-6 py-4">
          <Link
            className="inline-flex items-center gap-3 text-xl font-bold text-white"
            href="/login"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/14 bg-white text-sm font-black text-[#080712]">
              AI
            </span>
            AI脚本运营
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                active === "login"
                  ? "bg-white text-[#080712]"
                  : "border border-white/12 bg-white/8 text-[#cbd5e1] hover:bg-white/12 hover:text-white"
              }`}
              href="/login"
            >
              登录
            </Link>
            <Link
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                active === "register"
                  ? "orange-gradient text-white"
                  : "border border-white/12 bg-white/8 text-[#cbd5e1] hover:bg-white/12 hover:text-white"
              }`}
              href="/register"
            >
              注册
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="w-full max-w-4xl text-center">
            <h1 className="text-6xl font-bold leading-none tracking-normal text-white sm:text-8xl">
              AI脚本运营
            </h1>
            <div className="glass-panel mx-auto mt-10 w-full max-w-md rounded-2xl p-7 text-left">
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-white">{panelTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-[#cbd5e1]">
                  {panelDescription}
                </p>
              </div>
              {children}
              <p className="mt-5 text-center text-sm text-[#cbd5e1]">
                {switchText}
                <Link className="font-semibold text-[#ffb14a]" href={switchHref}>
                  {switchLabel}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
