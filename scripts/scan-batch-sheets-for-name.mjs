/**
 * Grep-through all Mayo batch sheets for one or more surname
 * fragments. Prints the batch #, patient row, and MRN for each hit.
 *
 * Usage:
 *   node scripts/scan-batch-sheets-for-name.mjs <surname1> [<surname2> ...]
 */

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const DIR = "./Mayo Batches";
const needles = process.argv.slice(2).map((s) => s.toLowerCase());
if (needles.length === 0) {
  console.error("Pass one or more surname fragments.");
  process.exit(1);
}

const files = (await readdir(DIR)).filter((f) => extname(f).toLowerCase() === ".pdf");
files.sort();

for (const f of files) {
  const buf = await readFile(join(DIR, f));
  let pages;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    ({ text: pages } = await extractText(pdf, { mergePages: false }));
  } catch (e) {
    console.error(`  ! ${f}: ${e.message}`);
    continue;
  }
  const pagesArr = Array.isArray(pages) ? pages : [pages];
  for (let pi = 0; pi < pagesArr.length; pi++) {
    const lines = pagesArr[pi].split(/\r?\n/).map((l) => l.trim());
    for (let li = 0; li < lines.length; li++) {
      const low = lines[li].toLowerCase();
      for (const n of needles) {
        if (low.includes(n)) {
          console.log(
            `${f}  p${pi + 1}  L${li}  «${lines[li]}»  needle="${n}"`,
          );
        }
      }
    }
  }
}
