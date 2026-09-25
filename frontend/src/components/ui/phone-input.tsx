import * as React from "react";
import PhoneInput from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface PhoneInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange"
> {
  value: string;
  onChange: (value: string | undefined) => void;
  country?: Country;
  className?: string;
}

const PhoneInputShadcn = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, country, value, onChange, ...props }, ref) => {
    return (
      <PhoneInput
        className={className}
        country={country}
        international
        withCountryCallingCode
        inputComponent={InputComponent}
        value={value}
        onChange={onChange}
        ref={ref}
        {...props}
      />
    );
  },
);

const InputComponent = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <Input
      className={cn("font-mono", className)}
      {...props}
      ref={ref}
    />
  ),
);
InputComponent.displayName = "InputComponent";

PhoneInputShadcn.displayName = "PhoneInputShadcn";
export { PhoneInputShadcn };
