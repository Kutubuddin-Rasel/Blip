import { AuthSuccessResult, LoginResponse } from "@/interface/Auth.interface";
import api from "@/lib/api";
import { auth } from "@/lib/firebase";
import { ConfirmationResult, signInWithPhoneNumber } from "firebase/auth";
import { RecaptchaVerifier } from "firebase/auth";

export const AuthService = {
  initCaptcha: () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "invisible",
          callback: () => console.log("Captcha Solved"),
          "expired-callback": () => console.warn("Captcha expired"),
        },
      );
    }
  },

  sendOTP: async (phoneNumber: string): Promise<ConfirmationResult> => {
    const verifier = window.recaptchaVerifier;
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  },

  verifyAndLogin: async (
    confirmResult: ConfirmationResult,
    otp: string,
  ): Promise<AuthSuccessResult> => {
    const result = await confirmResult.confirm(otp);
    const firebaseUser = result.user;
    const idToken = await firebaseUser.getIdToken();
    const response = await api.post<LoginResponse>("auth/signin", { idToken });
    return {
      response
    };
  },

  register: async (name: string): Promise<AuthSuccessResult> => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      throw new Error("No firebase user found");
    }
    const idToken = await firebaseUser.getIdToken();
    const response = await api.post("auth/signup", { idToken, name });
    return {
      response
    };
  },
};
