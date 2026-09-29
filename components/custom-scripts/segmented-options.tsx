type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedOptions<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false
}: {
  legend: string;
  name: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-[#f8fafc]">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              checked={value === option.value}
              className="peer sr-only"
              disabled={disabled}
              name={name}
              type="radio"
              value={option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="custom-script-motion focus-ring flex min-h-11 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-3 text-center text-sm font-medium text-[#cbd5e1] transition hover:border-white/25 hover:bg-white/8 peer-checked:border-[#ff7a1a]/60 peer-checked:bg-[#ff7a1a]/14 peer-checked:text-[#ffd4ad] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#ff7a1a]/70">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
