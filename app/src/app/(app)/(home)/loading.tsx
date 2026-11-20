import { DashboardSkeleton } from "@/components/page-skeleton";

/** Dashboard skeleton (scoped to this route group so other pages keep real HTTP redirects). */
export default function Loading() {
  return <DashboardSkeleton />;
}
