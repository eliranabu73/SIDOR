export function SocialProof() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-14 text-center">
        <p className="text-sm uppercase tracking-wider text-muted-foreground">
          מסעדות, רשתות וקמעונאות סומכות עלינו
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {["רשת קפה", "מסעדה שכונתית", "רשת אופנה", "חנות בוטיק"].map(
            (label) => (
              <div
                key={label}
                className="flex h-12 items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground"
              >
                {label}
              </div>
            ),
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          לוגואים אמיתיים יתווספו בקרוב — אתם עדיין יכולים להיות מהראשונים.
        </p>
      </div>
    </section>
  );
}
