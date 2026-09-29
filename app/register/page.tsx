import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { ColorBends } from "@/components/visual/color-bends";

export default function RegisterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070812] px-5 py-5 text-white">
      <ColorBends
        colors={["#02030a", "#061026", "#0b2b72", "#1658f9", "#ffffff", "#ff7a1a"]}
        frequency={1.18}
        intensity={1.84}
        iterations={2}
        mouseInfluence={0.28}
        noise={0.11}
        parallax={0.18}
        rotation={36}
        scale={0.56}
        speed={0.2}
        warpStrength={1.28}
      />
      <div className="home-flow-band left-[-24%] top-[18%] h-20 w-[158%] rotate-[-18deg] opacity-60" />
      <div className="home-flow-band home-flow-band-secondary bottom-[18%] left-[-26%] h-24 w-[166%] rotate-[-16deg] opacity-45" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(22,88,249,0.1),transparent_28%),linear-gradient(180deg,rgba(7,8,18,0.05),rgba(7,8,18,0.92))]" />
      <div className="absolute inset-2 rounded-[30px] border border-white/10" />

      <section className="relative z-10 grid min-h-[calc(100vh-2.5rem)] place-items-center py-10">
        <div className="mx-auto w-full max-w-4xl text-center">
          <h1 className="text-5xl font-bold leading-none tracking-normal text-white sm:text-7xl">
            Vibe Writing
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-[#cbd5e1] sm:text-xl">
            把链接的视频进行拆解，结合资料生成可以直接复制的新口播脚本。
          </p>

          <div className="auth-card-motion-shell mx-auto mt-10 w-full max-w-md">
            <span className="auth-beam auth-beam-top" />
            <span className="auth-beam auth-beam-right" />
            <span className="auth-beam auth-beam-bottom" />
            <span className="auth-beam auth-beam-left" />
            <span className="auth-corner auth-corner-tl" />
            <span className="auth-corner auth-corner-tr" />
            <span className="auth-corner auth-corner-br" />
            <span className="auth-corner auth-corner-bl" />
            <div className="login-card w-full rounded-2xl p-7 text-left">
              <div className="mb-7 text-center">
                <h2 className="text-2xl font-bold text-white">注册</h2>
                <p className="mt-2 text-sm leading-6 text-[#cbd5e1]">
                  填写账号、密码和邀请码创建工作台账号。
                </p>
              </div>
              <RegisterForm />
              <p className="mt-5 text-center text-sm text-[#cbd5e1]">
                已有账号？
                <Link className="font-semibold text-[#ffb14a]" href="/login">
                  去登录
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
