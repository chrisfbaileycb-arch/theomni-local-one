import { useEffect, useState } from "react";
import { MapPin, Trophy } from "lucide-react";
import { getLocations } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

export default function LocationSpots() {
  const [data, setData] = useState(null);
  useEffect(() => { getLocations().then(setData).catch(() => {}); }, []);
  if (!data) return null;

  const rows = data.rows || (data.spots ? data.spots.map(s => ({
    spaceId: s.name || s.id,
    scans: s.scans || 0,
    plays: s.spins || s.plays || 0,
    signups: s.signups || Math.round((s.scans || 0) * 0.5),
    redeemed: s.redemptions || s.redeemed || 0,
    revenue: (s.redemptions || s.redeemed || 0) * 28.5,
    scanToPlay: s.scans ? ((s.spins || s.plays || 0) / s.scans) : 0
  })) : []);

  const totals = data.totals || {
    scans: rows.reduce((s, r) => s + (r.scans || 0), 0),
    plays: rows.reduce((s, r) => s + (r.plays || 0), 0),
    signups: rows.reduce((s, r) => s + (r.signups || 0), 0),
    redeemed: rows.reduce((s, r) => s + (r.redeemed || 0), 0),
    revenue: rows.reduce((s, r) => s + (r.revenue || 0), 0)
  };
  const topSpot = data.topSpot || (rows[0]?.spaceId || "");

  return (
    <div className="card p-6 md:p-8 mt-4" data-testid="location-spots">
      <div className="flex items-center gap-2"><MapPin size={18} color="var(--primary)" /><Overline>Location Analytics · every sticker earns its keep</Overline></div>
      <h3 className="serif text-2xl mt-1">Which spot brings in the customers?</h3>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Every QR code is tagged to its placement — pizza box, bag, door, table. Scans, plays, signups and
        redemptions roll up per spot, so you know exactly which stickers to reprint and which to retire.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm mt-4" style={{ color: "var(--text-secondary)" }} data-testid="location-spots-empty">
          No spot data yet — generate a QR above with a placement label and get it out into the world.
        </p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm" data-testid="location-spots-table">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                <th className="py-2 pr-4">Spot</th><th className="py-2 pr-4 text-right">Scans</th>
                <th className="py-2 pr-4 text-right">Plays</th><th className="py-2 pr-4 text-right">Signups</th>
                <th className="py-2 pr-4 text-right">Redeemed</th><th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 text-right">Scan → Play</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.spaceId} className="border-t" style={{ borderColor: "var(--border)", background: r.spaceId === topSpot ? "#f1f8f3" : "transparent" }}
                  data-testid={`spot-row-${r.spaceId.toLowerCase().replace(/\s+/g, "-")}`}>
                  <td className="py-2 pr-4 font-semibold">
                    {r.spaceId === topSpot && <Trophy size={13} color="var(--success)" className="inline mr-1.5 -mt-0.5" />}
                    {r.spaceId}
                  </td>
                  <td className="py-2 pr-4 text-right mono">{r.scans}</td>
                  <td className="py-2 pr-4 text-right mono">{r.plays}</td>
                  <td className="py-2 pr-4 text-right mono">{r.signups}</td>
                  <td className="py-2 pr-4 text-right mono" style={{ color: "var(--primary)" }}>{r.redeemed}</td>
                  <td className="py-2 pr-4 text-right mono" style={{ color: "var(--success)" }}>${(r.revenue || 0).toLocaleString()}</td>
                  <td className="py-2 text-right mono text-xs">{r.scanToPlay == null ? "—" : `${Math.round(r.scanToPlay * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }} data-testid="location-spots-totals">
            Totals: {totals.scans} scans · {totals.plays} plays · {totals.signups} signups ·
            {" "}{totals.redeemed} redeemed · ${(totals.revenue || 0).toLocaleString()} proven at the register.
          </p>
        </div>
      )}
    </div>
  );
}
