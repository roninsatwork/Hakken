import { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  className?: string;
}

export default function Input({ label, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={props.id}>{label}</label>
      <input {...props} className={`${className} border border-gray-300 rounded-md p-2 focus:outline-none`} />
    </div>
  );
}