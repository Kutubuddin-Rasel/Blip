import * as React from "react";
import PhoneInput from "react-phone-number-input/input";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface PhoneInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange"
> {
  value: string;
  onChange: (value: string | undefined) => void;
  className?: string;
}

const PhoneInputShadcn = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <PhoneInput
        country="BD"
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
