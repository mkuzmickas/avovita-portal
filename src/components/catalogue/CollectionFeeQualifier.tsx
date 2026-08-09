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
 *   - Everything else: "+ from $85 collection fee — charged once per
 *     appointment, not per test."
 *
 * "From $85" not "$85" so extended-range postal codes
 * (Cochrane / Airdrie / Okotoks / Chestermere at $135) don't see a
 * jump-scare on Step 3. "Once per appointment, not per test" is the
 * language that makes the fee feel fair rather than hidden — do not
 * shorten to "one-time" (reads as introductory).
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
      + from $85 collection fee — charged once per appointment, not per test
    </p>
  );
}
