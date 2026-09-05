"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Trash2,
  FlaskConical,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

interface TestBalance {
  balance_paise: number;
  has_balance: boolean;
}

interface TestRequest {
  id: string;
  admin_user_id: string;
  amount_paise: number;
  status: "pending" | "processing" | "paid";
  upi_id: string;
  payment_reference?: string;
  created_at: string;
  processing_at?: string;
  paid_at?: string;
  audit?: Array<{ action: string; by?: string; at?: string }>;
}

function fmtDate(t?: string) {
  if (!t) return "\u2014";
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rupPaise(n: number) {
  return "\u20b9" + Math.round(n / 100).toLocaleString("en-IN");
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-green-100 text-green-800 border-green-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted text-muted"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

async function apiCall(path: string, body?: Record<string, unknown>) {
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers = { ...headers, Authorization: `Bearer ${token}` };
    }
  }
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function TestPayoutSandboxPage() {
  useAuth();
  const [balance, setBalance] = useState<TestBalance | null>(null);
  const [requests, setRequests] = useState<TestRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create payout form
  const [createAmount, setCreateAmount] = useState("500");
  const [creating, setCreating] = useState(false);

  // Process/complete state
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState("");

  // Reset
  const [resetting, setResetting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, reqRes] = await Promise.all([
        apiCall("/api/payout/test/balance"),
        apiCall("/api/payout/test/requests"),
      ]);
      if (balRes.balance) setBalance(balRes.balance);
      if (reqRes.requests) setRequests(reqRes.requests);
    } catch {
      setError("Failed to load test sandbox data");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
  useEffect(() => { refresh(); }, [refresh]);

  const handleSeedBalance = async () => {
    setError(null);
    setSuccess(null);
    try {
      const res = await apiCall("/api/payout/test/balance", { balancePaise: 100000 });
      if (res.error) { setError(res.error); return; }
      setSuccess("Sandbox balance seeded: \u20b91,000");
      await refresh();
    } catch { setError("Failed to seed balance"); }
  };

  const handleCreate = async () => {
    if (!createAmount || creating) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const amountPaise = Math.round(parseFloat(createAmount) * 100);
      if (isNaN(amountPaise) || amountPaise <= 0) {
        setError("Enter a valid amount in rupees");
        return;
      }
      const res = await apiCall("/api/payout/test/request", { amountPaise, upiId: "test-user@upi" });
      if (res.error) { setError(res.error); return; }
      setSuccess(`Test payout of \u20b9${Math.round(amountPaise / 100)} created (pending)`);
      await refresh();
    } catch { setError("Failed to create test payout"); }
    finally { setCreating(false); }
  };

  const handleProcess = async (requestId: string) => {
    setProcessingId(requestId);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiCall("/api/payout/test/process", { requestId });
      if (res.error) { setError(res.error); return; }
      setSuccess("Test payout moved to processing");
      await refresh();
    } catch { setError("Failed to process test payout"); }
    finally { setProcessingId(null); }
  };

  const handleComplete = async (requestId: string) => {
    if (!utrInput.trim()) {
      setError("Enter a TEST-UTR (e.g., TEST-12345678)");
      return;
    }
    setCompletingId(requestId);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiCall("/api/payout/test/complete", { requestId, paymentReference: utrInput.trim() });
      if (res.error) { setError(res.error); return; }
      setSuccess("Test payout marked as paid");
      setUtrInput("");
      await refresh();
    } catch { setError("Failed to complete test payout"); }
    finally { setCompletingId(null); }
  };

  const handleReset = async () => {
    if (!confirm("Reset all test sandbox data? This only affects test tables.")) return;
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiCall("/api/payout/test/reset");
      if (res.error) { setError(res.error); return; }
      setSuccess("Test sandbox reset. No production data was affected.");
      await refresh();
    } catch { setError("Failed to reset test sandbox"); }
    finally { setResetting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/payouts" className="rounded-lg p-2 text-muted hover:bg-muted/50 hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical size={24} className="text-purple-600" />
            Test Payout Sandbox
          </h1>
          <p className="mt-1 text-sm text-muted">
            Isolated test environment. No real money will be sent.
          </p>
        </div>
      </div>

      {/* TEST MODE Banner */}
      <div className="rounded-lg border-2 border-purple-300 bg-purple-50 px-4 py-3 text-sm text-purple-800">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle size={16} />
          TEST MODE — NO REAL MONEY WILL BE SENT
        </div>
        <p className="mt-1 text-xs text-purple-700">
          This sandbox uses separate test-only tables. Production financial records, payout requests, and balances are never modified.
        </p>
      </div>

      {/* Error/Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-500 hover:text-green-700">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted">
          <Loader2 size={20} className="mr-2 animate-spin" />
          Loading test sandbox...
        </div>
      ) : (
        <>
          {/* Sandbox Balance */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Test Balance</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {balance?.has_balance ? rupPaise(balance.balance_paise) : "\u20b90"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Test Payouts</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{requests.length}</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-600">Sandbox Status</p>
              <p className="mt-1 text-sm font-medium text-purple-800">
                {balance?.has_balance ? "Balance active" : "No balance seeded"}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSeedBalance}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              <Banknote size={16} />
              Seed \u20b91,000 Test Balance
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {resetting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Reset Test Data
            </button>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted hover:bg-muted/50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {/* Create Test Payout */}
          {balance?.has_balance && balance.balance_paise > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">Create Test Payout</h3>
              <div className="mt-3 flex items-end gap-3">
                <div>
                  <label className="text-xs text-muted">Amount (\u20b9)</label>
                  <input
                    type="number"
                    value={createAmount}
                    onChange={(e) => setCreateAmount(e.target.value)}
                    min="1"
                    max={Math.floor(balance.balance_paise / 100)}
                    className="mt-1 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createAmount}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Create Test Payout
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Max: {rupPaise(balance.balance_paise)} from sandbox balance
              </p>
            </div>
          )}

          {/* Test Payout History */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">UPI ID</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">UTR / Reference</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted">
                      No test payouts yet. Seed a balance and create a test payout.
                    </td>
                  </tr>
                )}
                {requests.map((req) => {
                  const isProcessing = processingId === req.id;
                  const isCompleting = completingId === req.id;
                  return (
                    <tr key={req.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {rupPaise(req.amount_paise)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{req.upi_id}</td>
                      <td className="px-4 py-3 text-xs text-muted">{fmtDate(req.created_at)}</td>
                      <td className="px-4 py-3">
                        {req.payment_reference ? (
                          <span className="font-mono text-xs text-foreground">{req.payment_reference}</span>
                        ) : (
                          <span className="text-xs text-muted">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {req.status === "pending" && (
                          <button
                            onClick={() => handleProcess(req.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                            Start Test Processing
                          </button>
                        )}
                        {req.status === "processing" && (
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                value={completingId === req.id ? utrInput : ""}
                                onChange={(e) => { setCompletingId(req.id); setUtrInput(e.target.value); }}
                                onFocus={() => setCompletingId(req.id)}
                                placeholder="TEST-12345678"
                                className="w-36 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                              <button
                                onClick={() => handleComplete(req.id)}
                                disabled={isCompleting || !utrInput.trim()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {isCompleting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Mark Test Paid
                              </button>
                            </div>
                            <p className="text-[10px] text-muted">
                              Enter a TEST-UTR (must start with &quot;TEST-&quot;)
                            </p>
                          </div>
                        )}
                        {req.status === "paid" && (
                          <span className="text-xs text-green-600 font-medium">Paid (test)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* How It Works */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <FlaskConical size={20} className="mt-0.5 text-purple-600" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">How the Test Sandbox Works</h3>
                <ol className="mt-2 space-y-1 text-xs text-muted list-decimal list-inside">
                  <li>Seed a test balance (virtual \u20b91,000 in sandbox tables only).</li>
                  <li>Create a test payout request (deducts from sandbox balance).</li>
                  <li>Click &quot;Start Test Processing&quot; (pending \u2192 processing).</li>
                  <li>Enter a TEST-UTR (e.g., TEST-12345678) and click &quot;Mark Test Paid&quot;.</li>
                  <li>Reset Test Data to clear all sandbox data when done.</li>
                </ol>
                <p className="mt-2 text-xs font-medium text-purple-700">
                  This sandbox never modifies production financial_records, payout_requests, or real balances.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
