"use client";
import { LoginResponse } from "@/interface/Auth.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmationResult, signInWithPhoneNumber, User } from "firebase/auth";
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
import { AxiosError, AxiosResponse } from "axios";
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

  const { setUser, setToken } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    AuthService.initCaptcha();
  }, []);

  const handleSendOtp = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    try {
      const confirmation = await AuthService.sendOTP(phoneNumber);
      setConfirmResult(confirmation);
      setStep("OTP");
    } catch (error) {
      console.error("SMS Failed", error);
      alert("Failed to send SMS");
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = (
    response: AxiosResponse<LoginResponse>,
    firebaseUser: User,
  ) => {
    setUser(firebaseUser);
    setToken(response.data.accessToken);
    queryClient.setQueryData(["profile"], response.data.user);
    router.push("/chat");
  };

  const handleVerifyOtp = async () => {
    if (!confirmResult || !otp) return;
    setLoading(true);
    try {
      const { response, firebaseUser } = await AuthService.verifyAndLogin(confirmResult, otp);
      handleAuthSuccess(response, firebaseUser);
    } catch (err) {
      const error = err as AxiosError;
      if (error.response?.status === 404) {
        setStep("NAME");
      } else {
        console.error("Verification Failed", error);
        alert("Invalid code or Server Error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const { response, firebaseUser } = await AuthService.register(name);
      handleAuthSuccess(response, firebaseUser);
    } catch (error) {
      console.error("Registration failed", error);
      alert("Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <Card className="w-auto shadow-xl border-zinc-200 dark:border-zinc-800">
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
                    <InputOTPSlot key={index} index={index} className="w-12 h-12 text-lg" />
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
