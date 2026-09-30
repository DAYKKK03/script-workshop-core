import Link from "next/link";

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
};

export function ButtonLink({
  href,
  children,
  variant = "primary"
}: ButtonLinkProps) {
  const className =
    variant === "primary"
      ? "focus-ring orange-gradient inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(217,95,19,0.22)] transition hover:brightness-110"
      : "focus-ring inline-flex items-center justify-center rounded-md border border-white/15 bg-white/8 px-4 py-2.5 text-sm font-semibold text-[#f8fafc] transition hover:border-[#ffb14a]/35 hover:bg-white/12";

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-normal text-[#f8fafc]">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#cbd5e1]">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`glass-panel rounded-lg p-5 ${className}`}>{children}</section>;
}

export function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#f8fafc]">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClassName =
  "focus-ring w-full rounded-md border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-[#f8fafc] placeholder:text-[#cbd5e1]/55 transition focus:border-[#ff7a1a]/70";

export const readableBoxClassName =
  "glass-readable rounded-md p-4 text-sm leading-7 text-[#dbe4f0]";

export const dangerMessageClassName =
  "rounded-md border border-[#ff6b5f]/25 bg-[#ff6b5f]/10 px-3 py-2 text-sm leading-6 text-[#ffd3ce]";

export const successMessageClassName =
  "rounded-md border border-[#43d18b]/25 bg-[#43d18b]/10 px-3 py-2 text-sm leading-6 text-[#bff4d8]";
