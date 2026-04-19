import { formatTimestamp, sentenceCase } from "../lib/formatters";

export default function DispatchTicketPanel({ dispatchTickets = [] }) {
  const latestTicket = dispatchTickets[0] ?? null;

  if (!latestTicket) return null;

  return (
    <div className="surface-panel overflow-hidden border border-red/20 shadow-glow-critical bg-core-surfaceHover">
      <div className="px-5 py-4 border-b border-red/20 flex justify-between items-center bg-red/10">
        <h3 className="text-sm font-bold tracking-wider uppercase text-red">Field Dispatch Required</h3>
        <span className="text-[11px] font-mono border border-red/40 bg-red/20 text-red px-2 py-0.5 rounded">{latestTicket.id}</span>
      </div>
      <div className="px-5 py-4 grid gap-3 text-[13px]">
        <div className="flex justify-between items-center text-core-textMuted border-b border-core-borderLight pb-3">
          <span className="font-mono text-[10px] uppercase">Assigned Team</span>
          <span className="font-bold text-white text-[14px]">{latestTicket.assignedTeam}</span>
        </div>
        <div className="flex justify-between items-center text-core-textMuted border-b border-core-borderLight pb-3">
          <span className="font-mono text-[10px] uppercase">Dispatched At</span>
          <span className="font-medium text-white">{formatTimestamp(latestTicket.timestamp)}</span>
        </div>
        <div className="flex justify-between items-center text-core-textMuted">
          <span className="font-mono text-[10px] uppercase">Target Site</span>
          <span className="font-medium text-white">{latestTicket.towerId}</span>
        </div>
      </div>
    </div>
  );
}
