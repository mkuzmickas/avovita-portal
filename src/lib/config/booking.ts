/**
 * FloLabs booking URL — single source of truth.
 *
 * Historically hardcoded in five different files, one of which
 * drifted to a Jane App URL (flo-labs.janeapp.com) and stayed there
 * for weeks — customers who followed that link were rejected by
 * Jane's authentication because their AvoVita account isn't
 * provisioned there. This constant exists specifically so that
 * class of drift can't happen again: every caller imports from
 * here, changing the URL is one edit.
 *
 * The deep link goes straight to FloLabs's calendar view for their
 * owner id (b536fb59), appointment type (84416067), and calendar
 * id (10968729), skipping the intermediate landing page Acuity
 * would otherwise show. Copy provided by Mike.
 */
export const FLOLABS_BOOKING_URL =
  process.env.NEXT_PUBLIC_ACUITY_EMBED_URL ??
  "https://flolabsbooking.as.me/schedule/b536fb59/appointment/84416067/calendar/10968729?appointmentTypeIds[]=84416067";
