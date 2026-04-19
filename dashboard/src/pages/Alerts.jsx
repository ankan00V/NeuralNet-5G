import AlertFeed from "../components/AlertFeed";
import RecommendationPanel from "../components/RecommendationPanel";
import { useLiveNetwork } from "../context/WebSocketContext";

export default function Alerts() {
  const { towers, demoEnabled } = useLiveNetwork();

  return (
    <section className="pb-6 text-apple-dark">
      <div className="overflow-hidden rounded-[28px] bg-black px-6 py-8 text-white shadow-apple-lift sm:px-8 sm:py-10">
        <div className="section-eyebrow text-white/56">AI Alert Console</div>
        <h2 className="mt-2 font-display text-[32px] font-semibold leading-[1.08] tracking-apple-tighter sm:text-[40px]">
          Review model-ranked telecom faults before they cascade.
        </h2>
        <p className="mt-3 max-w-[620px] text-[17px] leading-[1.47] tracking-apple-tight text-white/76">
          The queue is ordered by machine-scored failure probability. Review which tower is most at risk, what fault
          class the model predicts, and which telecom intervention should be executed first.
        </p>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <AlertFeed towers={towers} maxItems={50} expanded demoEnabled={demoEnabled} />
        <RecommendationPanel towers={towers} />
      </div>
    </section>
  );
}
