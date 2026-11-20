import { LinkButton } from "@/components/ui";

export const metadata = { title: "No access" };

export default function Forbidden() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-ink">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-ink-soft">Your role doesn&apos;t include this module. Ask the owner/admin if you need access.</p>
        <LinkButton href="/" className="mt-6">Back to dashboard</LinkButton>
      </div>
    </div>
  );
}
