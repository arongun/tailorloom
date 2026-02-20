"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) toast.error(error.message);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setStep("otp");
      toast.success("Code sent — check your email");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: "email",
    });
    setLoading(false);

    if (error) {
      toast.error("Invalid code. Please try again.");
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } else {
      router.push("/");
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 8 digits are entered
    const code = newOtp.join("");
    if (code.length === 6 && newOtp.every((d) => d !== "")) {
      handleVerifyOtp(code);
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);

    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devPassword.trim()) return;

    setLoading(true);
    const res = await fetch("/api/auth/dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: devPassword.trim() }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      const data = await res.json();
      toast.error(data.error || "Dev login failed");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      toast.success("New code sent");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-[400px] border-slate-200 shadow-sm">
        <CardContent className="p-8">
          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 mb-4">
              <Activity className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
              TailorLoom
            </h1>
            <p className="text-[13px] text-slate-500 mt-1">
              Revenue Intelligence Console
            </p>
          </div>

          {step === "email" ? (
            <>
              {/* Google OAuth */}
              <Button
                onClick={handleGoogleLogin}
                variant="outline"
                className="w-full h-10 text-[13px] font-medium border-slate-200 hover:bg-slate-50"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>

              <div className="flex items-center gap-3 my-6">
                <Separator className="flex-1" />
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  or
                </span>
                <Separator className="flex-1" />
              </div>

              {/* Email input */}
              <form onSubmit={handleSendOtp} className="space-y-3">
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 text-[13px] border-slate-200"
                  required
                />
                <Button
                  type="submit"
                  className="w-full h-10 text-[13px] font-medium"
                  disabled={loading}
                >
                  {loading ? "Sending code..." : "Continue with email"}
                </Button>
              </form>

              {/* Dev mode */}
              <div className="flex items-center gap-3 my-6">
                <Separator className="flex-1" />
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  dev
                </span>
                <Separator className="flex-1" />
              </div>

              <form onSubmit={handleDevLogin} className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Dev password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  className="h-10 text-[13px] border-slate-200"
                  required
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 text-[13px] font-medium border-slate-200 shrink-0"
                  disabled={loading}
                >
                  {loading ? "..." : "Go"}
                </Button>
              </form>
            </>
          ) : (
            /* OTP verification */
            <div className="space-y-6">
              <button
                onClick={() => {
                  setStep("email");
                  setOtp(["", "", "", "", "", ""]);
                }}
                className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 transition-colors -mt-2 mb-4"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>

              <div className="text-center">
                <p className="text-[14px] font-medium text-slate-900">
                  Enter verification code
                </p>
                <p className="text-[12px] text-slate-500 mt-1">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-slate-700">{email}</span>
                </p>
              </div>

              {/* OTP inputs */}
              <div
                className="flex justify-center gap-2"
                onPaste={handleOtpPaste}
              >
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={loading}
                    className="w-11 h-12 text-center text-lg font-semibold text-slate-900 border border-slate-200 rounded-lg bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all disabled:opacity-50"
                  />
                ))}
              </div>

              {loading && (
                <p className="text-center text-[12px] text-slate-500">
                  Verifying...
                </p>
              )}

              <div className="text-center">
                <button
                  onClick={handleResend}
                  disabled={loading}
                  className="text-[12px] text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                >
                  Didn&apos;t get a code? <span className="font-medium underline">Resend</span>
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
