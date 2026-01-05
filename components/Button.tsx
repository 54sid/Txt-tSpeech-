
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  icon?: string;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'secondary', 
  isLoading, 
  icon, 
  className = '', 
  disabled, 
  ...props 
}) => {
  const baseStyles = "realistic-button flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none";
  
  const variantStyles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 realistic-button-primary",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
    danger: "bg-red-600 text-white hover:bg-red-700 realistic-button-danger"
  };

  return (
    <button 
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <i className="fa-solid fa-circle-notch fa-spin"></i>
      ) : icon ? (
        <i className={`fa-solid ${icon}`}></i>
      ) : null}
      {children}
    </button>
  );
};

export default Button;
