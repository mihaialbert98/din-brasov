import { redirect } from "next/navigation";

// The Restaurante admin surface merged into Localuri — every local can now have
// menu/reservation capabilities from a single list. Keep this route as a redirect
// so old bookmarks/links land on the merged page.
export default function AdminRestaurantePage() {
  redirect("/admin/localuri");
}
