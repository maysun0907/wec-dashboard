import { permanentRedirect } from "next/navigation";

// /bop was the original "Balance of Performance" page. The 2026
// season's BoP table is no longer published, so the page got
// rebranded into a general /rules reference. Old bookmarks redirect.
export default function BopPage(): never {
  permanentRedirect("/rules");
}
