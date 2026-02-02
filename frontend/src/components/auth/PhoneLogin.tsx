import { LoginResponse } from "@/interface/axiosInterface";
import api from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmationResult, signInWithPhoneNumber } from "firebase/auth";
import { RecaptchaVerifier } from "firebase/auth/web-extension";
import { useRouter } from "next/router";
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

export default function PhoneLogin() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"PHONE" | "OTP">("PHONE");
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const { setUser, setToken } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "invisible",
          callback: () => console.log("Captcha solved"),
          "expired-callback": () => console.warn("Captcha expired"),
        },
      );
    }
  }, []);

  const handleSendOtp = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    try {
      const verifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        verifier,
      );
      setConfirmResult(confirmation);
      setStep("OTP");
    } catch (error) {
      console.error("SMS Failed", error);
      alert("Failed to send SMS");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmResult || !otp) return;
    setLoading(true);
    try {
      const result = await confirmResult.confirm(otp);
      const firebaseUser = result.user;
      const idToken = await firebaseUser.getIdToken();

      const response = await api.post<LoginResponse>("auth/signin", {
        idToken,
      });

      setUser(firebaseUser);
      setToken(response.data.accessToken);
      queryClient.setQueryData(["profile"], response.data.user);

      router.push("/chat");
    } catch (error) {
      console.error("Verification Failed", error);
      alert("Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <Card className="w-auto shadow-xl border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl">Welcome Back</CardTitle>
          <CardDescription>
            {step === "PHONE"
              ? "Enter your phone number to continue"
              : `Enter the code sent to ${phoneNumber}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {step === "PHONE" && (
            <div className="flex flex-col gap-4">
              <PhoneInputShadcn
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
                    <InputOTPSlot index={index} className="w-12 h-12 text-lg" />
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
              onClick={()=>setStep("PHONE")}
              className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                Change Phone Number
              </button>
            </div>
          )}
          <div id="recaptcha-container"></div>
        </CardContent>
      </Card>
    </div>
  );
}
