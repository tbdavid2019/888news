import { redirect } from "react-router";

export function loader() {
  return redirect("/podcast/recommend");
}

export default function PodcastIndex() {
  return null;
}
