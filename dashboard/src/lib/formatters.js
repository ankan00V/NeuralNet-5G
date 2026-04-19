export function formatProbability(value = 0) {
  return `${Math.round(value * 100)}%`;
}

export function formatTimestamp(value) {
  if (!value) return "Waiting";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function statusTone(status) {
  if (status === "red") return "border-red/40 bg-red/15 text-red";
  if (status === "amber") return "border-amber/40 bg-amber/15 text-amber";
  return "border-green/40 bg-green/15 text-green";
}

export function statusDot(status) {
  if (status === "red") return "bg-red";
  if (status === "amber") return "bg-amber";
  return "bg-green";
}

export function sentenceCase(value = "") {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
