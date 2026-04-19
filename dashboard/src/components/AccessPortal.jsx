import { Suspense, lazy, useState } from "react";

const LoginTowerCanvas = lazy(() => import("./LoginTowerCanvas"));

const planOptions = [
  {
    id: "sandbox",
    label: "Sandbox",
    price: "Free trial",
  },
  {
    id: "pilot",
    label: "Operator Pilot",
    price: "Paid pilot",
  },
  {
    id: "autonomous",
    label: "Autonomous Ops",
    price: "Enterprise",
  },
];

const operatorOptions = ["Airtel", "Jio", "Vi", "BSNL", "DoT Sandbox"];

const stageMetrics = [
  { label: "Subscribers protected", value: "42K" },
  { label: "Recovery gain", value: "-31%" },
  { label: "Lead window", value: "15 min" },
];

export default function AccessPortal({ onEnter }) {
  const [email, setEmail] = useState("ops@neuralnet5g.ai");
  const [password, setPassword] = useState("");
  const [operator, setOperator] = useState("DoT Sandbox");
  const [plan, setPlan] = useState("pilot");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const selectedPlan = planOptions.find((option) => option.id === plan) ?? planOptions[1];

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onEnter({
        email,
        password,
        operator,
        plan,
        role: "NOC Lead",
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05080f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(41,151,255,0.12),transparent_24%),linear-gradient(180deg,#05080f_0%,#08111b_55%,#09131f_100%)]" />
      <div className="portal-grid pointer-events-none absolute inset-0 opacity-18" />
      <div className="portal-vignette pointer-events-none absolute inset-0" />

      <div className="relative mx-auto flex h-screen max-w-[1500px] items-center px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid h-full max-h-[900px] min-h-0 w-full gap-5 overflow-hidden lg:grid-cols-[minmax(0,1.22fr)_392px]">
          <section className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-[#09121d] shadow-[0_36px_120px_rgba(0,0,0,0.34)] transition-transform duration-700 hover:-translate-y-0.5 hover:shadow-[0_42px_132px_rgba(0,0,0,0.38)]">
            <div className="absolute inset-x-0 top-0 h-[31%] min-h-[180px] overflow-hidden border-b border-white/8">
              <img
                src="/assets/login/telecom-panorama.webp"
                alt=""
                className="h-full w-full object-cover object-center opacity-[0.76] transition-transform duration-[2200ms] ease-out group-hover:scale-[1.018]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,15,0.24),rgba(5,8,15,0.14)_46%,rgba(5,8,15,0.72)_100%)]" />
            </div>

            <div className="absolute inset-x-0 top-[16%] bottom-[18%]">
              <div className="portal-scan absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2997ff]/10" />
              <div className="absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(41,151,255,0.20)_0%,rgba(41,151,255,0.06)_42%,transparent_72%)] blur-[28px]" />
              <Suspense fallback={<div className="h-full w-full bg-black/20" />}>
                <LoginTowerCanvas />
              </Suspense>
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="inline-flex items-center gap-3 rounded-apple-pill border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/66 transition-colors duration-300 group-hover:border-white/14 group-hover:bg-white/[0.05]">
                  <span className="h-2 w-2 rounded-full bg-[#2997ff]" />
                  NeuralNet5G Operator Platform
                </div>
                <div className="text-right text-[11px] uppercase tracking-[0.16em] text-white/38">
                  Telecom AI Operator Entry
                </div>
              </div>

              <div className="grid gap-6 pt-[34%] lg:grid-cols-[minmax(0,1fr)_230px] lg:items-end">
                <div className="max-w-[29rem]">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/40">NeuralNet5G</div>
                  <h1 className="mt-4 max-w-[9ch] font-display text-[40px] font-semibold leading-[0.95] tracking-apple-tighter text-white sm:text-[50px] xl:text-[56px]">
                    AI control for telecom resilience.
                  </h1>
                  <p className="mt-4 max-w-[27rem] text-[15px] leading-[1.56] tracking-apple-tight text-white/66">
                    A professional operator entry built around the field image and the live radiotower twin.
                  </p>
                </div>

                <div className="border-l border-white/10 pl-5 transition-colors duration-300 group-hover:border-white/14">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/36">Focus</div>
                  <div className="mt-3 text-[18px] font-display leading-[1.14] tracking-apple-tight text-white">
                    Human oversight, AI execution.
                  </div>
                </div>
              </div>

              <div className="grid gap-5 border-t border-white/10 pt-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
                <div className="text-[12px] leading-[1.5] tracking-apple-caption text-white/34">
                  Model attribution: 40 meter Radiotower by rsg3tank, exported from the provided Blender source.
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {stageMetrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="border-l border-white/10 pl-4 transition-transform duration-300 hover:-translate-y-0.5 hover:text-white first:border-l-0 first:pl-0"
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/34">{metric.label}</div>
                      <div className="mt-2 text-[21px] font-display leading-none tracking-apple-tight text-white">
                        {metric.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <form
            onSubmit={handleSubmit}
            className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,26,0.94),rgba(8,13,21,0.96))] px-6 py-6 text-white shadow-[0_36px_120px_rgba(0,0,0,0.34)] backdrop-blur-[20px] transition-transform duration-700 hover:-translate-y-0.5 hover:shadow-[0_42px_132px_rgba(0,0,0,0.38)] sm:px-7"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(41,151,255,0.12),rgba(41,151,255,0))]" />

            <div className="relative">
              <div className="section-eyebrow !text-white/46">Operator Access</div>
              <h2 className="mt-2 font-display text-[32px] font-semibold leading-[1.02] tracking-apple-tighter text-white">
                Sign in
              </h2>
              <p className="mt-3 text-[14px] leading-[1.5] tracking-apple-tight text-white/60">
                Enter your assigned operator and deployment tier.
              </p>
            </div>

            <div className="relative mt-6 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/36">Session Route</div>
              <div className="mt-2 text-[17px] leading-[1.18] tracking-apple-tight text-white">NOC Lead · {operator}</div>
              <div className="mt-1 text-[13px] leading-[1.44] tracking-apple-caption text-white/52">
                {selectedPlan.label} · {selectedPlan.price}
              </div>
            </div>

            <div className="relative mt-6 grid gap-3">
              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Work email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-white/16 focus:border-[#2997ff] focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(41,151,255,0.12)]"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-white/16 focus:border-[#2997ff] focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(41,151,255,0.12)]"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Deployment tier</span>
                <select
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-white/16 focus:border-[#2997ff] focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(41,151,255,0.12)]"
                >
                  {planOptions.map((option) => (
                    <option key={option.id} value={option.id} className="bg-[#0b121c] text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Operator workspace</span>
                <select
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                  className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-white/16 focus:border-[#2997ff] focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(41,151,255,0.12)]"
                >
                  {operatorOptions.map((option) => (
                    <option key={option} value={option} className="bg-[#0b121c] text-white">
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="relative mt-auto pt-5">
              <button
                type="submit"
                disabled={submitting}
                className="app-button-primary group w-full justify-center gap-2 bg-[#2997ff] py-4 text-[15px] shadow-[0_18px_40px_rgba(41,151,255,0.22)] hover:bg-[#3ca0ff]"
              >
                <span>{submitting ? "Signing in..." : "Enter Workspace"}</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </button>
              {error ? <div className="mt-3 text-[12px] text-[#ff8a80]">{error}</div> : null}
              <div className="mt-3 text-[12px] leading-[1.44] tracking-apple-caption text-white/42">
                Access is validated against the API session service.
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
