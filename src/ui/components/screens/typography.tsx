import { HTMLAttributes } from "react";

export enum TypographyVariant {
  H1 = "h1",
  H2 = "h2",
  BODY = "body",
}

const variantStyles = {
  h1: "!text-[48px] md:!text-[64px] tracking-[-2px] font-light leading-[48px] md:leading-[66px] text-text-primary",
  h2: "!text-[40px] md:!text-[48px] tracking-[-2px] font-light leading-[48px] md:leading-[56px] text-text-primary",
  body: "text-[16px] leading-[28px] text-text-primary",
};

interface TypographyProps {
  children: React.ReactNode;
  variant?: TypographyVariant;
}

export default function Typography({ children, variant = TypographyVariant.BODY, ...props }: TypographyProps & HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props; 
  return (
    <span className={`${variantStyles[variant]} ${className || ""}`} {...rest}>
      {children}
    </span>
  );
}