export function Overline({ children, style }) {
  return <div className="overline" style={style}>{children}</div>;
}

export function SectionTitle({ kicker, title, subtitle }) {
  return (
    <div className="mb-6">
      {kicker && <Overline style={{ color: "var(--primary)" }}>{kicker}</Overline>}
      <h2 className="text-3xl md:text-4xl mt-1" style={{ fontWeight: 500 }}>{title}</h2>
      {subtitle && (
        <p className="mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>
      )}
    </div>
  );
}

const gradeColors = {
  WEAK: "#C0392B",
  MODERATE: "#F39C12",
  IMPROVABLE: "#2980B9",
  STRONG: "#27AE60",
};

export function GradeBadge({ grade, size = "md" }) {
  const px = size === "lg" ? "0.5rem 1.1rem" : "0.25rem 0.7rem";
  const fs = size === "lg" ? "1rem" : "0.7rem";
  return (
    <span
      className="mono inline-block font-bold rounded"
      style={{
        background: gradeColors[grade],
        color: "#fff",
        padding: px,
        fontSize: fs,
        letterSpacing: "0.08em",
      }}
      data-testid={`grade-${grade}`}
    >
      {grade}
    </span>
  );
}

export function usd(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
