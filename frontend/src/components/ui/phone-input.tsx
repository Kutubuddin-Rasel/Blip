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
        inputComponent={React.forwardRef((inputProps, inputRef) => (
          <Input
            {...inputProps}
            ref={inputRef}
            className={cn("font-mono", className)}
          />
        ))}
        value={value}
        onChange={onChange}
        ref={ref}
        {...props}
      />
    );
  },
);

PhoneInputShadcn.displayName = "PhoneInputShadcn";
export { PhoneInputShadcn };
