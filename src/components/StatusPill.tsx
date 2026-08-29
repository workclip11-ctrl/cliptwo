import type { CampaignStatus, ClipStatus } from "@/lib/types";

type AnyStatus = ClipStatus | CampaignStatus;

const map: Record<AnyStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber/10 text-amber border-amber/20" },
  approved: { label: "Approved", cls: "bg-green/10 text-green border-green/20" },
  payable: { label: "Payable", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  processing: { label: "Processing", cls: "bg-amber/10 text-amber border-amber/20" },
  paid: { label: "Paid", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  failed: { label: "Failed", cls: "bg-red/10 text-red border-red/20" },
  held: { label: "Held", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  rejected: { label: "Rejected", cls: "bg-red/10 text-red border-red/20" },
  open: { label: "Open", cls: "bg-green/10 text-green border-green/20" },
  closed: { label: "Closed", cls: "bg-muted/10 text-muted border-muted/20" },
  draft: { label: "Draft", cls: "bg-amber/10 text-amber border-amber/20" },
};

export function StatusPill({ status }: { status: AnyStatus }) {
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
