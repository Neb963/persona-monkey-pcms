// Perchance listing compatibility (04 §F.2). This file is the only place in PCMS that knows
// how Perchance serialises a generator's listing. Domain records, UI, audit text and module
// contracts use GeneratorListing ("PUBLICLY_LISTED" | "UNLISTED") and ObservedListing (+ "UNKNOWN").
import { normalizeGeneratorListing } from "./contract.js";

// desired → provider
export function serializeGeneratorListing(listing) {
  return normalizeGeneratorListing(listing) === "UNLISTED"
    ? Object.freeze({ isPrivate: true })
    : Object.freeze({ isPrivate: false });
}

// provider → observed. Anything but an exact boolean (missing, non-boolean, a new field shape)
// is UNKNOWN, and the caller turns listing capability off (fail closed for listing changes).
export function parseGeneratorListing(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "UNKNOWN";
  const descriptor = Object.getOwnPropertyDescriptor(raw, "isPrivate");
  if (!descriptor || !Object.hasOwn(descriptor, "value")) return "UNKNOWN";
  if (descriptor.value === false) return "PUBLICLY_LISTED";
  if (descriptor.value === true) return "UNLISTED";
  return "UNKNOWN";
}

// Operator wording for the assisted handoff (never the provider field name).
export function describeGeneratorListing(listing) {
  return normalizeGeneratorListing(listing) === "UNLISTED" ? "Unlisted" : "Publicly listed";
}
