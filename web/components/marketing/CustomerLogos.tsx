const BUSINESSES = [
  "קפה לוין",
  "חנות סלולר אורן",
  "צהרון הפלאי",
  "מסעדת אגדה",
  "מוסך גליל",
  "בית קפה ים",
];

export function CustomerLogos() {
  return (
    <section
      id="customers"
      className="border-b border-border bg-background"
      aria-label="עסקים שמשתמשים בסידור4S"
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
          עסקים שכבר משתמשים בסידור4S
        </p>
        <div className="mt-6 -mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max items-center justify-start gap-3 sm:min-w-0 sm:flex-wrap sm:justify-center sm:gap-4">
            {BUSINESSES.map((name) => (
              <li
                key={name}
                className="inline-flex items-center rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-muted-foreground grayscale transition hover:grayscale-0 hover:text-foreground hover:border-foreground/30"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
