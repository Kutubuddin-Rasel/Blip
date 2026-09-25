"use client";
import { LoginResponse } from "@/interface/Auth.interface";
import { installSession } from "@/lib/session";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { ConfirmationResult } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { PhoneInputShadcn } from "../ui/phone-input";
import { Button } from "../ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";
import { AxiosResponse, isAxiosError } from "axios";
import { Input } from "../ui/input";
import { AuthService } from "@/services/auth.service";
import { useRouter } from "next/navigation";

export default function PhoneLogin() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"PHONE" | "OTP" | "NAME">("PHONE");
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const sessionNotice = useAuthStore((state) => state.notice);

  const router = useRouter();

  useEffect(() => {
    AuthService.initCaptcha();
  }, []);

  const handleSendOtp = async () => {
    if (!phoneNumber) return;
    setErrorMessage("");
    setLoading(true);
    try {
      const confirmation = await AuthService.sendOTP(phoneNumber);
      setConfirmResult(confirmation);
      setStep("OTP");
    } catch {
      setErrorMessage("Could not send the code. Check the number and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = async (
    response: AxiosResponse<LoginResponse>,
  ) => {
    await installSession(response.data, true);
    try { await signOut(auth); }
    catch { console.warn("Firebase client sign-out failed after Blip session establishment"); }
    router.replace("/chat");
  };

  const handleVerifyOtp = async () => {
    if (!confirmResult || !otp) return;
    setErrorMessage("");
    setLoading(true);
    try {
      const { response } = await AuthService.verifyAndLogin(confirmResult, otp);
      await handleAuthSuccess(response);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) {
        setStep("NAME");
      } else if (status === 429) {
        setErrorMessage("Too many login attempts. Wait a minute, then try again.");
      } else if (isAxiosError(err) && !err.response) {
        setErrorMessage("Network unavailable. Check your connection and try again.");
      } else {
        setErrorMessage(status === 401
          ? "Phone verification expired. Request a new code."
          : "Could not verify the code or start a session. Try again.");
        try { await signOut(auth); } catch { console.warn("Firebase client sign-out failed after exchange error"); }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name) return;
    setErrorMessage("");
    setLoading(true);
    try {
      const { response } = await AuthService.register(name);
      await handleAuthSuccess(response);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setErrorMessage(status === 429
        ? "Too many registration attempts. Wait a minute, then try again."
        : isAxiosError(err) && !err.response
        ? "Network unavailable. Check your connection and try again."
        : status === 409
        ? "This phone is already linked to another account."
        : "Could not create the account. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-full px-4 bg-zinc-50 dark:bg-zinc-900">
      <Card className="w-full max-w-sm shadow-xl border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl">
            {step === "NAME" ? "Finish Registration" : "Welcome Back"}
          </CardTitle>
          <CardDescription>
            {step === "PHONE"
              ? "Enter your phone number to continue"
              : `Enter the code sent to ${phoneNumber}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {sessionNotice && <p role="status" className="text-sm text-zinc-600">{sessionNotice}</p>}
          {errorMessage && <p role="alert" className="text-sm text-red-600">{errorMessage}</p>}
          {step === "PHONE" && (
            <div className="flex flex-col gap-4">
              <PhoneInputShadcn
                country="BD"
                placeholder="Enter your phone number"
                value={phoneNumber}
                onChange={(val) => setPhoneNumber(val || "")}
                className="h-11"
              />
              <Button
                onClick={handleSendOtp}
                disabled={loading || !phoneNumber}
                className="w-full h-11"
              >
                {loading ? "Sending OTP" : "Send code"}
              </Button>
            </div>
          )}

          {step === "OTP" && (
            <div className="flex flex-col items-center gap-6">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <InputOTPSlot key={index} index={index} className="w-9 h-10 text-lg sm:w-12 sm:h-12" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                className="w-full h-11"
              >
                {loading ? "Verifying..." : "Verify & Login"}
              </Button>
              <button
                onClick={() => setStep("PHONE")}
                className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                Change Phone Number
              </button>
            </div>
          )}

          {step === "NAME" && (
            <div className="flex flex-col gap-4">
              <Input
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
              <Button
                onClick={handleRegister}
                disabled={loading || !name}
                className="w-full h-11"
              >
                {loading ? "Creating Account" : "Create Account"}
              </Button>
            </div>
          )}

          <div id="recaptcha-container"></div>
        </CardContent>
      </Card>
    </div>
  );
}
