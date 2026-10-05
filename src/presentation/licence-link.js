// Canonical Creative Commons page for a licence label (pure; no DOM). Version-aware: the version named in the label is
// the version linked ("CC-BY-SA-3.0" -> by-sa/3.0). A label without a version, a public-domain note or any other
// licence gets no link (never a guessed version). The first Creative Commons token of the label decides.
const CC = /\bCC[\s-]?BY(?:[\s-]?(SA))?[\s-]?(\d\.\d)\b/i;

export function licenceLink(licence) {
  const match = CC.exec(String(licence ?? ""));
  if (!match) return null;
  const version = match[2];
  if (!["1.0", "2.0", "2.5", "3.0", "4.0"].includes(version)) return null;
  return `https://creativecommons.org/licenses/${match[1] ? "by-sa" : "by"}/${version}/`;
}
