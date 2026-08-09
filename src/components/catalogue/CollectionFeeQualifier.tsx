/**
 * Small qualifier line rendered beneath a test's price — turns the
 * price from a sticker into a total-in-context. Existed nowhere before
 * Aug 2026, and the surprise it removed (customers seeing $85 for the
 * first time on Step 3 of checkout) is the single biggest revenue
 * leak in the funnel.
 *
 * Rendering rules:
 *   - Quote-only tests (price_cad === null): no fee line — nothing
 *     to qualify.
 *   - Kit-collected tests (collection_method === 'self_collected_kit'):
 *     no phlebotomist visit, so no home-visit fee applies. These
 *     have their own courier arrangements described in the individual
 *     test's description.
 *   - Everything else: the qualifier line. Two variants:
 *       - Mobile (< sm, ~380px):
 *           "+ from $85 collection fee — once per appointment"
 *       - Desktop (>= sm):
 *           "+ from $85 collection fee — charged once per appointment,
 *            not per test"
 *
 * Mike's other Claude flagged the full desktop copy wrapping to
 * THREE lines under every price on a phone — 61% of our traffic
 * is mobile, so that was clarifying-turned-shouting. The mobile
 * variant keeps both punches (the $85 number + "once per
 * appointment" reframe) in a single sentence that fits on 1-2
 * lines at 380px.
 *
 * "From $85" not "$85" so extended-range postal codes
 * (Cochrane / Airdrie / Okotoks / Chestermere at $135) don't see a
 * jump-scare on Step 3. "Once per appointment" is the language
 * that makes the fee feel fair rather than hidden — do not shorten
 * to "one-time" (reads as introductory).
 */
interface CollectionFeeQualifierProps {
  hasPrice: boolean;
  collectionMethod: "phlebotomist_draw" | "self_collected_kit" | null | undefined;
  className?: string;
}

export function CollectionFeeQualifier({
  hasPrice,
  collectionMethod,
  className,
}: CollectionFeeQualifierProps) {
  if (!hasPrice) return null;
  if (collectionMethod === "self_collected_kit") return null;

  return (
    <p
      className={`text-xs mt-1 leading-snug ${className ?? ""}`}
      style={{ color: "#6ab04c" }}
    >
      <span className="sm:hidden">
        + from $85 collection fee — once per appointment
      </span>
      <span className="hidden sm:inline">
        + from $85 collection fee — charged once per appointment, not per test
      </span>
    </p>
  );
}
