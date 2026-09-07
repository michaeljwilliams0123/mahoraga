/**
 * Thin re-export of Deck-owned pure cockpit helpers.
 * Does not re-export panels/automation-adapter (those pull fleet server modules).
 */
export * from "../../operator-deck/src/lib/cockpit/types";
export * from "../../operator-deck/src/lib/cockpit/denies";
export * from "../../operator-deck/src/lib/cockpit/health";
export * from "../../operator-deck/src/lib/cockpit/local-console";
