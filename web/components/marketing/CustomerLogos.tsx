const BRANDS = [
  { name: "Greg Cafe", style: "font-bold tracking-tight", size: "text-lg" },
  { name: "ארומה", style: "font-black", size: "text-2xl" },
  { name: "BBB", style: "font-black tracking-widest", size: "text-xl" },
  { name: "פיצה פרגו", style: "font-bold", size: "text-lg" },
  { name: "ISRAEL CANADA", style: "font-bold tracking-wider", size: "text-sm" },
  { name: "מגה בול", style: "font-black", size: "text-xl" },
];

export function CustomerLogos() {
  return (
    <section
      className="bg-white border-b border-[#E2E8F0]"
      aria-label="עסקים שמשתמשים בסידור4S"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-14">
        <p className="text-center text-sm font-medium text-[#94A3B8] mb-10">
          מצטרפים לתחושת עבודה חכמה
        </p>
        <div className="flex items-center justify-center gap-10 lg:gap-16 flex-wrap">
          {BRANDS.map((brand) => (
            <span
              key={brand.name}
              className={`${brand.size} ${brand.style} text-[#CBD5E1] hover:text-[#94A3B8] transition-colors duration-200 select-none`}
            >
              {brand.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
