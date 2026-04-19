import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { formatProbability } from "../lib/formatters";

const InteractiveTowerCanvas = lazy(() => import("./InteractiveTowerCanvas"));

const NAV_HEIGHT = 48;

const storySteps = [
  {
    id: "observe",
    index: "01",
    eyebrow: "Telecom Problem",
    title: "Tower faults are usually detected after subscribers feel the drop.",
    copy:
      "NeuralNet5G watches tower telemetry continuously so weak coverage, congestion, and radio instability are seen before they turn into visible service loss.",
    surface: "Live KPI drift, health state, and regional risk context",
    to: "/dashboard",
    linkLabel: "Open overview",
  },
  {
    id: "forecast",
    index: "02",
    eyebrow: "AI / ML Layer",
    title: "A sequence model converts telecom KPIs into an outage forecast.",
    copy:
      "RSRP, SINR, throughput, handover failures, and RTT are scored over time so the model can classify likely fault type and estimate lead time while intervention is still possible.",
    surface: "Model evidence, alert ranking, and prediction window",
    to: "/alerts",
    linkLabel: "Review alerts",
  },
  {
    id: "respond",
    index: "03",
    eyebrow: "Self-Healing Response",
    title: "The dashboard turns ML output into telecom recovery actions.",
    copy:
      "Operations gets a prioritized queue with likely fault class, affected tower, recommended SON adjustment or field dispatch, and expected resolution time.",
    surface: "Tower queue, dispatch order, and ranked recommendations",
    to: "/towers",
    linkLabel: "Inspect towers",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function easeInOut(progress) {
  const clamped = clamp(progress, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function remapProgress(progress, start, end, from, to) {
  return lerp(from, to, easeInOut((progress - start) / (end - start)));
}

function getNarrativePosition(progress) {
  const clamped = clamp(progress, 0, 1);

  if (clamped < 0.14) return 0;
  if (clamped < 0.42) return remapProgress(clamped, 0.14, 0.42, 0, 1);
  if (clamped < 0.56) return 1;
  if (clamped < 0.84) return remapProgress(clamped, 0.56, 0.84, 1, 2);

  return 2;
}

export default function TowerStorySection({ summary, towerCount }) {
  const sectionRef = useRef(null);
  const targetProgressRef = useRef(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let measureFrameId = 0;
    let animationFrameId = 0;

    const updateProgress = () => {
      const element = sectionRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const sectionTop = window.scrollY + rect.top;
      const stickyHeight = window.innerHeight - NAV_HEIGHT;
      const scrollSpan = Math.max(element.offsetHeight - stickyHeight, 1);
      const nextProgress = clamp((window.scrollY - sectionTop) / scrollSpan, 0, 1);
      targetProgressRef.current = nextProgress;
    };

    const handleScroll = () => {
      cancelAnimationFrame(measureFrameId);
      measureFrameId = window.requestAnimationFrame(updateProgress);
    };

    let lastTime = performance.now();
    const animate = (now) => {
      const delta = Math.min((now - lastTime) / 1000, 0.064);
      lastTime = now;

      setScrollProgress((current) => {
        const smoothing = 1 - Math.exp(-delta * 8.5);
        const next = lerp(current, targetProgressRef.current, smoothing);
        return Math.abs(targetProgressRef.current - next) < 0.0005 ? targetProgressRef.current : next;
      });

      animationFrameId = window.requestAnimationFrame(animate);
    };

    updateProgress();
    animationFrameId = window.requestAnimationFrame(animate);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      cancelAnimationFrame(measureFrameId);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const stagePosition = useMemo(() => getNarrativePosition(scrollProgress), [scrollProgress]);
  const cameraProgress = stagePosition / (storySteps.length - 1);
  const activeStepIndex = useMemo(() => Math.round(stagePosition), [stagePosition]);
  const activeStep = storySteps[activeStepIndex] ?? storySteps[0];
  const statusLine = [
    `${summary.critical} critical towers`,
    `${formatProbability(summary.averageRisk)} average risk`,
    summary.highestRisk?.tower_id ? `${summary.highestRisk.tower_id} leads the queue` : `${towerCount} towers in scope`,
  ].join("  ·  ");

  function handleModelWheel(event) {
    const element = sectionRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const stickyHeight = window.innerHeight - NAV_HEIGHT;
    const sectionEnd = sectionTop + element.offsetHeight - stickyHeight;
    const nextScrollY = clamp(window.scrollY + event.deltaY * 1.05, sectionTop, sectionEnd);
    const atTopBoundary = window.scrollY <= sectionTop + 1 && event.deltaY < 0;
    const atBottomBoundary = window.scrollY >= sectionEnd - 1 && event.deltaY > 0;

    if (atTopBoundary || atBottomBoundary) return;

    event.preventDefault();
    event.stopPropagation();
    window.scrollTo({ top: nextScrollY, behavior: "auto" });
  }

  return (
    <section id="tower-story" ref={sectionRef} className="relative min-h-[320vh] bg-black text-white">
      <div className="sticky top-[48px] h-[calc(100svh-48px)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(41,151,255,0.16),transparent_26%),radial-gradient(circle_at_50%_60%,rgba(255,94,77,0.12),transparent_34%),linear-gradient(180deg,#000000_0%,#02060b_100%)]" />

        <div className="relative z-10 mx-auto grid h-full max-w-[1460px] gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[352px_minmax(0,1fr)_296px] lg:gap-6">
          <div className="hidden lg:flex lg:min-h-0 lg:flex-col">
            <div className="relative isolate overflow-hidden rounded-[36px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] px-6 py-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-10 top-6 h-28 w-28 rounded-full bg-[#2997ff]/12 blur-[52px]" />
                <div className="absolute bottom-12 left-16 h-24 w-24 rounded-full bg-[#ff5e4d]/08 blur-[56px]" />
                <div className="absolute inset-y-6 left-0 w-px bg-gradient-to-b from-transparent via-white/12 to-transparent" />
                <div className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              <div className="relative flex items-center gap-3">
                <span className="inline-flex h-2 w-2 rounded-full bg-[#2997ff]" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.18px] text-white/58">
                  AI / ML for Telecom Operations
                </div>
              </div>

              <h1 className="relative mt-5 max-w-[10ch] font-display text-[50px] font-semibold leading-[0.96] tracking-apple-tighter text-white xl:text-[56px]">
                <span className="block">Predict 5G tower</span>
                <span className="block">faults before</span>
                <span className="block">customers notice.</span>
              </h1>

              <div className="relative mt-5 h-px w-20 bg-gradient-to-r from-[#2997ff]/72 via-white/18 to-transparent" />

              <p className="relative mt-5 max-w-[30ch] text-[18px] leading-[1.46] tracking-apple-tight text-white/76">
                NeuralNet5G ingests live telecom telemetry, runs ML-based fault prediction, and recommends self-healing or dispatch actions for the towers most likely to fail in the next 15 to 30 minutes.
              </p>

              <div className="relative mt-7 flex flex-col gap-3">
                <NavLink to="/dashboard" className="app-button-primary w-fit rounded-[999px] px-[18px] py-[10px] shadow-[0_10px_24px_rgba(0,113,227,0.22)]">
                  Open Dashboard
                </NavLink>
                <a href="#operations" className="app-button-secondary-light w-fit rounded-[999px] px-[18px] py-[10px]">
                  Enter operations &gt;
                </a>
              </div>

              <div className="relative mt-8 hidden border-t border-white/8 pt-5 xl:block">
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.12px] text-white/44">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2997ff]" />
                    Ingest KPIs
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/62" />
                    Run ML inference
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ff5e4d]" />
                    Trigger response
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-0 items-center justify-center">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-[14%] h-[38%] w-[38%] -translate-x-1/2 rounded-full bg-[#2997ff]/12 blur-[110px]" />
              <div className="absolute left-1/2 top-[54%] h-[28%] w-[28%] -translate-x-1/2 rounded-full bg-[#ff5e4d]/10 blur-[90px]" />
            </div>

            <div
              className="relative h-full w-full max-w-[640px]"
              onWheelCapture={handleModelWheel}
              style={{ overscrollBehavior: "contain" }}
            >
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-[14px] tracking-apple-caption text-white/56">
                    Loading tower renderer...
                  </div>
                }
              >
                <InteractiveTowerCanvas scrollProgress={cameraProgress} />
              </Suspense>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-6 hidden -translate-x-1/2 lg:block">
              <div className="rounded-apple-pill bg-white/[0.08] px-4 py-2 text-[12px] uppercase tracking-[0.12px] text-white/72 backdrop-blur-[14px]">
                Hover the tower and scrub through the AI story
              </div>
            </div>
          </div>

          <div className="hidden lg:flex lg:min-h-0 lg:flex-col">
            <div className="rounded-[24px] bg-white/[0.06] px-5 py-4 backdrop-blur-[18px]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[12px] uppercase tracking-[0.12px] text-white/44">Story progression</div>
                  <div className="mt-1 text-[15px] leading-[1.24] tracking-apple-tight text-white">
                    Chapter {activeStep.index}
                  </div>
                </div>
                <div className="text-[12px] uppercase tracking-[0.12px] text-white/44">
                  {Math.round(cameraProgress * 100)}%
                </div>
              </div>
              <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-apple-linkDark transition-[width] duration-150"
                  style={{ width: `${Math.max(8, cameraProgress * 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {storySteps.map((step, index) => {
                const relative = index - stagePosition;
                const emphasis = Math.max(0, 1 - Math.abs(relative));
                const isActive = step.id === activeStep.id;

                return (
                  <div
                    key={step.id}
                    className="rounded-[22px] bg-white/[0.04] px-4 py-4 backdrop-blur-[14px] transition-all duration-300"
                    style={{
                      transform: `translateY(${relative * 10}px) scale(${0.95 + emphasis * 0.05})`,
                      opacity: 0.32 + emphasis * 0.68,
                      border: isActive ? "1px solid rgba(41, 151, 255, 0.45)" : "1px solid rgba(255,255,255,0.08)",
                      background: isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-[11px] uppercase tracking-[0.12px] text-white/42">Chapter {step.index}</div>
                      <div className={`h-2 w-2 rounded-full ${isActive ? "bg-apple-blue" : "bg-white/18"}`} />
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.12px] text-white/54">{step.eyebrow}</div>
                    <div className="mt-2 text-[15px] leading-[1.3] tracking-apple-tight text-white">
                      {step.title}
                    </div>
                    {isActive ? (
                      <>
                        <div className="mt-3 text-[14px] leading-[1.42] tracking-apple-caption text-white/70">
                          {step.copy}
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/8 pt-4">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.12px] text-white/36">Surface</div>
                            <div className="mt-1 text-[13px] leading-[1.35] tracking-apple-caption text-white/72">
                              {step.surface}
                            </div>
                          </div>
                          <NavLink to={step.to} className="app-link-dark shrink-0 whitespace-nowrap opacity-90">
                            {step.linkLabel} &gt;
                          </NavLink>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-auto rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4 text-[13px] leading-[1.4] tracking-apple-caption text-white/62 backdrop-blur-[14px]">
              {statusLine}
            </div>
          </div>

          <div className="lg:hidden">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4">
              <div className="w-full max-w-[min(92vw,30rem)] rounded-[28px] bg-black/74 px-5 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-[18px] sm:px-6 sm:py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12px] text-white/46 sm:text-[12px]">
                  {activeStep.eyebrow}
                </div>
                <div className="mt-2 max-w-[16ch] font-display text-[20px] leading-[1.06] tracking-apple-tight text-white sm:text-[24px]">
                  {activeStep.title}
                </div>
                <div className="mt-3 max-w-[34ch] text-[14px] leading-[1.38] tracking-apple-caption text-white/74 sm:text-[15px] sm:leading-[1.42]">
                  {activeStep.copy}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
