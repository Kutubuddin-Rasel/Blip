import { RecaptchaVerifier } from "firebase/auth/web-extension";

declare global{
    interface Window{
        recaptchaVerifier:RecaptchaVerifier;
    }
}